# Test review — #273

Ticket: [#273](https://github.com/aloong-planet/agentshed/issues/273) · feature `global-search` · branch
`feat/global-search-shortcut`. Scope: the application menu's new item (a unit at the template's seam) and the way
it opens the search page with the focus in its box (e2e through the application menu).

## Design review

Checked 2026-10-20. Implementation version: 84d5ae0 (main, where the work began). Requirement source: the
global-search spec (US-004/AC-01, AC-02, J10, CON-004 for the menu item) and the i18n spec's application menu, as
quoted in #273.

### Test design table

Seams: the menu template, a pure function of the language and the injected actions (`app-menu.test.ts`, the
precedent for every menu item); and e2e under the built app over #271's fixture home, where the native menu is
reached as the application-menu e2e reaches it — the installed item taken by its id in the main process and its
own click called, which runs the handler a click runs. Focus is asserted with Chromium's focus emulation turned on
through CDP, as `token-span.spec.ts` does, since the test window is never shown.

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| U1 (new) | app-menu.test · "Search Sessions…" in the Edit menu | US-004/AC-02 (place, accelerator, copy); CON-004 for the item | the template | each of the six languages | the Edit menu's last three entries are the select-all role, a separator and the item (`id` `searchSessions`, `accelerator` `CmdOrCtrl+Shift+F`); its label is the language's own and differs between languages; English "Search Sessions…" and French "Rechercher dans les sessions…" as literals; no other item in the menu carries the accelerator | none | none |
| U2 (changed) | app-menu.test · the injected actions | US-004/AC-02 ("does what the shortcut does": the item calls the action, it touches no window) | the template | every item's click called in menu order | the actions called, in order: updates, settings, search — literals | none | none |
| E12 (new) | global-search.spec · ⌘⇧F through the application menu | US-004/AC-01 (from settings, from a session page, from the search page itself); US-004/AC-02 (the installed item and its copy after a language switch); J10 | e2e; the item's own click; focus emulation | the installed Edit menu read; a keyword typed on the search page, then settings and the item; a hit's session page, then the item; the search page with the focus moved to its sort switch, then the item; the language switched to French in settings, then the item | the installed Edit menu ends with a separator and the item ("Search Sessions…", `CmdOrCtrl+Shift+F`); each time the search page shows with the keyword as left and its box focused; after the switch the installed item reads "Rechercher dans les sessions…" (polled) and opens the page, titled "Recherche", its box focused — literals | #271's home | one launch |
| Header (changed) | global-search.spec · its known-gaps note | — | — | — | the note that focus is not asserted goes, as E12 asserts it; a note for the keystroke itself comes in (below) | — | — |

The keystroke itself. Measured 2026-10-20 on this branch's base build with the existing ⌘, item: in the test's
window, neither Playwright's key press nor Electron's `webContents.sendInputEvent` reached the application menu — the
page stayed on Agents (why is not established here; the observation is what the design rests on)
([probe](evidence/ticket-273/probe-accel.spec.ts), [output](evidence/ticket-273/probe-accel-output.txt)). So the
binding is asserted on the installed item, the handler through the item's click, and the key press itself is not
automated; the test file's header states it.

Capability: per the project's capability declaration, `mutation-testing` is not enabled, so mutation testing is
skipped. Red first is required only of a test reproducing a bug; none of these does.

### Dimension 1: Coverage

The spec units this ticket owns, against the table: US-004/AC-01 E12 from settings, from a session page and from the
search page itself ("from any page"); US-004/AC-02 U1 (place, accelerator, copy in each language), U2 (the action),
E12 (the installed item, its copy after a switch, and the item doing what the shortcut does); J10 E12; CON-004 for
the item, the gates (`pnpm typecheck` fails on a key missing in a language, `pnpm check:i18n`) and U1. The i18n
spec's application menu line is AC-02.

Derived boundary, from "from any page": the search page itself, with the focus elsewhere — the page does not
remount there, so its box's own autofocus does not run; E12 drives it by moving the focus to the sort switch
first.

Each claimed boundary names its input: settings is reached by the rail's settings item; the session page by a hit;
the focus elsewhere by a click on the sort switch; the language by the settings page's selector.

Not covered, and stated: the key press itself (above); which language macOS draws the menu in (the i18n spec's
known gap — the installed item's label is asserted, not what is drawn).

Fixture: #271's home, unchanged; nothing here reads a data shape of its own.

### Dimension 2: Case design

No red flag. No module of the project is replaced (U1, U2 call the template; E12 runs the built app). Nothing private
is read; the installed menu is read through Electron's own menu API in the main process, the precedent's way. No
state is written around the window: the item's own click is the menu's path, and every other step is a click or a
keystroke in the window. No call count; U2's order is the menu's own order, the thing the test names. Focus
emulation changes how the hidden window reports focus, not which element the page focuses.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: the focus assertion follows a step that moves the focus away (the sort switch) or a page switch,
  so a box that keeps a stale focus cannot pass it; U1's "no other item" needs the whole menu read.
- Tautology: the expected values are literals (the English and French copy, the accelerator, the id, the order);
  U1's per-language label is compared with the dictionary and, separately, between languages, so a hard-coded label
  fails it.
- Stale path: the assertions read the menu the main process installs today and the page the rail shows today.

### Dimension 4: Resource reuse

The build, once per `pnpm e2e`; E12 one launch through the file's `launch`, with its own home and userData, as every
case here does; U1 and U2 none.

## Post-implementation check

Checked 2026-10-20, independently of the implementing agent: run by a separate sub-agent that wrote none of the
change and worked from the inputs alone (the two specs, this record, `git diff 84d5ae0 HEAD`, the gateway log).
Implementation version checked: 03a5ba3 on `feat/global-search-shortcut` (HEAD). Its code and tests are cecebad's —
03a5ba3 changes documents and adds the gateway log only — and cecebad changed only the test file's header note after
2882abc. Ticket [#273](https://github.com/aloong-planet/agentshed/issues/273), feature `global-search`. Scope: U1, U2,
E12 and the test file's header against the test design table above, and the full gateway run on cecebad
([log](evidence/ticket-273/verify-cecebad.log): `pnpm verify`, exit 0 as reported; the chain is joined by `&&` and its
last step ends `SMOKE_OK`).

Read for this check: both specs whole; #273's body (read only); this record; `ticket-273-tasks.md`,
`ticket-273-review-code.md`, `ticket-273-doc-sync.md`; the coverage checklist's planned-verification rows for
US-004/AC-01, AC-02, CON-004, J10 and its #273 rows; the probe and its output; the gateway log whole;
`src/main/app-menu.ts`, `src/main/app-menu.test.ts`, `e2e/global-search.spec.ts` whole, the launcher and menu helpers
of `e2e/menu-check-updates.spec.ts`, `e2e/global-setup.ts`, `playwright.config.ts`, and the changed main, preload and
renderer code. `docs/.workings/global-search/` was listed with its hidden and ignored entries.

Capability: per the project's capability declaration (`capabilities.toml`, read with a TOML parser),
`mutation-testing` is not enabled, so mutation testing is skipped; each test's "when does it go red" is answered below
against the code under test and the source of its expected values, and no temporary change was made to the tree.
`e2e-suite` is enabled (`pnpm e2e`), and the gateway ran it.

Re-run here: `pnpm exec vitest run src/main/app-menu.test.ts` on 03a5ba3, 10 passed. E12 was not re-run: no code
changed after cecebad, whose gateway run shows it green (log line 536).

### The written tests against the test design table

| # | Written as designed? |
|---|---|
| U1 | Yes: the template seam; the six languages; the three-entry tail; id, accelerator, the label against each language's dictionary entry; the English and French copy as literals; six distinct labels; the accelerator on no other item. No fixture, no resource. |
| U2 | Yes: every item's click in menu order, the actions as literals. The case name still speaks of the settings entry only; the failing assertion would name all three actions, so no change is recommended. |
| E12 | Yes for the seam (the installed item's own click, focus emulation through CDP), the inputs, the fixture (#271's home through `mkHome`) and the resource (one launch). One difference: the table's "each time the search page shows with the keyword as left" is asserted on two of the four arrivals (from settings, from the session page); the arrival on the search page itself asserts the sort as left instead, and the arrival after the language switch the page title. F5. |
| Header | Yes: the note that focus is not asserted is gone and the key press note is in. The note has no re-test condition. F1. |

### Dimension 1: Coverage

- The spec units against the cases: US-004/AC-01, E12 from settings, from a hit's session page and on the search page
  itself; US-004/AC-02, U1 (place, accelerator, copy in each language), U2 (the item calls the action) and E12 (the
  installed item, its copy after a switch); CON-004 for the item, `pnpm typecheck`, `pnpm check:i18n`, `pnpm check:ui`
  (log lines 6–7, 335–379) and U1; J10, E12; the i18n spec's application menu line, U1 and E12. Covered, with F1's gap.
- Each claimed boundary names its input. Settings: the rail's `.ri.set`. The session page: a hit, with E12 waiting for
  the located question before choosing the item. The search page itself: the sort switch takes the focus
  (`not.toBeFocused` is asserted), the page does not remount, and the only sources of focus for the box in
  `src/renderer` are its `autoFocus` (`GlobalSearchPane.tsx:87`, on mount) and the request effect (`:48`) — every
  `.focus(` and `autoFocus` under `src/renderer` searched — so this arrival is carried by the request alone. The
  language: the settings page's selector.
- The Agents page and a project page are not driven: they reach the branch settings reaches (the page mounts and its
  `autoFocus` runs). No finding.
- The derived async boundary, the item chosen while a hit's jump is pending, is not driven. F2.
- The key press itself is a stated gap without a re-test condition, and no hand acceptance of it is recorded. F1.
- Fixture: nothing new reads a data shape; #271's home is reused, its session lines in a real session's line shape.
  No finding.

### Dimension 2: Case design

| Red flag | U1 | U2 | E12 |
|---|---|---|---|
| A project module replaced (`vi.mock`, `vi.spyOn`) | none | none | none |
| A cast past visibility, or internal state written for setup | none: type narrowing on the template's own options | none | none: `item.click` is Electron's public `MenuItem.click`, cast only from its `Function` type |
| Internal call count or order | none | the order of the injected actions, which is the menu's order — the design review's stated exemption, upheld | none |
| A side channel instead of the interface | none | none | the installed menu read through Electron's `Menu` API in the main process, the only reachable surface of a native menu (precedent: `menu-check-updates.spec.ts`); focus read through the DOM |
| A state the public path cannot reach | none | none | the item's click is called without the event, window and web contents a real dispatch passes; the handler reads none of them. What the call does not check is F3 |

Isolation: E12 has its own home and userData and closes them in `finally`. No red flag; no finding in this dimension.

### Dimension 3: False greens

When each test goes red:

- U1: the item not last in the Edit menu, or not after a separator directly after select-all; a wrong id or
  accelerator string; a label other than the language's own dictionary entry; the English or French copy changed; two
  languages sharing a label (a hard-coded label); another template item naming the exact string `CmdOrCtrl+Shift+F`.
  Not seen: an equivalent spelling of the chord or a role's default accelerator (F4); the item disabled, hidden or its
  accelerator not registered (F3).
- U2: the item's click calling no action or another one; the items' order changing.
- E12: the installed Edit menu's tail differing (separator, id, label, accelerator); after an item click, the page not
  switching to search, the keyword not kept (arrivals one and two), the box not focused, the sort not kept (arrival
  three), the French label not installed after the switch, the page title not the French one, or a handler error on
  stderr. Not seen: F2, F3.
- Constant truth: none. The box does not exist before the click in arrivals one, two and four (the page is unmounted),
  and arrival three asserts `not.toBeFocused` first. Playwright 1.62's focused state requires
  `activeElement === node` and `document.hasFocus()` (`_activelyFocused` in `playwright-core/lib/coreBundle.js`), so
  without the focus emulation the assertion fails rather than passes.
- Tautology: the expected values are literals, except U1's per-language label, which the literals and the
  distinct-label check back.
- Stale path, read timing: the installed menu is read from the running main process; `applyMenu()` runs synchronously
  after `createWindow()` (`src/main/index.ts:683–684`), so the first, non-polled read is not early; the French label is
  polled on the asserted expression itself; the DOM assertions retry.
- Conditional skip, assertions that may not run: none. `clickSearchSessions` throws when the item is missing;
  `editMenuTail` returns an empty list, which fails `toEqual`; U1's loop runs over the six-entry `LANGUAGES` tuple.
- E12's UI assertions against review-code's false-greens list: form two (a synthetic path standing in for the real
  one) applies — the item's own click stands in for the key press. The substitution is stated (F1's subject); what it
  leaves unasserted is F3. Forms one and five: the assertions are on effects (dimension class, value, focus, title)
  and retry or poll on the asserted expression. No gate or command-line check is introduced; the other forms do not
  apply.

### Dimension 4: Resource reuse

Counted from the gateway's full run:

| Resource | Cost | Times built or loaded in the run | Provided by | Against the table |
|---|---|---|---|---|
| The build (main, preload, renderer) | about 1.5 s (log lines 405–427) | once: each bundle "built in" once, before the 147 cases | `pnpm e2e` (`electron-vite build && playwright test`) | matches |
| E12's app launch | under 1 s: a whole case with one launch took 644 ms (log line 530), E12 with its steps 1.2 s | once in E12: one `launch(home)`, no relaunch (launches are not logged; counted from the code) | the file's `launch`, per case with its own userData, which E12 writes (the language preference) | matches |
| `mkHome`'s fixture home | 9–12 ms over five builds (a scratch copy of the helper, run outside the tree) | once in E12 | per case | not expensive |
| U1, U2 | the menu unit file runs in 5–6 ms | — | — | matches |

No finding.

### Findings

| # | Dimension | Case or file | What is wrong | Evidence | Recommended change |
|---|---|---|---|---|---|
| F1 | Coverage | `e2e/global-search.spec.ts` header; the coverage checklist's US-004/AC-01 and J10 rows; #273's Product acceptance | The key press note states the gap and what stands in for it, but no re-test condition; no hand acceptance of ⌘⇧F is recorded anywhere. The link from the key to the item (macOS's and Electron's dispatch) is checked by nothing, yet the checklist's #273 rows conclude "Passed" for AC-01 and J10, and the checklist's planned verification and #273's Product acceptance still say the e2e "triggers the menu accelerator", which it does not | header lines 12–15; checklist lines 79, 100, 193, 196; #273's body; the probe | Add the re-test condition to the note (accepted by hand: in a running app, ⌘⇧F from settings, a session page and the search page itself shows the page with the cursor in the box; automated once a key event the system delivers reaches the menu in the test's window). Have #273's user-path acceptance (the checklist names #273 for it) cover the key press and record it with its evidence; until then the key-press part of AC-01 and J10 reads Unverified, not Passed. Reword the planned verification and #273's Product acceptance line to the test that runs (the installed item and its click) plus the hand acceptance. Optional: name the case for what it drives ("Search Sessions… (⌘⇧F) through the application menu's item") |
| F2 | Coverage | E12; `App.tsx` menu handler | The handler drops a pending jump from a hit (`jumpSeq.current++`, `App.tsx:221`), which the code review states as behaviour, but no case chooses the item while a jump is pending. E12's four item clicks, the only callers (lines 729, 737, 746, 755), each come with no jump pending (from settings; after the session page was drawn; after the sort click; from settings), and E12 launches without the fetch delay. Removing that line keeps every case green (by reading; mutation testing not enabled). In use: ⌘⇧F during the hold after a hit click would show the search page focused, then the jump would land on the session page | `App.tsx:116–120, 128–144, 220–224`; `ticket-273-review-code.md` Runnability | Add a row to the test design table, design-review it, then write it through `/tdd`: launch with `AGENTSHED_FETCH_DELAY_MS` (as the jump case does), click a hit whose page is not cached, choose the item while the search page holds, wait past the delay, and assert the search page and its focused box remain with no session page drawn. The expectation has no spec row (J9 covers two hits only): add a J row for an entry chosen while a hit's session is on its way (the owner's decision, the spec being the requirement authority), or record it in the table as a derived boundary, as the design review did for the search page itself. Not established here: whether the rail entries' and the Settings item's identical drop are driven in other e2e files (`global-search.spec.ts`, read whole, does not drive them) |
| F3 | False greens | E12 (`editMenuTail`, `clickSearchSessions`); U1 | Calling the installed item's `click` runs the handler whatever the item's `enabled`, `visible` and `registerAccelerator` say, and no test reads them. An item with `enabled: false` (as the neighbouring "Check for Updates…" has in a development run), hidden, or with `registerAccelerator: false` keeps U1 and E12 green while the key press and the menu choice do nothing, or the item is not shown | Electron 43's `MenuItem` wraps `click` as a call of the role's action or the given handler with no check of `enabled` (`lib/browser/api/menu-item.ts`, read from the source embedded in the Electron Framework binary); the three properties are public on the installed item (`electron.d.ts`, `class MenuItem`) | Have `editMenuTail` also return the item's `enabled`, `visible` and `registerAccelerator`, expected `true` as literals — the installed values, so the defaults Electron applies are what is checked |
| F4 | False greens | U1, "no other entry in the menu carries it" | The check compares explicit `accelerator` strings with `===` on the template, so a second item with the chord spelled another way (`Shift+CmdOrCtrl+F`, `CommandOrControl+Shift+F`) or a role whose default is the chord passes. Nothing collides today | the assertion at `app-menu.test.ts:123–124`; Electron's role defaults (read from the same embedded source) mix spellings (`Shift+CmdOrCtrl+R`, `Shift+CommandOrControl+Z`) and none is the chord | Compare a normalised chord (one token for Cmd, Command, CmdOrCtrl and CommandOrControl; modifiers sorted), preferably over the installed menu in E12, whose items carry their roles' default accelerators; or narrow the comment to what is checked. Low |
| F5 | Coverage (the table against the written test) | E12 | The table says each arrival shows the keyword as left; arrivals three and four do not assert it. Arrival four follows a remount after the language switch | `e2e/global-search.spec.ts:742–757` | Assert `toHaveValue('notarize')` on arrivals three and four, or narrow the table's wording and re-review the row. Low |

### Document sync these findings call for

Not done by this check. F1: the checklist's #273 rows for US-004/AC-01 and J10 (their conclusion, and the planned
verification wording) and #273's Product acceptance on GitHub; an item for each in
[the document sync checklist](ticket-273-doc-sync.md). F2: the test design table, a verification row in the checklist
once written, and, if the owner adds it, a failure-mode row in the global-search spec. F3–F5: the test design table's
U1 and E12 rows, re-reviewed with the changed tests.

### Conclusion by dimension

- Coverage: F1 (the key press: a stated gap without its re-test condition or acceptance record, concluded as Passed),
  F2 (the item during a pending jump, undriven), F5 (the table against E12).
- Case design: no finding.
- False greens: F3, F4. No constant truth, tautology, stale path, silent skip or unexecuted assertion.
- Resource reuse: no finding; the counts in one full run match the table.

### Dispositions

Recorded by the main agent, 2026-10-20; the findings above are the sub-agent's and are unchanged.

- F1: the test file's note gains its re-test condition. The coverage checklist's AC-01 and J10 rows conclude
  "passed for the menu item's path; the key press itself not verified", and their planned verification names the item's
  click. Whether and how the key press is accepted by hand is put to the owner with the PR, as is #273's acceptance
  wording on GitHub, which the main agent does not reword on its own.
- F2: done as a derived boundary, not a spec row. "Search Sessions…" opens the search page, and the jump rule
  already says leaving for another page supersedes a pending jump; the item does what the rail's Search item does.
  New case E13, below.
- F3: done. The installed item's `enabled`, `visible` and `registerAccelerator` are read and expected `true`.
- F4: done. E12 compares a normalised chord over every accelerator of the installed menu; U1's comment says what it
  checks: the template's own strings.
- F5: done. E12 asserts the keyword on arrivals three and four.

## Design review (increment after the post-implementation check)

Checked 2026-10-20, before the tests were changed. Implementation version: 03a5ba3. Rows added or changed:

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| E12 (changed) | global-search.spec · ⌘⇧F through the application menu | as before; F3, F4, F5 | as before | as before; every accelerator of the installed menu read, submenus included | the installed item's tail also reads `enabled`, `visible` and `registerAccelerator`, each `true`; among every installed accelerator, normalised (Cmd, Command, CmdOrCtrl and CommandOrControl one token; modifiers sorted), only the item's is the chord; the keyword as left on all four arrivals — literals | #271's home | one launch, unchanged |
| E13 (new) | global-search.spec · the item chosen while a hit's session is on its way | US-004/AC-01, a derived boundary: the item supersedes a pending jump, as the rail's Search item does under the jump rule (US-002/AC-03, J9's "the later click wins") | e2e; the item's own click; focus emulation; `AGENTSHED_FETCH_DELAY_MS` 1500 as the jump case uses | a hit left alone first, its jump landing past the delay (the jump happens once in the case); then a hit in another, unseen session, and the item chosen while the search page holds | the first jump lands on its session page; after the item, past the delay, the search page is still shown with its box focused and no session page — literals | #271's home | one launch |
| U1 (changed) | app-menu.test · "Search Sessions…" in the Edit menu | as before | as before | as before | the comment over the last check says what it compares: the template's own accelerator strings; the installed menu's normalised check is E12's | none | none |

### Dimension 1: Coverage

E13 drives the derived boundary F2 names, with the jump shown landing first in the same case so that the absence
after the item is a change. F3's three properties and F4's chord are now read from the installed menu. F5's
arrivals assert the keyword. F1 stays a stated gap: the key press is not reachable here.

### Dimension 2: Case design

No red flag: the same seams as E12; the delay is the existing injected knob.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: E13's absence follows a landing in the same case under the same delay; its fixed wait is past the
  delay that made the first jump land.
- Tautology: literals throughout; the normalisation is applied to the expected chord and the installed ones alike, and
  the expected list names one id.
- Stale path: the installed menu and the page as drawn today.

### Dimension 4: Resource reuse

E13 adds one launch through the file's `launch`; E12 and U1 add none.

