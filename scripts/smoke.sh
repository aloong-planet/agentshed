#!/bin/bash
# The dev smoke run: start → wait for it to actually finish one scan → catch main-process errors → kill
# the parent to verify orphan protection.
#
# **Coexists with an already-running instance** (changed 2026-08-04; the root cause postmortem is in
# docs/postmortems/2026-08-04-smoke-silent-lock-exit.md):
#   - userData isolation: the dev app starts via `pnpm dev -- --user-data-dir=<temp dir>` (measured:
#     electron-vite passes the argument through and Electron honours it — e2e uses the same mechanism,
#     and zero pollution of the real archive has been verified).
#     The single-instance lock is scoped by userData, so once isolated it does not contend with the
#     user's running app
#     — previously, with the lock taken, the app this script started would app.exit(0) and die silently,
#     which is the root cause of three false reds.
#   - Process group isolation: set -m puts background jobs in their own process group, so every probe and
#     kill only touches our own tree
#     (pgrep/kill by pgid), never harming the user's instance.
#   - The data scanned is still the real ~/.claude (that is HOME's business, unrelated to userData); a
#     fresh
#     userData every time = a deterministic full scan every time (~6s) — a gate wants determinism, not
#     the speed of a warm cache.
#     The "migrating an old-format cache" scenario belongs to e2e (with a seeded cache fixture) and was
#     never something smoke should be expected to stumble into.
#
# Always poll until the condition holds rather than using a fixed sleep (changed 2026-08-03):
#   a false red costs more than slowness: once a gate has flickered a few times, "just run it again"
#   becomes the habit, and it stops being a gate.
# Timeouts leave ample headroom over the measured magnitude, and the actual durations are printed — so a
# future slowdown is visible rather than quietly creeping toward the timeout.
set -u
set -m   # Background jobs get their own process group: $! is the pgid, bounding every probe and kill
cd "$(dirname "$0")/.."
LOG=/tmp/agentshed-smoke.log
# The signature of an Electron main process in our group (both the quiet copy and the official dist path
# contain this segment).
# **Do not** put the repository's absolute path in the regex: a worktree, /tmp→/private/tmp, or a pnpm
# layout change makes it hang
# (2026-08-06: with CascadeProjects/agentshed hard-coded, a /tmp worktree gave a 60s false red).
# Instances outside the group are isolated by userData and never enter our pgid, so recognising the
# Electron binary is enough within the group.
ELECTRON_BIN='Electron.app/Contents/MacOS/Electron'
SMOKE_UD=$(mktemp -d /tmp/agentshed-smoke-ud.XXXXXX)
CACHE="$SMOKE_UD/token-cache.json"
# The real userData's cache: used only as a diagnostic control for "the redirect broke"; this script
# never writes it
REAL_CACHE="$HOME/Library/Application Support/agentshed/token-cache.json"

START_TIMEOUT=60   # First launch on a fresh userData; measured ~1.1s to a process, with ample headroom
READY_TIMEOUT=60   # A full scan of real data measures ~6s (600MB+), a tenfold margin.
                   # A historical lesson: this timeout gave three false reds whose real cause was not
                   # slowness but **death** (a taken lock and a silent exit)
                   # — now that userData is isolated there is no lock to contend for, so anything that
                   # reaches the timeout is a real timeout.
EXIT_TIMEOUT=15    # Measured ~1.4s: the main process polls its parent every 1s (see
                   # src/main/index.ts), plus the cost of exiting

now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
DEVPID=""
alive() { [ -n "$DEVPID" ] && pgrep -g "$DEVPID" -f "$ELECTRON_BIN" >/dev/null 2>&1; }
cleanup() {
  [ -n "$DEVPID" ] && kill -9 -- "-$DEVPID" 2>/dev/null
  rm -rf "$SMOKE_UD"
}
die() {
  echo "SMOKE_FAIL: $1"
  # The scene has to be preserved: three investigations had no evidence because the caller grepped this
  # output away (the 2026-08-04 postmortem)
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "Full log saved to: $KEEP"
  tail -25 "$LOG"
  cleanup
  exit 1
}

# An existing instance is only reported, never blocked — coexistence is a feature once isolated. Filter
# by comm, since pgrep -f gets false positives from
# path strings in other processes' argv (a pkill command line, say) — matching a path is not the same as
# matching the process itself.
# The reporting scope: this product's Agentshed.app, or an Electron whose argv contains agentshed (a dev
# instance).
OTHERS=$(pgrep -f "Agentshed.app/Contents/MacOS/Agentshed|agentshed.*$ELECTRON_BIN|$ELECTRON_BIN.*agentshed" 2>/dev/null | while read -r p; do
  case "$(ps -o comm= -p "$p" 2>/dev/null)" in
    *Electron | *Agentshed) echo "$p" ;;
  esac
done | tr '\n' ' ')
[ -n "$OTHERS" ] && echo "(existing instance detected, pid=$OTHERS — userData is isolated, so they do not affect each other and none will be killed by mistake)"

REAL_BEFORE=$(stat -f %m "$REAL_CACHE" 2>/dev/null || echo 0)

# The two pieces of test silencing (see src/main/index.ts and scripts/quiet-electron.sh):
#   AGENTSHED_NO_FOREGROUND — the window is not shown and does not steal foreground focus;
#   ELECTRON_OVERRIDE_DIST_PATH — use the LSUIElement=true copy, so the Dock icon does not even flash
#   (the icon is registered from the plist during native bootstrap, and JS's dock.hide() cannot catch up).
bash scripts/quiet-electron.sh
export ELECTRON_OVERRIDE_DIST_PATH="$PWD/node_modules/.cache/electron-quiet/dist"
# electron-vite **does not go through** electron/index.js (it reads path.txt and assembles the path
# itself, measured in the lib source),
# so that variable has no effect on it; it honours its own ELECTRON_EXEC_PATH, so both are set
export ELECTRON_EXEC_PATH="$PWD/node_modules/.cache/electron-quiet/dist/Electron.app/Contents/MacOS/Electron"
AGENTSHED_NO_FOREGROUND=1 pnpm dev -- --user-data-dir="$SMOKE_UD" > "$LOG" 2>&1 &
DEVPID=$!
T0=$(now_ms)
until alive; do
  (( $(now_ms) - T0 > START_TIMEOUT * 1000 )) && die "electron did not start within ${START_TIMEOUT}s (in this process group)"
  sleep 0.2
done
UP_MS=$(( $(now_ms) - T0 ))

# The readiness criterion is "the scan finished": the app atomically writes token-cache.json at the end
# of every scan (inside the isolated directory,
# where a fresh directory guarantees the first scan writes), so an mtime appearing means the scan really
# ran; a silent failure goes red on the timeout.
T1=$(now_ms)
until [ "$(stat -f %m "$CACHE" 2>/dev/null || echo 0)" -gt 0 ]; do
  if ! alive; then
    die "electron started and then exited (main process crash? see the log below)"
  fi
  if (( $(now_ms) - T1 > READY_TIMEOUT * 1000 )); then
    # A discriminating diagnosis: the isolated cache untouched while the real one moved =
    # --user-data-dir pass-through broke
    # (an electron-vite upgrade dropping it, say), and the app went off to write the real userData
    REAL_NOW=$(stat -f %m "$REAL_CACHE" 2>/dev/null || echo 0)
    if [ "$REAL_NOW" -gt "$REAL_BEFORE" ]; then
      die "userData redirection failed: the isolated cache was not updated but the real one was — check that pnpm dev forwards --user-data-dir"
    fi
    die "first scan did not finish within ${READY_TIMEOUT}s (isolated cache not updated)"
  fi
  sleep 0.3
done
READY_MS=$(( $(now_ms) - T1 ))

ERRS=$(grep -iE "Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:|uncaught" "$LOG" | head -5)

EPID=$(pgrep -g "$DEVPID" -f "$ELECTRON_BIN" | head -1)
# A race guard: the app may crash right after writing the readiness artifact — with no EPID, the
# kill-parent and orphan checks
# would both spin on nothing, and if the log also has no error line that is a false green. After
# readiness the process must still be alive; if not, fail.
[ -z "$EPID" ] && die "the ready artifact was written but the electron process is gone (crashed right after writing?)"
PARENT=$(ps -o ppid= -p "$EPID" | tr -d ' ')
T2=$(now_ms)
kill -9 "$PARENT" 2>/dev/null
LEFT=1
while (( $(now_ms) - T2 <= EXIT_TIMEOUT * 1000 )); do
  if ! alive; then LEFT=0; break; fi
  sleep 0.2
done
DOWN_MS=$(( $(now_ms) - T2 ))

# Always exit with context: echoing only the matching lines throws the scene away (the 2026-08-03 lesson)
if [ -n "$ERRS" ]; then
  echo "SMOKE_FAIL main process reported errors:"; echo "$ERRS"
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "Full log saved to: $KEEP"
  echo "--- last 25 lines of $LOG ---"; tail -25 "$LOG"
  cleanup
  exit 1
fi
if [ "$LEFT" != "0" ]; then
  echo "SMOKE_FAIL: orphan guard did not work (electron did not exit within ${EXIT_TIMEOUT}s)"
  echo "--- processes still alive in this group ---"; pgrep -g "$DEVPID" -fl "$ELECTRON_BIN"
  KEEP="/tmp/agentshed-smoke-fail-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$KEEP" 2>/dev/null && echo "Full log saved to: $KEEP"
  echo "--- last 25 lines of $LOG ---"; tail -25 "$LOG"
  cleanup
  exit 1
fi
cleanup
echo "SMOKE_OK: startup ${UP_MS}ms · first scan ${READY_MS}ms · self-exit after parent kill ${DOWN_MS}ms; no errors, no orphans"
