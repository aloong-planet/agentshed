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
- F2: done, with no spec row needed: session-view P8 read through P10 says a session left before its page has
  arrived is not switched to, the global search page stays, and the page is kept for a later open; the item does what
  the rail's Search item does. New case E13, below (its source corrected by the next check's F10).
- F3: done. The installed item's `enabled`, `visible` and `registerAccelerator` are read and expected `true`.
- F4: done. E12 compares a normalised chord over every accelerator of the installed menu; U1's comment says what it
  checks: the template's own strings.
- F5: done. E12 asserts the keyword on arrivals three and four.

## Design review (increment after the post-implementation check)

Checked 2026-10-20, before the tests were changed. Implementation version: 03a5ba3. Rows added or changed:

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| E12 (changed) | global-search.spec · ⌘⇧F through the application menu | as before; F3, F4, F5 | as before | as before; every accelerator of the installed menu read, submenus included | the installed item's tail also reads `enabled`, `visible` and `registerAccelerator`, each `true`; among every installed accelerator, normalised (Cmd, Command, CmdOrCtrl and CommandOrControl one token; modifiers sorted), only the item's is the chord; the keyword as left on all four arrivals — literals | #271's home | one launch, unchanged |
| E13 (new) | global-search.spec · the item chosen while a hit's session is on its way | US-004/AC-01 with session-view P8 read through P10: the pending switch is interrupted, the global search page stays, the session page is kept when it arrives (source corrected 2026-10-20 — F10) | e2e; the item's own click; focus emulation; `AGENTSHED_FETCH_DELAY_MS` 1500 as the jump case uses | a hit left alone first, its jump landing past the delay (the jump happens once in the case); then a hit in another, unseen session, and the item chosen while the search page holds | the first jump lands on its session page; after the item, past the delay, the search page is still shown with its box focused and no session page — literals | #271's home | one launch |
| U1 (changed) | app-menu.test · "Search Sessions…" in the Edit menu | as before | as before | as before | the comment over the last check says what it compares: the template's own accelerator strings; the installed menu's normalised check is E12's | none | none |
| Header (changed) | global-search.spec · its known-gaps note | — | — | — | the key press note gains its re-test condition (F1); added to this table 2026-10-20 — F11 | — | — |

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

## Post-implementation check (increment after the post-implementation check)

Checked 2026-10-20, independently of the implementing agent: run by a separate sub-agent that wrote none of the change
and worked from the inputs alone (the global and project instructions, the capability declaration, the two specs, this
record, `git diff 03a5ba3 2843aaf`, the gateway log). Implementation version checked: 2843aaf on
`feat/global-search-shortcut`; HEAD 952c09f adds only the gateway log (`git diff --quiet 2843aaf HEAD -- src e2e
package.json electron.vite.config.ts` exits 0). Ticket [#273](https://github.com/aloong-planet/agentshed/issues/273),
feature `global-search`. Scope: the rows of "Design review (increment after the post-implementation check)" — E12
(changed), E13 (new), U1 (its comment) — and the test file's header, against that table and F1–F5's dispositions; the
full gateway run on 2843aaf ([log](evidence/ticket-273/verify-2843aaf.log): `pnpm verify`, the chain joined by `&&`,
its last step ending `SMOKE_OK`).

Read for this check: both specs whole, and session-view's sequence P (P1–P10); this record whole; the increment's diff
whole (the e2e file, the menu unit, the coverage checklist, the document sync checklist, the task list, the final
regression's #273 section, the new evidence file); `e2e/global-search.spec.ts`, `src/main/app-menu.ts`,
`src/main/app-menu.test.ts`, `src/renderer/src/App.tsx` whole; `GlobalSearchPane.tsx`'s focus code, `SessionHits.tsx`'s
rows, the fetch delay's sites in `src/main/index.ts`, `playwright.config.ts`, `e2e/global-setup.ts`; the gateway log
whole. `docs/.workings` was listed with `git status --short --ignored`.

Capability: per the project's capability declaration (`capabilities.toml`, read with a TOML parser),
`mutation-testing` is not enabled, so mutation testing is skipped; each test's "when does it go red" is answered below
against the code under test and the source of its expected values. `e2e-suite` is enabled (`pnpm e2e`). No change was
made to the tree.

Re-run here, on 2843aaf's tree: `pnpm exec vitest run src/main/app-menu.test.ts`, 10 passed; `pnpm e2e
e2e/global-search.spec.ts` (built first; the bundles' names and sizes are the gateway's), 13 passed, exit 0, E12 1.2 s,
E13 6.9 s. Measured with a scratch probe kept outside the tree, run against that build: it copies the spec file's
launcher, fixture home and item click verbatim and launches as E13 does (`AGENTSHED_FETCH_DELAY_MS` 1500, focus
emulation). It times the control jump from the hit click to the session's title; reads the focus before and after a
hit click on the search page; times the item's click after a hit click on another unseen session (twin-a); and times
the jump to E13's own session (t1, unseen until then) left alone. Output of three runs:

```
PROBE {"controlLanding":1841,"focusedBeforeHit":true,"afterHit":{"tag":"BUTTON","cls":"hit row-btn"},"boxFocusedAfterHit":false,"itemReturned":36,"e13SessionLanding":1827}
PROBE {"controlLanding":1842,"focusedBeforeHit":true,"afterHit":{"tag":"BUTTON","cls":"hit row-btn"},"boxFocusedAfterHit":false,"itemReturned":40,"e13SessionLanding":1835}
PROBE {"controlLanding":1846,"focusedBeforeHit":true,"afterHit":{"tag":"BUTTON","cls":"hit row-btn"},"boxFocusedAfterHit":false,"itemReturned":29,"e13SessionLanding":1839}
```

### The written tests against the test design table

| # | Written as designed? |
|---|---|
| E12 | Yes: the tail reads `enabled`, `visible` and `registerAccelerator` from the installed item, each `true`, in the polled French read too; every accelerator of the installed menu is walked, submenus included; the fold covers the four Cmd spellings (and `control` to `ctrl`, `option` to `alt`, beyond the table), modifiers sorted, applied to both sides; the expected list names one id, a literal; the keyword is asserted on all four arrivals (lines 767, 775, 784, 795). One addition the table does not state: a guard that the walk found more than two accelerators (line 756). F6 |
| E13 | Yes: the seam (the item's own click, focus emulation, the 1500 ms delay); the inputs (a control hit in the stale project, then a hit in t1, which nothing fetched before, and the item 29–40 ms after it, measured); the assertions (the control's title, then `dim-search`, the box focused and no `.pane-head .stitle` after a 2.5 s wait); the fixture (#271's home through `mkHome`); the resource (one launch) |
| U1 | Yes: only the comment changed, and it says what the code compares — the template's own strings, over the top-level menus' submenus, which hold every item (the template nests no deeper) |
| Header | Changed in this increment — F1's re-test condition (lines 15–17) — with no row in the increment's table, where the first design review gave the header one. F11 |

### Dimension 1: Coverage

- F1–F5 against the change: F1, the note's re-test condition is in, and the key press's hand acceptance stays the
  owner's (the checklist's AC-01 and J10 rows conclude "passed for the menu item's path; the key press itself not
  verified"); F2, E13 drives the item during a pending jump; F3, the three flags are read; F4, the installed menu is
  compared with a normalised chord; F5, the keyword is asserted on all four arrivals.
- Each claimed boundary names its input. E13's pending jump: a hit in a session no page of which exists in this run
  (fresh userData, so no saved page; `openFromSearch` is the only caller of `fetchQuery` in `src/renderer/src` outside
  tests), under `getSessionPage`'s 1500 ms delay (`src/main/index.ts:314`), and the item 29–40 ms after the hit click,
  well inside the landing at 1.83–1.84 s (measured).
- E13's expected value: the table derives it from US-004/AC-01 and "the jump rule (US-002/AC-03, J9's 'the later click
  wins')", and F2's disposition says the jump rule already says leaving for another page supersedes a pending jump. The
  global-search spec says neither; session-view P8 read through P10 does. F10.
- The focus request is carried only where the page is already on screen: on a mount both the request's effect and
  `autoFocus` run (`GlobalSearchPane.tsx:47–49, 87`), so arrivals one, two and four pass without the request. Arrival
  three and E13 carry it; E13 without witnessing its precondition (F9).
- The header's gaps: the key press note has its re-test condition; E13 adds no gap. Beyond F11, no finding.
- Fixture: nothing new reads a data shape; #271's home is reused. No finding.

### Dimension 2: Case design

| Red flag | E12 (the added parts) | E13 | U1 |
|---|---|---|---|
| A project module replaced (`vi.mock`, `vi.spyOn`) | none | none | none |
| A cast past visibility, or internal state written for setup | none: the installed `MenuItem`'s public properties | none: the delay is the existing injected knob | none |
| Internal call count or order | none | none | none |
| A side channel instead of the interface | the installed menu read through Electron's `Menu` API in the main process, as before | none: the page as drawn | none |
| A state the public path cannot reach | none | the item's click without the event a real dispatch passes, as in E12; the flags F3 asked for are now read | none |

Isolation: E13 has its own home and userData and closes them in `finally`. No finding in this dimension.

### Dimension 3: False greens

When each test goes red, for what this increment added or changed:

- E12: also when the installed item is disabled, hidden or has its accelerator unregistered (read from the installed
  item, so Electron's defaults are what is checked); when another installed entry's accelerator folds to the item's
  chord; when the walk finds two accelerators or fewer; when the keyword is lost on arrival three (the page stays on
  screen, so only the handler could clear it) or four (after a remount, from the page's kept state). Not seen: the walk
  no longer reading the roles' defaults (F6); a chord spelled with a modifier the fold omits, or a fold that stopped
  folding (F7).
- E13: when the menu handler no longer drops the pending jump — it would land 1.83–1.84 s after the hit click, and the
  check runs 2.5 s after the item, which returns 29–40 ms after the click: a margin of about 0.7 s on this machine,
  not asserted (F8); when the item does not keep the search page; when the box is not focused after the item (the hit
  click moved the focus to the hit's button, measured, not asserted: F9); when a session page is drawn; when the
  control jump does not land within 10 s; on a handler error on stderr.
- U1: unchanged; its comment now says what it compares.
- Constant truth: E13's absence is anchored by the control, which makes the same observable (`.pane-head .stitle`)
  appear once under the same delay, but not its timing (F8). E12's guard can be met without any role (F6).
- Tautology: the expected values are literals; the fold is applied to both sides, so nothing in the case shows it
  folding another spelling (F7).
- Stale path, read timing: the flags and the accelerators are read from the running main process's installed menu;
  the French tail is polled on the asserted expression itself, flags included. E13's read after a fixed wait is F8.
- Conditional skip, assertions that may not run: none. An absent application menu gives an empty walk, which fails the
  guard; `clickSearchSessions` throws when the item is missing.
- Against review-code's false-greens list (E13 is a browser assertion): form two as in the earlier check — the item's
  click stands in for the key press, stated in the header; form five (read too early) is F8; form nine (the object not
  in the tool's range) is F6, the walk's reach over the roles not witnessed, and F7(b), the fold enumerating spellings
  from a hand-made list. No gate or command-line check is introduced; the other forms do not apply.

### Dimension 4: Resource reuse

Counted from the gateway's full run and the re-run here:

| Resource | Cost | Times built or loaded | Provided by | Against the table |
|---|---|---|---|---|
| The build (main, preload, renderer) | about 1.6 s (log lines 405–427) | once, before the 148 cases (and once before the 13 re-run here) | `pnpm e2e` | matches |
| E13's app launch | under 1 s (a single-launch case took 648 ms in the re-run); E13's 6.9–7.0 s is its waits: the reading and the control jump under the 1.5 s delay, and the 2.5 s wait | once: one `launch(home, …)`, no relaunch (counted from the code) | the file's `launch`, per case with its own userData | matches |
| `mkHome`'s fixture home | about 10 ms (the earlier check's measurement) | once per case | per case | not expensive |
| E12's added reads; U1 | in-process reads; the unit file 4–13 ms | — | — | matches |

No finding.

### Findings

| # | Dimension | Case or file | What is wrong | Evidence | Recommended change |
|---|---|---|---|---|---|
| F6 | False greens | E12, `menuAccelerators` and its guard (`e2e/global-search.spec.ts:756`) | The guard `accelerators.length > 2` is met by the template's three explicit accelerators alone (Settings, the item, the reload), so nothing in the case shows the walk reads the roles' default accelerators — the reach that U1's comment, the checklist's AC-02 row and the final regression's "the accelerator is the item's alone" row credit to it. Electron 43.2.0 exposes them today, so the check covers them now; were an upgrade to stop exposing them, "only the item's is the chord" would shrink to three entries and stay green | the guard; `src/main/app-menu.ts:56, 77, 86`; [the installed menu's read](evidence/ticket-273/installed-menu-accelerators.txt) (undo, redo, hide, quit … with their defaults) | Replace the guard with an assertion that names a role's default, a literal from that read — e.g. `expect(accelerators).toContain('undo \| CommandOrControl+Z')` — so the walk's reach over the roles is witnessed in every run. Low to medium |
| F7 | False greens | E12, `chord` (`e2e/global-search.spec.ts:734–740`) | (a) The fold is applied to the expected chord and the installed ones alike, and no installed accelerator spells the chord another way, so the case never shows the fold folding: a fold that stopped folding (a spelling dropped from its list) keeps E12 green, and F4's concern returns unseen. (b) The list folds four Cmd spellings but not `Super` or `Meta`: this Electron's accelerator parser accepts `super` (its token table in `shell/common/keyboard_util.cc`, read from the strings of the Electron Framework binary in `node_modules/electron`), and Electron's accelerator documentation maps Super and Meta to Cmd on macOS (that mapping not verified here) | the function; the framework's strings | Add two literal self-checks to the case — `expect(chord('Shift+CommandOrControl+F')).toBe(chord('CmdOrCtrl+Shift+F'))`, `expect(chord('Control+Command+F')).not.toBe(chord('CmdOrCtrl+Shift+F'))` — and fold `super` and `meta` into `cmd`, or narrow the table's and the comments' wording to the spellings folded. Low |
| F8 | False greens | E13, the read after `waitForTimeout(2500)` (line 823) | The absence is read 2.5 s after the item; the jump it guards against lands 1827–1839 ms after the hit click, and the item returns 29–40 ms after it: a margin of about 0.7 s on this machine. The control shows that a jump lands within 10 s, not when, so where landing takes more than about 2.5 s the case stays green with the drop removed. The design review's "its fixed wait is past the delay that made the first jump land" holds for the 1.5 s delay; the landing takes 1.84 s | the probe's output above; `src/main/index.ts:314`; `App.tsx:128–144, 220–224` | Time the control jump in the case (from its click to its title) and tie the wait to it — assert it landed well inside the wait (e.g. under 2 s), or wait the measured landing plus a margin — so the case's ability to go red is witnessed in every run. Low to medium |
| F9 | False greens | E13, `toBeFocused` after the item (line 825) | The box holds the focus before the second hit click (the page remounted and its box took the focus); the case relies on that click moving the focus to the hit's button and does not assert it, as E12's arrival three does (line 781). Should a hit row stop taking the focus on a click, the assertion passes without the item's request | the probe: `focusedBeforeHit` true; after the click `BUTTON.hit row-btn`, the box not focused; `SessionHits.tsx:73` (a `<button>`) | `await expect(box(win)).not.toBeFocused()` right after the second hit click. Low |
| F10 | Coverage | E13's row in the increment's table; F2's disposition; the checklist's US-004/AC-01 row | E13's expected value is sourced to "the jump rule (US-002/AC-03, J9)", and the disposition says the jump rule already says leaving supersedes a pending jump; the global-search spec says neither (US-002/AC-03 is the hold, J9 two hits, "The jump" the transition). The requirement is session-view P8 read through P10: "Opening a session and going back before its page has arrived: the pending switch is interrupted, the [global search] page stays, and the session page is kept when it arrives (a later open is P4)" | `docs/specs/global-search.md` US-002/AC-03, J9, "The jump"; `docs/specs/session-view.md` P8, P10 | Cite session-view P8 through P10 as E13's source in its row and in the checklist's AC-01 row, and correct the disposition's sentence. Optional: assert P8's other half on this path — after the wait, the t1 hit opens at once (the jump case's 700 ms bound). Low |
| F11 | Coverage (the table against the written test) | the increment's test design table; the e2e file's header | The header changed in this increment (lines 15–17) with no row in the increment's table, where the first design review gave the header its own row | the diff; the two tables | Add a "Header (changed)" row to the increment's table. Low |
| F12 | Coverage (the verification record) | `checklist.md` Current verification, #273's block (lines 184–198) | The rows for US-004/AC-01, AC-02 and J10 say "impl 2882abc" but describe E13 and E12's flags and walk, which exist only from 2843aaf; the block's "again after the post-implementation check's findings" names no commit and links no log, though the gateway log for 2843aaf is in the evidence directory | the rows; [verify-2843aaf.log](evidence/ticket-273/verify-2843aaf.log) | Version those rows on 2843aaf (or split them: 2882abc for what ran then, 2843aaf for E12's additions and E13) and link the log; until then the document sync checklist's "Record the actual verification…" row is not done on a valid basis and reopens. Low |
| F13 | Coverage (the verification record) | `evidence/ticket-273/installed-menu-accelerators.txt` | The read the checklist and the final regression cite has no producer, build or date beside it, unlike the key press probe, kept with its output | the file: one `PROBE` line | Keep the probe that produced it, or a note of its command and build, beside the output. Low |
| F14 | Coverage (the verification record) | `ticket-273-tasks.md` row 9 | Written in 2843aaf, it says the changes made for F2–F5 were "checked again independently" before any such check had run; this section is that check, with findings | the row; this section | Rewrite the row from this section's outcome (F6–F14 and their dispositions). Low |

### Document sync these findings call for

Not done by this check. F6–F9: the increment's table rows for E12 and E13, re-reviewed with the changed tests; for F6
and F7, also the wording "the roles' own accelerators included" in U1's comment, the checklist's AC-02 row and the final
regression's row ("the accelerator is the item's alone … Held by tests") until the walk's reach is witnessed. F10:
E13's row, F2's disposition and the checklist's AC-01 row. F11: the table. F12: the checklist's #273 block, and the
document sync checklist's verification row, reopened. F13: the evidence directory. F14: the task list.

### Conclusion by dimension

- Coverage: F1–F5 answered as dispositioned, F1's hand acceptance still the owner's; F10 (E13's requirement cited to
  the wrong place), F11 (the header without a row), F12–F14 (the verification record).
- Case design: no finding.
- False greens: F6 and F8 (low to medium), F7 and F9 (low). No tautology beyond F7's symmetric fold, no stale path, no
  silent skip, no unexecuted assertion.
- Resource reuse: no finding; the counts in the full run match the table.

### Dispositions (increment)

Recorded by the main agent, 2026-10-20; the findings above are the sub-agent's and are unchanged. Done in cc5aefd
(tests) and the records commit after it, each as the finding recommends:

- F6: the guard is now `toContain('undo | CommandOrControl+Z')`, a role's own accelerator from the installed menu's
  read, so the walk's reach over the roles is seen in every run.
- F7: the fold takes Super and Meta too (as Electron's accelerator documentation maps them; the mapping is not
  measured here), and E12 checks the fold on literals first: another spelling of the chord folds to it, Super+Shift+F
  folds to it, and Control+Command+F does not.
- F8: E13 times the first jump from its click to its title and waits that long plus a second.
- F9: E13 asserts the box lost the focus to the hit's click before the item.
- F10: E13's row and F2's disposition cite session-view P8 through P10, and E13 checks P8's other half: the same hit
  then opens at once (the jump case's 700 ms bound).
- F11: the increment's table has a header row.
- F12: the coverage checklist's #273 rows are versioned on cc5aefd for the tests, with its gateway log linked.
- F13: the probe that read the installed menu is kept beside its output.
- F14: the task list's rows 8 and 9 are rewritten from what happened.

These changes are the check's own recommendations applied as written; they were not checked independently again.
The gateway ran whole on cc5aefd.
