# Global search — documentation regression

Feature-level report of step 8 (the cross-regression after the feature catalogue is updated). One section per
ticket in ticket order; the closeout ticket (#274) adds the full-feature section. Coverage verification per unit
lives in [checklist.md](checklist.md), not here.

## Ticket #271 — Global search: search every project's questions and open a hit's session

- Date: 2026-10-19
- Scope: this ticket's change only (not the full-feature closeout)
- Version: branch `feat/global-search` on 57a6a5c, through a025015, with the documentation of this step as
  committed for the ticket's PR
- Languages in the searched files (counted by writing system, not assumed): `docs/features`, `docs/specs`,
  `docs/adr` and `CONTEXT.md` are English with a few Han, Cyrillic and accented Latin quotations; the
  dictionaries hold all six languages; the six READMEs one each. Searches below are written per language
  where the counted files use it; the dictionaries are covered by the gates named in stage 2

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/global-search.md` status line and the new Pending note | what shipped (the page, the search, the jump; not the exits or the keyboard entry) | True; the note's condition is a product fact the next tickets make true |
| `docs/specs/global-search.md` S2 (first launch with no saved data) | the page with no snapshot (the no-session state) | True after the write-back; not separately tested — recorded in the checklist |
| `docs/specs/global-search.md` S7 (quotes, backslashes; line breaks read as spaces) | the corpus's parse (the session page's) and its case U4 | Was untrue for line breaks ("match as written" while the parse collapses them): corrected; the owner confirms it with the PR |
| `docs/specs/global-search.md` Implementation Decisions, main (identity, update before the snapshot) | `question-corpus.ts`, `index.ts`; cases U10, U14 | True after the write-back |
| `docs/specs/global-search.md` Implementation Decisions, renderer (last answer kept, previous answer while the next comes, reading asked once, focus) | `GlobalSearchPane.tsx`, `global-search-query.ts`; cases Q3, E3 | True after the write-back |
| `docs/specs/global-search.md` failure modes for #271's units | tests | Each has a test or a stated gap (test review record: the untitled fallback, S15's renderer side end to end) |
| `docs/features/global-search.md` (new), every line | the spec's user-visible layer for what #271 ships | True. Nothing of US-003/AC-01–AC-04 or US-004 is claimed; the back control line states today's single control |
| `docs/features/README.md` row | the entry | Added |
| `docs/features/projects-list.md` (scroll into view) | projects-list C8; e2e E3 | True |
| `docs/adr/0034-global-search-question-corpus-in-memory.md` (accepted, identity wording, evidence) | the measurements (`evidence/ticket-271/measurements.md`); the corpus | True |
| `docs/adr/README.md` row | the ADR's status | Accepted in both |
| Dictionaries, six languages: `rail.search`, `search.*` | the spec's copy (US-001/AC-03, AC-08, REQ-002/AC-02, REQ-003/AC-01, REQ-006); the prototype's copy | True; `pnpm typecheck`, `check:i18n`, `check:ui` green; counted forms in the counted-noun test |
| `scripts/check-shared-ui.mjs` rail exemption's reason | the six dictionaries | True: "search" is an ordinary word there (48 matches without the exemption) |
| Code comments reworded ("the settings dimension") | the rail's four items | True |
| CONTEXT (unchanged): **Global search**, the rail's four labels | the entry and the implementation | Same terms; the four labels now hold |
| The global search prototype (unchanged) | the page as built, side by side at the same size and keyword | Same form. The one difference found — a hit row's number centred in the app, top-aligned in the prototype's shared piece — was settled for the app's way and the piece changed (see "Found outside") |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/specs/README.md` row: global-search → Global search feature | the new feature entry | True: the link now resolves |
| `docs/features/session-view.md` search lines (a project's own search, its hits, the arrival highlight, "the project page stays put until the session page has arrived") | a hit opened from global search | True: they describe the project search; global search's arrival is in its own entry with the same highlight |
| `docs/specs/projects-list.md` C8 | the list's reveal | True (e2e E3, and its mutation) |
| `docs/specs/session-view.md` P10 | the session opened from a hit | Not yet true: it is #272's (the spec's Pending note says so); unchanged |
| `docs/features/appearance.md`, `i18n.md`: "the settings entry at the foot of the rail" | the rail's new item | True: Settings keeps its bottom anchor (the update-slot case checks the Search item too) |
| `docs/features/agents-overview.md`: the rail usable during the skeleton | the rail's new item | True: the item is a plain rail button |
| CONTEXT invariant "a page switch is atomic and a revisit is instant" | the jump | True: the search page holds; a cached page opens at once (E3) |
| CONTEXT invariant "every automatic rescan marks every cached page stale" | the snapshot invalidation | True: global search is in the list (Q2) |
| ADR-0028 (the query layer) | the two new queries | True: non-suspense queries, invalidated on snapshot |
| The six READMEs | a new capability | No statement about sessions or search: nothing turns false (search below) |
| The landing page's copy: "Each session indexed by question … or search" | global search | True; it does not say "within a project". Whether the page advertises global search is a product choice, left to the owner |
| Rule ↔ gate: every string in six languages, with plural forms | typecheck, `check:i18n`, the counted-noun test | The gates cover the new section: green; the counted test carries the new counted entries |
| Rule ↔ gate: no copy names a rail control verbatim; no copy enumerates the sides | `pnpm check:ui` | New copy names neither; the new exemption is by key with its reason: green |

Searches for the rows above (Chinese and Japanese terms written as code points, as the working-language gate requires): `rg -n -i "search|\x{641C}\x{7D22}|\x{691C}\x{7D22}|recherch|busca|поиск|rail|sidebar|session" README*.md` — no line (each README read: 7 lines, a one-sentence summary); `rg -n -i "search|session|\x{641C}\x{7D22}|\x{4F1A}\x{8BDD}|\x{691C}\x{7D22}|\x{30BB}\x{30C3}\x{30B7}\x{30E7}\x{30F3}|recherch|busca|sesi|поиск|сесси" site/src/i18n` — eight lines: the session card's title, body and image text and the token card's body, each in Chinese and English (the page's only languages); the session card's body is the line quoted above; `rg -n "Proposed" docs/specs/global-search.md docs/features CONTEXT.md` — none (exit 1); `rg -c "FETCH_DELAY" docs CONTEXT.md` — none (exit 1): the delay seam is described only in the code.

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| The rail's items went from three to four (the dimensions from three to four) | `rg -n -i "third dimension|three dimensions|two dimensions|dimensions plus|Agents / Projects / Settings|Agents, Projects and Settings"` over docs, CONTEXT, src, e2e, scripts and the landing page; position-aligned structures (the rail-count e2e assertions, the prototype rail's item list, each dictionary's rail block) | The two code comments reworded; the two count assertions updated (4, and 5 with the update slot); the prototype's list already had Search; every dictionary's rail block has it (typecheck). The remaining "two dimensions" hits are the appearance spec's appearance × theme, unrelated |
| Pending notes in scope | the new one in the global-search spec | Not expired: the exits and the keyboard entry are #272's and #273's |
| A rule written this round | none new: the rail exemption applies the existing rule; the corpus's identity is a decision written into the spec and ADR-0034 | — |
| ADR-0034 changed state (Proposed → Accepted) | every mention of 0034 in the docs and the working records | No document called it Proposed; #271's document sync item is done; #274's confirmation item stays Waiting for the closeout |
| The coverage checklist's units for #271 verified | `checklist.md` Current verification | Rows added for every #271 unit and path, with the version and the evidence |

### Found outside the change surface

- A hit row's number: the app centred it (the project search's existing rule), the prototypes' shared hits
  piece left it top-aligned. **Settled by the owner on 2026-10-19: centred, the app's way**; the shared piece
  now centres it (2d0a2ce), measured level in both pages that use it. The stage 1 prototype row stands without
  its caveat.
- A stripped Codex fork's title — on the session page header and on a project's own search cards, not in any
  document this round changed: [#278](https://github.com/aloong-planet/agentshed/issues/278).
- The landing page does not mention global search: the owner's decision is to add it later —
  [#279](https://github.com/aloong-planet/agentshed/issues/279).

### After the owner's decisions (2d0a2ce)

| Declaration surface | Checked against | Conclusion |
|---|---|---|
| `docs/prototypes/_shared/session-hits.css` (hit rows centred) | the app's hit rows; both pages that use the piece | Consistent with the app; `pnpm check:ui` green (2 usage sites) |
| The refactors R1–R3 | `docs/features/`, the spec | No user-visible behaviour changes, so no document line turns false; the spec's Implementation Decisions name no module these touched |

### Convergence

Every row above was processed; the three text changes made here (the spec's S7, the feature entry's wording, the
test review's method name) were re-read against their counterparts and produced no new row. The pre-delivery
scope re-check (the ticket, the change, the runs, the current documents) found no further surface: the document
sync checklist records it.

## Ticket #272 — Global search: back to the results from a hit's session, or on into its project

- Date: 2026-10-19
- Scope: this ticket's change only (not the full-feature closeout)
- Version: branch `feat/global-search-exits` on 5dfbf0d — 53e3ab3 (the capability declaration), 09966e1 (the
  exits), 5bd38dd (the owner's refactors R-a and R-b), 7d8ea36 (the icon module's stale note) — with the
  documentation of this step as committed for the ticket's PR
- Languages in the searched files (counted by writing system: Latin, Han, Kana, Cyrillic, accented Latin):
  `docs/features`, `docs/specs`, `docs/adr` and `CONTEXT.md` are English with a few Han, Cyrillic and accented
  quotations; the six READMEs one language each (Han, Kana, Cyrillic and accented Latin present); the landing
  page's dictionary Chinese and English; the app's dictionaries all six. Searches below carry a term per
  language for the files that use it

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/global-search.md` status line and Pending note | what shipped: the exits and the return (US-003); not the keyboard entry | True: the note narrowed to US-004, its "until they do" sentence gone with the condition it described |
| `docs/specs/global-search.md` J11 (new: long names and narrow windows) | the row's rules; the narrowing measurement | True by the row's rules; added from the confirmed prototype, and kept: the owner authorised the merge as written (2026-10-20; the coverage checklist's two-way audit records it). Its measurement no longer supports it: taken below the window's 800 px minimum (the independent test check, F1, 2026-10-20); the follow-up's case E11 supports it instead (the follow-up section below) |
| `docs/specs/global-search.md` Implementation Decisions, "The jump" (the origin) | App on 5bd38dd: the origin is part of the open session's value; going into the project is the back control's handler | True after the write-back |
| `docs/specs/global-search.md` failure modes J1 (exits), J3–J7, J11 | tests and evidence | Each has a case (E3, E8, E9, E10); J11's measurement was taken below the window's minimum (2026-10-20, F1), and J11 now has the follow-up's case E11 |
| `docs/features/global-search.md`: the hit line no longer ends on the back control; the new exits line | the spec's US-003 and J11; the e2e cases | True; no claim about the keyboard entry |
| `docs/features/session-view.md`, the session page line (the back button on one line; the two ways out from a global search hit) | session-view P10; the row's rules | True |
| Dictionaries, six languages: `session.backToSearch`, `session.goToProject`, `session.goToProjectStale` | the spec's copy (US-003/AC-01, AC-03); each language's existing back control | True; `pnpm typecheck`, `check:i18n`, `check:ui` green |
| `capabilities.toml`: `[red-green-mutation] enabled = false` | the capability registry (the ID, its shape, no precondition); the owner's answer | True as written, but the registry had renamed the ID to `mutation-testing` two minutes before (the independent test check's C2, 2026-10-20); the follow-up replaced it, and the nine registered IDs are declared |
| Code comments: App (the open session's value, the shared handler, the lookup), SessionPane's `exits`, the row's style, the chevrons, the icon module's header | the code they sit on; ADR-0018 | True; the chevrons' old "never in the same slot" and the header's "tracked separately" are gone because they were no longer true |
| The session page prototype (unchanged) ↔ the app | the exits row, its two controls and the single back control | Same: 94 computed values equal, light and dark, at rest and hovered ([measurements](evidence/ticket-272/measurements.md)); the one-line cut uses the prototype's own rules (no wrap, an ellipsis on the text) |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/specs/session-view.md` P10 | the exits | Now true (#271's section recorded it as not yet true) |
| `docs/specs/session-view.md` P3 (returning lands on the Sessions section, a cached visit) | the way on into the project, which shares the back control's handler | True for both |
| `docs/features/session-view.md`: "returning from a session page lands on the Sessions section" | both ways back | True |
| `docs/features/global-search.md`: the Search item brings the page back as left | the exits' way back | True: the same page state (E8, E10) |
| `docs/features/README.md`, `docs/specs/README.md` rows for both entries | the entries | True: the one-liners still describe them |
| CONTEXT **Global search** ("going from a hit straight to that session inside its project") | the exits | True; the exits are interface wording, not a term |
| CONTEXT invariant "a page switch is atomic and a revisit is instant" | the two exits | True: going into the project is the back control's transitioned move; the search page draws from its kept state at once |
| ADR-0018 (icons inline, the back chevron a component) | the exits' chevrons; the icon module's header | True: both chevrons are icon components; the header no longer contradicts the ADR |
| The six READMEs and the landing page's copy | the session header's controls | No statement about them: `rg -n -i "back to|go to|exit|\x{8FD4}\x{56DE}|\x{8FDB}\x{5165}|\x{623B}\x{308B}|retour|aller|volver|назад|перейти" README*.md site/src/i18n` — two lines, both "aller" inside other words ("taller", "installer") |
| `AGENTS.md`'s pointer to `capabilities.toml` | the new entry | True: a pointer only; no document counts the declared IDs (`rg -n -i "capabilit" AGENTS.md CONTEXT.md docs`, outside the working records and prototypes: section headings and unrelated uses) |
| Rule ↔ gate: copy in six languages | typecheck, `check:i18n` | The new keys exist in all six (typecheck fails otherwise): green |
| Rule ↔ gate: no copy names a rail control verbatim or enumerates the sides | `pnpm check:ui` | The exits' copy does neither: green |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension's members changed | languages, sides, rail items: unchanged; the session header's controls are not a dimension any copy enumerates | None |
| Pending notes in scope | `rg -n "Pending:" docs/specs/global-search.md docs/specs/session-view.md` — one line | Expired in part (US-003 shipped): narrowed in place to US-004 |
| A rule written this round | the `red-green-mutation` declaration (since replaced by `mutation-testing`, the follow-up) | Its source of truth is `capabilities.toml`, written there; nothing else restates it |
| #271's case E3 changed (its arrival now asserts the exits) | #271's Current verification rows citing "e2e (going to a hit)" | Still true: the case keeps every #271 assertion and ran green on this branch |
| The coverage checklist's units for #272 verified; J11 added | `checklist.md`: the mapping, Current verification and two-way audit | Rows added, with the version and the evidence |
| An outside finding got an issue | [#281](https://github.com/aloong-planet/agentshed/issues/281) (the dark scrollbar) | Recorded in the code review; no document claims otherwise |

### Found outside the change surface

- The scrolling lists' scrollbar track in dark mode: [#281](https://github.com/aloong-planet/agentshed/issues/281).
- The icon module's stale note: removed in this PR (7d8ea36), on the owner's decision.

### Convergence

Every row above was processed; the text changes made here (the spec's status, Pending note, J11 and the origin
decision; the two feature entries) were re-read against their counterparts and produced no new row.

## Ticket #272 follow-up — the independent test check's findings

- Date: 2026-10-20
- Scope: the follow-up's change only (not the full-feature closeout): the capability's ID, five e2e cases (E11 new;
  E3, E4, E8, E9), the spec's US-003/AC-01, the two feature entries' lines, and the records
- Version: branch `test/global-search-exits-followup` on 41f8a0d (#283's head), rebased onto main at 1d82cfd (#283's
  merge, the same tree) with each commit's tree unchanged (5e667e9 → 3aa2a3e, db77a8e → 6627940, 33ff8dc → 7dc70da); the application code f0d7027's
- Languages in the searched files, counted by writing system: the two specs, the two feature entries, both indexes and
  `CONTEXT.md` have no Han, Kana or Cyrillic line; accented Latin in one line of the session-view spec, one of the
  features index and three of `CONTEXT.md`, all names or quotations. The searches below are English; a search over a
  hidden directory (`docs/.workings`, `.github`) carries `--hidden`, as `rg` skips those even with `--no-ignore`

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/global-search.md` US-003/AC-01: a session opened by a hit row or by its card's header | the app: a card's header opens through the same path as a hit row, with no question (`onOpen(project, file, null)` beside `onOpenHit`); E3 | True |
| `docs/specs/global-search.md` J11 | E11 at 800 px with a long name | True, now held by a case |
| `docs/features/global-search.md`: "a session opened from the results — a hit, or a card's header — has two ways out" | the spec's US-003/AC-01, J11; E3, E11 | True |
| `docs/features/session-view.md`: "a session opened from the global search results has two ways out there instead" | session-view P10, pointing at global-search US-003 | True |
| `capabilities.toml`: `[mutation-testing] enabled = false` | the capability registry (the ID, its shape, no precondition); the owner's answer to C1 | True; the nine registered IDs declared, none outside the registry |
| The e2e file's header ("each kept on one line") and the new comments | the cases they sit on | True |
| The session page prototype ↔ the app | no interface change; the prototype's exits rules are the same no-wrap, ellipsis and shrink rules E11 asserts | Same |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/features/README.md`, Global search: "…and open a hit's session inside its project" | the exits line | True: the one-liner names no exits |
| `docs/features/README.md`, Session view; `docs/specs/README.md` rows | the two feature lines; the spec | True: names and one-liners only |
| The spec's US-002/AC-02 (a card's header opens without locating) | US-003/AC-01 now cites it | True |
| The spec's US-003/AC-04 ("only the session opened directly from a hit has the two exits") | US-003/AC-01's clarification | True: AC-01 now says what "opened directly from a hit" covers |
| The spec's J1, the end-to-end flow in Testing Decisions, the prototype gate's list | US-003/AC-01 | True |
| `docs/specs/session-view.md` P10 | US-003/AC-01 | True: it points at US-003's definition |
| The two prototypes' notes ("a session opened from a global search hit shows two exits") | US-003/AC-01 | True under AC-01's reading; the prototypes record the confirmed design and are not rewritten for a wording clarification |
| CONTEXT **Global search** | the exits | True; no term changes |
| The dictionaries, the six READMEs, the landing page's copy | which sessions have the exits | No statement about it: the copy is the controls' labels |
| Rule ↔ gate: the declared capability IDs against the registry | `capabilities.toml` | No gate in the repository checks it (the registry lives with the skills); held by people — the skills that read the file, and an independent check like this one. C2 is what it cost: the ID stood unregistered for a day |
| Rule ↔ gate: J11's one-line rule | E11 | Held by a case now, not a one-off measurement |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension's members changed | the declared capability IDs: one renamed, still nine; languages, sides and rail items unchanged. `rg -n --hidden --no-ignore "red-green-mutation"` over the worktree, outside `node_modules` and `.git`: hits only in `docs/.workings/global-search/` records, the control file among them (6 lines) | The records' current statements (the coverage checklist's #272 block, this report's #272 rows) rewritten; the dated ones left as their record |
| Pending notes in scope | `rg -n "Pending:" docs/specs/global-search.md docs/specs/session-view.md` — one line, US-004 | Not expired by the follow-up |
| A rule written this round | none new: evidence for a boundary taken where users can reach it is `/tdd`'s reachable-state rule | — |
| Work state changes | #272 reopened, its two process items unticked; the follow-up's rows; the re-tick after the merge | The document sync checklist's Waiting row |
| #271's cases E3 and E4 changed | #271's Current verification rows citing them | Still true: assertions added, none removed |

### Convergence

Every row above was processed. The text changes made here (the coverage checklist's ID wording, this report's three
#272 rows) were re-read against their counterparts and produced no new row.

## Ticket #273 — Global search: ⌘⇧F and the Edit menu's Search Sessions…

- Date: 2026-10-20
- Scope: this ticket's change only (not the full-feature closeout)
- Version: branch `feat/global-search-shortcut` on 84d5ae0 — 2882abc (the item, its path and the case), cecebad (the
  key press note, the reviews), 03a5ba3 (the spec and the feature entries), 2843aaf and cc5aefd (the tests after the two
  independent checks), and the records after them
- Languages in the searched files, counted by writing system: the two specs and the two feature entries are English
  with Han, Cyrillic and Kana only in quotations or language names; the six READMEs one language each; the landing
  page's dictionary Chinese and English; the app's dictionaries all six. Searches below carry a term per language for
  the files that use it

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/global-search.md` status line; the Pending note | what shipped: every user story, US-004 with this ticket | True; the note's condition is gone with US-004 shipped, so the note is gone (no trace of it kept) |
| `docs/specs/global-search.md` Implementation Decisions, the renderer: the box takes the focus on every showing and whenever the menu's item asks | `GlobalSearchPane`'s focus request and `autoFocus`; E12 | True |
| `docs/specs/i18n.md`, the application menu: why the app installs a custom menu | the app's custom menu | True (the old sentence said there was none) |
| `docs/features/global-search.md`: ⌘⇧F, or "Search Sessions…" at the bottom of the Edit menu, from anywhere, as left, the cursor in the box, the search page itself included | US-004/AC-01, AC-02, J10; E12, E13 | True: the item's path by e2e; the key press accepted by hand by the owner on 2026-10-20 (the coverage checklist's US-004/AC-01 row) |
| `docs/features/i18n.md`: the menu's entries into the app | the installed menu (E12) | True |
| Dictionaries, six languages: `menu.searchSessions` | the prototype's Chinese and English; each dictionary's own wording for question search and sessions | True; `pnpm typecheck`, `check:i18n`, `check:ui` green |
| Code comments: the template's action and item, the shared IPC name, the preload's and the App's notes on the menu's entry points (no count any more), the search page's focus request | the code | True |
| The e2e file's header: the key press note with its re-test condition; the focus note gone | E12, E13; the probe | True |
| Prototypes ↔ app | the global search prototype's note that the Edit menu's item is not drawn there (a native menu, the spec's declared exemption) | Same; no interface drawn |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/features/README.md` Global search row; `docs/specs/README.md` rows | the entry, the spec | True: the one-liners name neither the shortcut nor the menu |
| `docs/features/app-update.md`, `docs/specs/app-update.md`: "Check for Updates…" directly below "About Agentshed" | the menu's template | True: the item is in the Edit menu, the Agentshed menu unchanged |
| The six READMEs and the landing page's copy: shortcuts | the new shortcut | No statement: `rg -n -uu "⌘\|⇧\|shortcut\|raccourci\|atajo\|<Japanese, Chinese and Russian words for shortcut>" README*.md site/src` — exit 1; control "Agentshed" hits the READMEs and `site/src/i18n/ui.ts` |
| CONTEXT **Global search** | the shortcut | True; no term changes |
| ADR-0013 (a brand name not localised), the menu's first item | the template | True: unchanged |
| Rule ↔ gate: the menu item's copy in six languages | typecheck (the dictionary's shape), `check:i18n` | Green; the key exists in all six |
| Rule ↔ gate: the accelerator is the item's alone | U1 over the template's strings, E12 over the installed menu, normalised — the fold checked on literals, the roles' own accelerators reached (the undo role's asserted; [read](evidence/ticket-273/installed-menu-accelerators.txt)) | Held by tests |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension's members changed: the menu's entries into the app | statements naming them: `rg -n -uu "Check for Updates…\|⌘,\|Cmd\+,\|CmdOrCtrl\+," docs/features docs/specs docs/adr CONTEXT.md README*.md site/src` — the UI language entry (updated), the i18n spec (already names the item), app-update's two (about that item alone) | Done |
| Pending notes in scope | `rg -n "Pending:" docs/specs/global-search.md docs/specs/i18n.md` | The global search spec's one note expired and is gone; none remains |
| A rule written this round | none new | — |
| Work state: #273 open until the merge; the key press's acceptance put to the owner, then passed by hand | #273's document sync checklist | One Waiting row, the merge, naming who follows it up |
| #271's and #272's cases in the e2e file unchanged | their Current verification rows | Still true: only the header and the new cases changed, plus E12, E13 |

### Found outside the change surface

- The i18n spec's sentence that there was no custom menu: corrected here, being in the application menu's own
  section.

### Convergence

Every row above was processed; the text changes made here (the i18n spec's sentence) were re-read against the menu
and produced no new row.

## Closeout (#274) — the whole feature

- Date: 2026-10-20
- Scope: the whole of global search, from its spec (bedc384, #269) through #271 (#276), #272 (#282, follow-up #284)
  and #273 (#286), and the records between them; this closeout's own edits included
- Version: main at f4197bb (code b6c4a41's); the closeout branch's records on top
- Languages in the searched files, counted by writing system: the specs, the feature entries, the ADR, the indexes and
  `CONTEXT.md` are English with Han, Kana, Cyrillic or accented Latin only in quotations and language names; the six
  READMEs one language each; the landing page's dictionary Chinese and English; the app's dictionaries all six; the
  prototypes Chinese and English. Searches carry a term per language where a file uses it
- Coverage: every coverage unit verified on the integrated version — the coverage checklist's Current verification,
  "Closeout (#274)" block, 42 rows, on the gateway run [verify-290558d.log](evidence/closeout/verify-290558d.log)
- Row set for stage 1: `git diff --name-only bedc384~1 HEAD -- docs CONTEXT.md 'README*' site/src src/shared/i18n
  capabilities.toml AGENTS.md ':!docs/.workings'` — 31 files, plus `CONTEXT.md`'s edit in this closeout

### Stage 1: changed declarations (the whole feature)

| Declaration surface | Checked against | Conclusion |
|---|---|---|
| `docs/specs/global-search.md` | the integrated app and its tests (the coverage checklist's closeout block, 42 rows passed, three stated gaps); its status says every story shipped; no Pending note | True |
| `docs/specs/session-view.md` (P10; Out of Scope's cross-project line) | US-003's exits and their e2e; global search as a feature of its own | True |
| `docs/specs/projects-list.md` (C8; Out of Scope) | E3's scrolled, selected row; the session questions global search covers | True |
| `docs/specs/appearance.md` D1 (`Dim = agents \| projects \| search \| settings`) | the renderer's dimension type | True |
| `docs/specs/agents-overview.md`, `docs/specs/project-detail.md` (Out of Scope lines naming global search) | global search's scope: session questions only | True |
| `docs/specs/i18n.md` (the application menu) | the installed menu; the custom menu's reason (corrected by #273) | True |
| `docs/specs/README.md` row | the spec | True |
| `docs/features/global-search.md` | the spec's user-visible layer: every capability line against a passed unit, its boundaries against the spec's accepted limits (S6, S8, S9, S10, J2, CON-001) | True; written by three tickets, it reads as one entry |
| `docs/features/session-view.md`, `docs/features/projects-list.md`, `docs/features/i18n.md` | P10, C8, the menu's entries | True |
| `docs/features/README.md` row | the entry | True |
| ADR-0034 and `docs/adr/README.md` | Accepted on in-app evidence measured on 28c3c11's corpus code, which is unchanged since (`git diff 28c3c11 f4197bb -- src/main` touches the menu only); the spec cites it and does not restate its trade-off | True: the status stands |
| `CONTEXT.md` **Global search**, **Session**, **Transfusion** | the shipped behaviour; the retired-terms note's "a future global search" — corrected in this closeout | True after the correction |
| Dictionaries, six languages (the rail, the page, the exits, the menu item) and `counted-nouns.test` | CON-004: `pnpm typecheck`, `check:i18n`, `check:ui` exit 0 on the integrated code | True |
| `capabilities.toml` (`mutation-testing`) | the capability registry | True |
| Prototypes: the shared rail, copy, hits and startup-status pieces, the global search page, the session page (the exits), the project detail page, the manifest | the integrated app: the search page's screenshots (`evidence/closeout/`); the exits' 94 computed values (#272, the code unchanged since); the hit rows' alignment (#271) | Same |

### Stage 2: related declarations (the whole feature)

| Statement (unchanged in the change set) | Its counterpart | Conclusion |
|---|---|---|
| Feature, spec and ADR index rows | their files | True |
| The six READMEs and the landing page: what the app does | global search shipped | No statement about it, and the landing page names its features as four steps, not as a full list; mentioning global search there is #279 |
| Rule ↔ gate: copy in six languages; the rail label rule; the working language | typecheck, `check:i18n`, `check:ui`, `check:lang` | Green on the integrated code |
| Rule ↔ gate: the accelerator is the item's alone | the menu unit and E12 | Held by tests |
| A term translated by two tickets: "sessions" in the exits (#272) and the menu item (#273) | each dictionary's own word | The same word in each language |

### Stage 3: events (the whole feature)

| Event | Lines checked | Conclusion |
|---|---|---|
| The rail's dimensions grew from three to four | `rg -n -i "rail (has\|carries\|holds)\|three (rail\|dimension\|items)\|four (rail\|dimension\|items)\|third dimension\|fourth dimension\|top group" docs/features docs/specs docs/adr CONTEXT.md README*.md site/src src` — the spec's two lines only (US-001/AC-01, the renderer decision), both true | Done |
| The menu's entries into the app grew by one | the UI language entry (updated by #273); the i18n spec (names it) | Done |
| A capability ID renamed | `capabilities.toml` (replaced by #284) | Done |
| Pending notes | `rg -n "Pending:" docs/specs` — app-update, landing-page and mac-distribution only, none about global search | None in scope |
| New rules | none written to the repository; J11 is a spec boundary | — |
| Work state | #271, #272, #273 closed with their items ticked; their document sync checklists have no open row (`rg -c "\| (Pending\|Waiting)"` over the three: exit 1); #274's rows done but the merge's | #274's merge Waiting |
| Follow-ups opened during the feature | #278 (a stripped fork's title), #279 (the landing page), #281 (dark scrollbar tracks); #270 (a check:ui false count) is not global search's | Each has its issue |

### Found outside the change surface

- `CONTEXT.md`'s retired-terms note said cross-project retrieval belonged to "a future global search": rewritten in
  place.

### Closeout conclusion

Global search is accepted as a whole on main at f4197bb: every coverage unit passed on the integrated version (the
coverage checklist's closeout block), with three stated gaps — the untitled fallback is unreachable
(US-001/AC-06), a reading failing as a whole has no end-to-end seam (S15's renderer side), and a first launch with no
saved data has no case of its own (S2) — and the key press ⌘⇧F accepted by hand. ADR-0034 stays Accepted. The documents
agree with what shipped; the one inconsistency found is corrected. #274 merged as 389d264 on 2026-10-20 (#287), no code
changed by it; the merge is recorded, and global search has no open item.

## Ticket #291 — A search hit row keeps its keyword in view

- Date: 2026-10-22
- Scope: this ticket's change only, `git diff 7fe0186` on branch `fix/search-hit-highlight` (d41964a, the specs,
  prototype and records; f8b7ca8, the implementation; b295fdb, the code review's fix; the step 7 and step 8 edits
  after it)
- Version: b295fdb and the documentation edits after it

The two questions for the feature catalogue: **what became a lie** — nothing: both entries said a hit row shows
the question on one line with the keyword highlighted, which stays true. **What was missing** — what a row does
when its keyword lies too far in to be seen: added to both entries.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/session-view.md` (REQ-002, its failure items, the implementation decision, Testing Decisions) | the implementation at b295fdb, unit by unit (`ticket-291-tasks.md`, "Spec check before step 7"); every failure item against a test | True after the spec check: the item about rows drawn while hidden was untrue for the app and is rewritten; the judging and the ellipsis measurement are an implementation decision |
| `docs/specs/global-search.md` (US-001/AC-06, S8) | the global search rows (E1, E5, E6) | True; both point to session-view::REQ-002 |
| `docs/features/session-view.md`, `docs/features/global-search.md` | session-view::REQ-002/AC-01..AC-04 | Agree: the start, the window, the keyword fallback and the resize; nothing the spec lacks |
| ADRs | — | Row set empty: no decision of this round meets the ADR bar |
| `CONTEXT.md` | the words used (hit row, keyword, cut, ellipsis) | Unchanged: no new term; "real question" (ADR-0036) is not touched |
| The prototypes ↔ the app | the shared piece `_shared/session-hits.js` against `SessionHits.tsx`: the same three steps, the same 20 characters, the same keyword fallback, judged again on a width change; the full-text snippet drawn as before in both | Agree. The app measures the ellipsis on a probe in the row; the prototype on a probe too |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | `docs/features/README.md` (Session view; Global search), `docs/specs/README.md` | Both rows still true; unchanged |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: a full-text snippet's window (20 characters before, 60 after) | session-view D2's landed note, REQ-002's applies-to line, the code (`search-sessions.ts`) | Agree |
| One fact ↔ its other statements: a hit row is one line, cut with an ellipsis | session-view D2a's corollary ("display-layer truncation"), global-search S8, REQ-002/AC-01 | Agree: the row is still cut by the stylesheet; only its start moves |
| Rule ↔ the gate that holds it: the shared hit-row piece | `check:ui`'s session-hits block, now with `_shared/session-hits.js` among its assets | Both prototype pages declare the block and reference both assets (the check passes) |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed | — | Row set empty: no enumerable dimension changed |
| `Pending:` notes in scope | `rg -n "Pending" docs/specs/session-view.md docs/specs/global-search.md docs/features/session-view.md docs/features/global-search.md`: no output | Row set empty |
| New general rules this round | a hit row keeps its keyword in view; the computed `font` shorthand is empty under tabular figures, so an ellipsis is measured on a probe | The first is session-view::REQ-002; the second is in the spec's implementation decision and the code comment beside the measurement |
| Work state changed | #291's issue (its decision, records and acceptance items); the coverage checklist's #291 rows; the document sync checklist; the task list; records of other rounds that mention #291 (`docs/.workings/macos-release-line/ticket-279-tasks.md` D9 and its checklist row), found with `rg -uu -n "#291"` | Updated where they state this ticket's state; the #279 records are dated and say what was decided then: kept |
| The independent test check's findings | F1–F8, then G1–G2 (`ticket-291-review-tests.md`) | Each handled: tests tightened, the spec's failure item and its counting rule corrected, two gaps stated in the e2e header; the documents they touched re-checked (Stage 1 rows above hold after them) |
