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
  key press note, the reviews), 03a5ba3 (the spec and the feature entries), and the tests and records after the
  post-implementation check
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
| `docs/features/global-search.md`: ⌘⇧F, or "Search Sessions…" at the bottom of the Edit menu, from anywhere, as left, the cursor in the box, the search page itself included | US-004/AC-01, AC-02, J10; E12, E13 | True for what can be checked; the key press itself is the stated gap (the feature line states the behaviour a user gets from the key, which the platform's accelerator gives) |
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
| Rule ↔ gate: the accelerator is the item's alone | U1 over the template's strings, E12 over the installed menu, normalised, the roles' own accelerators included ([read](evidence/ticket-273/installed-menu-accelerators.txt)) | Held by tests |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension's members changed: the menu's entries into the app | statements naming them: `rg -n -uu "Check for Updates…\|⌘,\|Cmd\+,\|CmdOrCtrl\+," docs/features docs/specs docs/adr CONTEXT.md README*.md site/src` — the UI language entry (updated), the i18n spec (already names the item), app-update's two (about that item alone) | Done |
| Pending notes in scope | `rg -n "Pending:" docs/specs/global-search.md docs/specs/i18n.md` | The global search spec's one note expired and is gone; none remains |
| A rule written this round | none new | — |
| Work state: #273 open until the merge; the key press's acceptance put to the owner | #273's document sync checklist | Two Waiting rows, each naming its event and who follows it up |
| #271's and #272's cases in the e2e file unchanged | their Current verification rows | Still true: only the header and the new cases changed, plus E12, E13 |

### Found outside the change surface

- The i18n spec's sentence that there was no custom menu: corrected here, being in the application menu's own
  section.

### Convergence

Every row above was processed; the text changes made here (the i18n spec's sentence) were re-read against the menu
and produced no new row.
