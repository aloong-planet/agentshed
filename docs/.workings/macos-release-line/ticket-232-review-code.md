# Code review — ticket #232

Ticket: [#232 "Check for Updates…" in the application menu](https://github.com/aloong-planet/agentshed/issues/232)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md), [i18n](../../specs/i18n.md)

- Date: 2026-10-14
- Version: branch `feat/menu-check-updates` on bf77387, uncommitted working tree (the change as it will be
  committed for this ticket's PR)
- Scope: the menu template and its tests, the update notice contract and its tests, the notice-to-toast
  mapping and its tests, the update button's notice handler, the main process's menu check and notice
  sending, six dictionaries, the e2e spec

## Underlying premises

- A menu item's own `click()`, called in the main process, runs the handler a real click runs: the e2e
  reaches the controller through it (requests recorded), and seven mutations of the code behind it turned
  its cases red.
- The menu is rebuilt after a language switch by the existing `setLanguage` handler: the e2e reads the new
  label from the installed menu, and removing the rebuild turned that case red.
- The copy reused for three menu toasts — "Couldn't check for updates", "Version x is ready to install",
  "Installing update…" — is the confirmed prototype's menu-toast copy in all six languages, word for word the
  settings line's and the update button's; the two new toasts are the prototype's own. The item's label
  outside Chinese is copy only (the native menu is not in the prototype).
- `updateChoice()` is pure over the packaged flag and the environment, so the menu, built before the update
  controller starts, already knows whether this run checks for updates.

## Runnability

- Paths: a click before the controller exists answers "unavailable", which no toast reports; a click while
  a check is in flight joins it (D4, both orders, one request); a click while an update downloads, is ready
  or installs makes no request and reports that state; a find starts the download and toasts once — a
  failed download after it adds nothing (B2).
- The notice now carries two kinds; every notice crosses `sendUpdateNotice`, which validates it on the way
  out (the install failure's notice did not before), and the preload validates it on the way in.
- Failure escape: `menuCheck` is fire-and-forget from the menu; the controller's check does not reject, so
  only a contract violation in the notice would surface, as an unhandled rejection in the main process with
  no toast. Self-harm (that one click goes unanswered).

## Security

- The outcome crosses as codes and validated versions (CON-003); a malformed version from the feed becomes a
  failure before it reaches any toast (A6, e2e).
- No new outbound request: the menu runs the same controller check.

## Consistency

- Spec departure, written back in step 7: the menu check's outcome reaches the renderer as a one-off notice,
  the channel the install failure already used, rather than as the answer to a renderer request (the menu
  asks from the main process).
- The i18n spec's known gap said the menu's rebuild after a switch could only be accepted by hand; the e2e
  now reads it from the installed menu. Rewritten in step 7, keeping "what macOS draws" as the gap.
- The update button's component now answers every update notice with a toast. Exempted: it is the update
  surface that is always mounted, and it already handled the one notice there was; the mapping itself lives
  in `update-toasts.ts`.
- Class-level check, "every update notice gets its toast from one mapping": both kinds (install failed, menu
  check) go through `noticeToast`; no other `onUpdateNotice` subscriber (searched).
- Smells: none in the code introduced. The e2e file repeats the fixture helpers of the other update e2e files
  — the repository's e2e files are self-contained by pattern.

## Refactor list

None.

## Conclusion

No bug found; one spec departure and one outdated test-gap statement to write back. Typecheck, lint, 830 unit
tests and 135 e2e (6 new) pass in `pnpm verify`.
