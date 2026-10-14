# Code review — ticket #231

Ticket: [#231 The settings "Updates" section](https://github.com/aloong-planet/agentshed/issues/231)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md)

- Date: 2026-10-14
- Version: branch `feat/settings-updates` on dab4da4, uncommitted working tree (the change as it will be
  committed for this ticket's PR)
- Scope: every file this ticket changes — the version record, settings' check record, the switch's preference
  handler, the update contract's two new parsers and type, the IPC channels and launch arguments, the
  main-process wiring, the preload, the version row's rules, the Updates section and its wiring through the
  settings page and App, six dictionaries and the distinctions test's accepted list, the theme styles, the
  semver dependency, and the tests (unit and e2e)

## Underlying premises

- semver precedence (a pre-release below its formal release, `beta` below `beta.2`): the version record's
  tests assert it, and a string comparison in its place turned them red.
- The development run and the installed copy share userData, which is why only a run that checks for updates
  reads and writes the version record. Checked rather than assumed: the development name is `agentshed`
  (package.json `name`), the packaged one `Agentshed` (electron-builder `productName`), and on this Mac both
  paths resolve to the same inode on APFS (case-insensitive). The comment says "on macOS's default
  case-insensitive volume", which is what was observed.
- Settings cannot read its check record before it exists: `startUpdates()` (which builds the record, with the
  post-update line as its first outcome) runs in the same synchronous `whenReady` callback as `createWindow()`,
  and the window's IPC is served only after that callback returns. So the record's constructor needs no push.
- Comments that state causes, each checked: the two "ties … and wins by coming after it" in theme.css — the
  hovered unavailable controls were measured (`evidence/ticket-231/README.md`: the hover is real, and the
  unavailable look holds); "Playwright waits for an aria-disabled control to become available" — observed in
  the first e2e run, where three such clicks timed out and one landed after the check.
- The prototype's copy and colours: taken from the confirmed settings prototype; the button reuses the app's
  existing `.cfg-btn` (the uninstall dialog's), whose base form is the prototype's.

## Runnability

- Settings' check record, every path in and out: a settings check (checking → its outcome); a check that
  joins one in flight (stays checking through the update it finds, then no outcome); an update found by any
  check (the outcome goes, so a failed download leaves the line empty); the post-update line (the run's first
  outcome, replaced by a settings check, cleared by a find); answers that are not outcomes (in flight,
  unavailable → none). Unit cases for each; the found-clearing and the post-update line also by e2e mutation.
- The version record: missing, unreadable, older, equal, newer records; a record that cannot be written logs
  and lets the launch go on (self-harm only: the next run compares with the older record and may show the line
  once more).
- A development run: no source, so settings' controls are unavailable (from the launch argument) and the
  record is neither read nor written (e2e).
- Failure paths and their escape surface:
  - `SettingsChecks.check()` leaves `checking` set if the controller's check ever rejected. Today it cannot —
    the controller turns every source failure into an outcome, and only a contract violation in its own
    publish would reject — but if it did, "Check now" would stay unavailable for the run. Self-harm (the
    settings row only). Refactor list.
  - A renderer click on an unavailable control: the component returns early, and if it did not, the main
    process would still not act (a settings check joins the one in flight; an install outside "ready" is
    ignored). Not observable either way, so the guard is defence in depth.
- The save failure of the switch: the existing preference pattern (optimistic, then the stored value wins; a
  failure toasts in the UI language).

## Security

- No new outbound request: "Check now" asks the same controller check (app-update::CON-001).
- Everything that crosses IPC is validated at the entry: the check outcome (a version only if it is a release
  version; an in-flight state only if it is one), settings' check record, the switch's value (boolean only,
  else `invalidPref`), and the running version from the launch argument (shown only if it is a release
  version). No natural language crosses (app-update::CON-003).
- A renderer that asked for checks repeatedly would only spend this app's own GitHub request allowance; each
  request still goes through the controller's join.

## Consistency

- Spec departures, written back in step 7: the request from settings does not name its surface — it is
  settings' own channel, and the main process keeps settings' check record for the run (so the line survives
  leaving the page and hears of an update found by any check); and the version record is read and written
  only by a run that checks for updates.
- Conventions followed: the preference handler (validate, then the store), the preload's validation on every
  update payload, the "a push overtakes the read on mount" rule of the update button, launch arguments for
  values fixed for the run, the settings card-and-rows form, the dialog button's form.
- Class names: `.ver`, `.ver-ctl`, `.chk-out` had no prior use (searched in theme.css and in the components'
  markup, with `.frow` as the control that does hit); `.cfg-btn` is reused on purpose and its new states are
  scoped to the version row so the uninstall dialog's buttons keep their look.
- The dictionaries' distinctions test flagged French "Activé" / "Désactivé" for the switch, the same words as
  the plugins' enabled states. Accepted in the test's list with its reason (the switch turns an enabled state
  on; the source language's short words are a length choice), not by changing the confirmed copy.
- Smells, for the code this change introduced:
  - Duplicated code: the Updates section repeats the update button's subscription with "a push overtakes the
    read on mount". Refactor list.
  - Mysterious name, exempted: the line's "installing" text reuses `update.tipInstalling` — the same string in
    every language, by the prototype's copy; renaming the key would reopen #230's code for no behaviour.
  - Long conditional: the line's text is a six-way ternary over the line's kinds. Exempted: it is the one
    mapping from the rules' kinds to copy, read top to bottom; a table would need the version argument
    threaded through it.

## Refactor list

| Item | Reason | Impact | Suggested | Owner's decision |
|---|---|---|---|---|
| One hook for "the update lifecycle in the renderer" (subscribe, read on mount, a push overtakes the read), used by the update button and the Updates section | Duplicated code: the rule that keeps a stale read from overwriting a newer push lives in two places | Self-contained (a divergence would show a stale state in one surface until the next push) | Do now: two users, about fifteen lines | Do it (2026-10-14). Done, below |
| `SettingsChecks.check()` resets `checking` in a `finally` | A rejected check would leave "Check now" unavailable for the run | Self-harm (the settings row only); unreachable today | Do now: two lines | Do it (2026-10-14). Done, below |

### The two refactors (done 2026-10-14)

- `useUpdateState(onPush?)` holds the rule; the update button passes its tooltip reset as `onPush` (the reset
  must run on the push itself, which is why it is a callback rather than an effect on the state), and the
  Updates section takes the state alone. Every renderer use of the lifecycle channels, searched: only the
  hook (e2e polls them, which is reading, not subscribing). Settings' check record keeps its own
  subscription in the Updates section, its one user, and says it follows the same rule.
- `SettingsChecks.check()` resets `checking` in a `finally`; a rejected check still rejects to the request
  that asked, with the outcome unchanged.
- Safety net: the existing cases on both surfaces; a new unit case for the rejected check (red first); the
  hook's push callback removed → the tooltip case red.

## Conclusion

No bug found. Two spec departures written back; both refactor items done at the owner's request. The rest holds: typecheck,
lint, 821 unit tests and 128 e2e (24 new) pass in `pnpm verify`.
