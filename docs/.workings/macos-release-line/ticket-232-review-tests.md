# Test review — ticket #232

Ticket: [#232 "Check for Updates…" in the application menu](https://github.com/aloong-planet/agentshed/issues/232)
· feature `macos-release-line` · spec [app-update](../../specs/app-update.md), [i18n](../../specs/i18n.md)

- Date: 2026-10-14
- Version: branch `feat/menu-check-updates` on bf77387, uncommitted working tree, after the code review
- Scope: `src/main/app-menu.test.ts` (two cases added, one widened), `src/shared/update.test.ts` (the
  notice's two cases), `src/renderer/src/update-toasts.test.ts` (5), `e2e/menu-check-updates.spec.ts` (6)

## Coverage

| Item of #232 | Covered by |
|---|---|
| app-update::US-003/AC-01 | e2e: up to date naming the version, failed; unit: `noticeToast` |
| app-update::US-003/AC-03 (menu) | e2e: a menu find shows the rail's download |
| app-update::US-003/AC-04 | e2e: downloading, ready and installing each toasted, no request; unit: `noticeToast` |
| app-update::US-003/AC-05 (menu) | e2e D4, both orders: one request |
| app-update::US-005/AC-02 (menu) | unit: the template's enabled flag; e2e: disabled in a development run, a click reports nothing |
| app-update::REQ-005 | unit: position, six languages, enabled flag, click through the injected action; e2e: the installed menu's order, label and enabled flag; Evidence: the owner's screenshot of the native menu, 2026-10-14 ([evidence/ticket-232/](evidence/ticket-232/README.md)) |
| app-update::QR-001/AC-01 (menu strings) | Gate: `pnpm typecheck` (dictionary type), `pnpm check:i18n` |
| app-update::CON-003 (menu IPC) | unit: `parseUpdateNotice` accepts the outcome and refuses a malformed one |
| Failure A6 (menu) | e2e: a malformed version → "Couldn't check for updates" |
| Failure B2 (toast) | e2e: no second toast after a failed download |
| Failure D4 | e2e: both orders |
| Failure G2 (menu) | e2e: the installed item reads French after the switch; a toast already shown keeps its English |
| Failure G6 (menu) | e2e: the update toast and the language toast stack |
| i18n "The application menu" (legacy) | unit: the template's structure (⌘, settings, ⌘R reload, the new item) |

Gaps, with their conditions:

- What macOS draws: the native menu is outside automation (the i18n spec's known gap). The e2e reads the
  menu the main process installed; the picture is accepted by the owner's screenshot (2026-10-14) of a local
  package built from 2b1b703 ([evidence/ticket-232/](evidence/ticket-232/README.md)): the item directly
  below "About Agentshed", enabled, in English as the interface language.

## Case design

- The template is tested as the pure function it is; the e2e drives the item through the installed menu
  (the item's own click, in the main process) — the closest seam to the user's click automation can reach.
- Toasts are recorded with a MutationObserver from the moment the case starts recording, so "no second toast"
  is asserted over every toast shown, not only those still on screen (they live 3.2 s).
- Counts asserted: requests at the scripted source (the requirement is "no request").
- No implementation coupling: no module mocks, no internal state read.

## False greens

Cases red first on their assertion: the template's three (the widened click case included), the notice's
accepting case, `noticeToast`'s four. Cases written after their code, each proven by a mutation (built
before e2e runs, restored by copy and compared):

| Case | Mutation | Red as |
|---|---|---|
| `noticeToast`: a development run reports nothing | "unavailable" toasts | unit red; the e2e development-run case red too |
| notice refuses a malformed outcome | the outcome not validated | the refusal case |
| e2e development run | the item always enabled | `enabled: true` |
| e2e position | the item below the separator | the order |
| e2e in-flight states | ready reported as found | "Expected … is ready to install" |
| e2e language switch | the menu not rebuilt on a switch | the label stays English |
| e2e no second toast (B2) | (test side) a toast dispatched after the failure | the recorded list grows |

Found and fixed while writing: two cases first failed on "no toast host" — the recorder was attached before
the window's first render; it now waits for the app's toast host. A false red, in the test.

## Conclusion

Coverage complete for #232's items; the native menu's picture is accepted by the owner's screenshot
(2026-10-14). Every after-code case proven able to fail.
