# Code review — ticket #230

Ticket: [#230 Automatic app updates with the update button](https://github.com/aloong-planet/agentshed/issues/230)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md)

- Date: 2026-10-14
- Version: branch `feat/app-update-button` on 5911d52, uncommitted working tree (the change as it will be
  committed for this ticket's PR)
- Scope: every file this ticket changes — the update controller and sources, the update contract, the
  automatic-checks preference, the IPC channels and preload, the main-process wiring, the rail's bottom
  group and update slot, icons, dictionaries, theme styles, the regenerated prototype icon file, and the
  tests (unit and e2e)

## Underlying premises

Findings, all checked against the library's source or by a run rather than assumed:

- electron-updater 6.8.9's API as used — `checkForUpdates()` resolving `{ isUpdateAvailable, updateInfo,
  downloadPromise, cancellationToken }`, rejecting on failure; `download-progress` carrying `percent`;
  `setFeedURL` with a GitHub provider; `allowPrerelease` defaulting from the running version — read in
  `out/AppUpdater.js`, `out/providers/GitHubProvider.js`. Holds.
- **Not holding (fixed)**: "ready" was taken to mean the update can install. On macOS the download promise
  resolves when Squirrel.Mac has fetched the ZIP from electron-updater's local proxy
  (`MacUpdater.updateDownloaded`, the response's `finish`), which is before Squirrel has checked and staged
  the package (`update-downloaded` on Electron's native updater). A package Squirrel rejects would have
  shown a ready button, and a click after the rejection would wait on an `update-downloaded` that never
  comes: an install stuck forever. The spec counts "a package that fails verification" as a failed download
  (Failure B2). The adapter now resolves the download only when Squirrel has the update staged, and rejects
  on Squirrel's error.
- Comments stating causes, new in this change: two claimed that a sleeping Mac pauses the timer's clock.
  Not measured here, so both now state only what the code does and why it does not depend on it. The
  others are backed (the native title's delay is an existing statement in theme.css; the bottom-anchor
  mechanism is proven by the e2e geometry case and its mutation; electron-updater's pre-release default by
  its source).

## Runnability

Lifecycle states and their paths, compared with the spec's table and sequences A–C:

| State | Entered from | Left by | Implementation |
|---|---|---|---|
| idle | start; up to date; failed check; malformed answer; failed download; failed install | a check | as specified |
| checking | idle, by a check | answer (found → downloading; up to date / failure → idle) | joins further checks |
| downloading | checking | download done → ready; failure → idle | checks answer in-flight, install ignored |
| ready | downloading | click → installing | checks answer in-flight |
| installing | ready, by the click | success: the app quits; failure → idle + notice | further clicks ignored |

Findings:

- **Bug (fixed, test first)**: when a found version fails validation the controller cancels its download,
  and the cancelled download's rejection was observed by nothing. In the main process an unhandled
  rejection escapes upward (the process's uncaught-error path). The fake source now rejects on cancel, as
  the real one does; the case went red with five unhandled rejections, then green with the rejection
  observed.
- Class-level check ("an async result whose rejection nobody observes"), all instances in the change: the
  check in flight, the found download (both branches), the install, the timer's check, the lazy import, the
  staging wait, the scripted download, the scripted install — observed. The renderer's state read on mount
  and its install call reject only on a contract violation or an untrusted sender: self-contained (the slot
  stays idle), the same pattern as the existing preference read; left as is.
- Failure escape surfaces: a failed check, download or install only affects the update lifecycle and
  returns to idle (self-contained); the main-process exit validation throws only on a programming error.
- Race: the state read on mount versus a push — the push wins (`pushed` flag); subscription precedes the
  read, so no push is lost in between.
- Not reachable by a test: the restart path itself and the Squirrel staging wait run only in an installed
  copy. Gap recorded; covered by evidence in #240 (two real releases).

## Security

- The release feed is external: only a validated version string crosses IPC (contract checks on both
  sides), and no release text reaches the renderer (Failure H1).
- The two new channels go through the `handle()` wrapper, so the sender check applies (security ledger
  item 17).
- The renderer's CSP is unchanged; the requests are the main process's own, over HTTPS to GitHub, and the
  package is applied only after Squirrel's signature check (H2).
- The e2e seam (`AGENTSHED_UPDATE_SCRIPT`) can be set by whoever controls the environment, like the other
  `AGENTSHED_*` seams: it can only fake states and append to a log next to the named file; a scripted
  install never installs anything. Accepted.

## Consistency

- Contract rules: channels and types in `src/shared`, validation at both ends (ADR-0001); no natural
  language crosses IPC — a code for the notice, dictionaries for every word (ADR-0016).
- The rail: `.ri.set` stays as the Settings button's hook (e2e uses it); its margin rule moved to the new
  bottom group, so nothing else changed for the existing rail tests (`.rail .ri` count 3 with no update).
- Existing preference tests asserted whole objects; they now carry the new field — expected, not a
  regression.
- Smells, for the code this change introduced:
  - Speculative generality: `check()` took an origin it never used. Removed in this review (no behaviour
    change). Recorded here because removing it is a tidy-up that went ahead without asking first.
  - Speculative generality, exempted: the manual-check outcomes (`inFlight`, `unavailable`) have no
    production caller until #231 and #232. They are the controller's half of the spec's lifecycle table,
    tested now, so the next tickets add surfaces rather than reopening the state machine.
  - Repeated switches: "downloading, ready or installing" is spelled out in four places (the contract
    check, the controller, the slot twice). See the refactor list.
  - Duplicated code: the slot's two element branches repeat the anchor ref and tooltip. See the refactor list.

## Refactor list (for the owner's decision; not done)

| Item | Reason | Impact | Suggested |
|---|---|---|---|
| One predicate for "an update in flight" (downloading, ready or installing) in the contract module, used by the controller and the slot | Repeated switches; a fourth phase would need four edits | Self-contained (a missed edit misreports only the update slot) | Do now, before #231 adds a fifth use |
| Keep one element for the slot across phases, or move focus when the element changes | When focus sits on the downloading slot and it becomes the ready button, focus is lost and an open tooltip stays until the pointer moves | Self-contained (the tooltip's text stays right) | Not doing: rare, and the form is the confirmed prototype's |

## Conclusion

Two bugs fixed (the unobserved cancelled download, with a test; ready before Squirrel staged the package,
by reading the library's source — no test can reach it). The refactor list awaits the owner. Typecheck,
lint and the controller's tests are green after the fixes; the full gateway runs again before delivery.
