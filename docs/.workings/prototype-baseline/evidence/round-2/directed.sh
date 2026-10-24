#!/bin/bash
# Directed verification after the test review's fixes: lint, the gates that read the work records, and the probes
# (the committed copies under evidence/round-2) on the implementation, on the base, and on two mutated copies.
# Usage: directed.sh <log file> <scratch dir>
W=/Users/loong_zhou/CascadeProjects/agentshed-wt/proto-fixes
cd "$W" || exit 2
LOG="$1"; T="$2"
EV="$W/docs/.workings/prototype-baseline/evidence/round-2"
: > "$LOG"
{
  echo "# Directed verification log"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "HEAD: $(git rev-parse HEAD)"
  echo "git status --porcelain --untracked-files=all:"
  git status --porcelain --untracked-files=all | while IFS= read -r line; do
    f="${line:3}"
    if [ -e "$f" ]; then echo "  $line  hash-object=$(git hash-object "$f")"; else echo "  $line  (deleted)"; fi
  done
  echo "(end of status)"
} >> "$LOG"
{
  echo "trees: base = git archive 1349d76 (whole tree); mutated copies = this HEAD's docs/prototypes plus build/icon.png,"
  echo "  each with one substitution (perl, as written in directed.sh beside this log):"
  echo "  regex:  visibility/logic.js   .replace(/^\\S+ ignored: /  ->  .replace(/^\\S+ IGNORED: /   (prefix and regex unpaired)"
  echo "  throw:  prototype-session.html  a setTimeout that throws, inserted before 'let rendered=false;'"
  echo "  dead:   visibility/index.html   entry handler returns at once for data-new=\"missing\""
  echo "  keep:   install-flow/index.html the entry handler's 'lastEvent = null;' removed"
  echo "  same:   visibility/index.html   both entry buttons call SM.initial(false)"
} >> "$LOG"
# Trees: the base commit's whole tree; five mutated copies of the implementation's prototypes with build/icon.png
rm -rf "$T/base" "$T/mut-regex" "$T/mut-throw" "$T/mut-dead" "$T/mut-keep" "$T/mut-same"
mkdir -p "$T/base" && git archive 1349d76 | tar -x -C "$T/base"
for m in mut-regex mut-throw mut-dead mut-keep mut-same; do
  mkdir -p "$T/$m/docs" "$T/$m/build" && cp -R "$W/docs/prototypes" "$T/$m/docs/" && cp "$W/build/icon.png" "$T/$m/build/"
done
perl -pi -e 's{\.replace\(/\^\\S\+ ignored: /}{.replace(/^\\S+ IGNORED: /}' "$T/mut-regex/docs/prototypes/project-list/visibility/logic.js"
perl -0pi -e "s{(  let rendered=false;\n)}{  setTimeout(()=>{ throw new Error('mutation: a script error') },0);\n\$1}" "$T/mut-throw/docs/prototypes/session-view/prototype-session.html"
# A dead entry button: visibility's "missing" entry does nothing
perl -0pi -e "s{(b.addEventListener\('click', function\(\)\{\n)(        lastEvent = null;\n        state = SM.initial\(b.getAttribute\('data-new'\) === 'missing'\);)}{\$1        if (b.getAttribute('data-new') === 'missing') return;\n\$2}" "$T/mut-dead/docs/prototypes/project-list/visibility/index.html"
# An entry that keeps the last receipt: install-flow's entry handler no longer clears lastEvent
perl -0pi -e "s{        lastEvent = null;\n(        state = SM.initial\(b.getAttribute\('data-new'\)\);)}{\$1}" "$T/mut-keep/docs/prototypes/skill-install/install-flow/index.html"
# Two entry buttons, one entry: visibility's both buttons start the directory-present entry
perl -pi -e "s{state = SM.initial\(b.getAttribute\('data-new'\) === 'missing'\);}{state = SM.initial(false);}" "$T/mut-same/docs/prototypes/project-list/visibility/index.html"
{
  echo "mutation reached (regex): $(grep -c 'IGNORED: ' "$T/mut-regex/docs/prototypes/project-list/visibility/logic.js") line(s) in visibility/logic.js"
  echo "mutation reached (throw): $(grep -c 'mutation: a script error' "$T/mut-throw/docs/prototypes/session-view/prototype-session.html") line(s) in prototype-session.html"
  echo "mutation reached (dead entry): $(grep -c "=== 'missing') return;" "$T/mut-dead/docs/prototypes/project-list/visibility/index.html") line(s) in visibility/index.html"
  echo "mutation reached (same entry): $(grep -c 'state = SM.initial(false);' "$T/mut-same/docs/prototypes/project-list/visibility/index.html") line(s) in visibility/index.html"
  echo "mutation reached (receipt kept): lastEvent = null now $(grep -c 'lastEvent = null' "$T/mut-keep/docs/prototypes/skill-install/install-flow/index.html") time(s) in install-flow/index.html (3 before)"
} >> "$LOG"
run() {  # run <expected> <command...>
  local expected="$1"; shift
  echo "" >> "$LOG"
  echo "===== command: $*   (expected: $expected)" >> "$LOG"
  "$@" >> "$LOG" 2>&1
  local code=$?
  echo "===== exit code: $code" >> "$LOG"
}
run "exit 0" pnpm lint
run "exit 0" pnpm check:lang
run "exit 0" pnpm check:nul
run "exit 0 (implementation)" node "$EV/verify-pages.cjs" "$W/docs/prototypes"
run "exit 1 (base commit: the changed checks red)" node "$EV/verify-pages.cjs" "$T/base/docs/prototypes"
run "exit 1 (regex mutation: visibility's tooltip check red)" node "$EV/verify-pages.cjs" "$T/mut-regex/docs/prototypes"
run "exit 1 (throw mutation: the session page's script-error check red)" node "$EV/verify-pages.cjs" "$T/mut-throw/docs/prototypes"
run "exit 1 (dead entry: visibility's two missing-entry checks red)" node "$EV/verify-pages.cjs" "$T/mut-dead/docs/prototypes"
run "exit 1 (receipt kept: install-flow's after-an-event entry checks red)" node "$EV/verify-pages.cjs" "$T/mut-keep/docs/prototypes"
run "exit 1 (same entry: visibility's distinct-status check red)" node "$EV/verify-pages.cjs" "$T/mut-same/docs/prototypes"
run "exit 0 (implementation)" node "$EV/probe-session-fail.cjs" "$W/docs/prototypes"
run "exit 1 (base commit)" node "$EV/probe-session-fail.cjs" "$T/base/docs/prototypes"
echo "" >> "$LOG"
echo "git status after: $(git status --porcelain --untracked-files=all | wc -l | tr -d ' ') line(s)" >> "$LOG"
