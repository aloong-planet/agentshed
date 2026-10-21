# UI language (i18n) — final regression

## Ticket #277 — 2026-10-21

Ticket: [#277 Reduce the app's interface languages to Chinese and English](https://github.com/aloong-planet/agentshed/issues/277).
Scope: this ticket's change, branch `feat/two-languages` from 9b7bb13: c39db9d, 7c1b7d8, bd7d697 and the step 7 edits
(the spec's Testing Decisions note, the postmortem, the records). Applies to: the language set (Chinese and English),
ADR-0035. Not a closeout ticket: the i18n feature has no ticket split, so no full-feature closeout applies.

The two questions for the feature catalogue: **what became a lie** — the UI language entry's six languages, seven
choices, French and Russian plural examples, "six languages" in its boundaries, and the index row's "six languages";
**what was missing** — that a system preferring a removed language gets English. Both answered in the entry and its
index row.

### Stage 1: changed declarations

| Declaration (file) | Checked against | Conclusion |
|---|---|---|
| `docs/features/i18n.md` | spec (user-visible layer: REQ-001..003, the dropdown and format rows, Out of Scope), the implementation (three options, fallback, regional matching, English plurals), ADR-0035 | True. "Traditional Chinese shows Simplified Chinese" follows from matching the primary subtag (`zh-Hant-*` → `zh`); "0 sessions" from English's plural rule (measured by the plural test) |
| `docs/features/README.md` (the UI language row) | the entry's overview | True |
| `docs/specs/i18n.md` | the implementation (all units verified by the targeted run and the gateway), ADR-0035, CONTEXT, the confirmed prototype | True; the Testing Decisions gap note added in step 7 matches the format test's header. Every failure-mode row it changed has a test or a stated gap — the failing system query of i18n::REQ-002/AC-02 had neither until the post-implementation check found it, and now has a unit test |
| `docs/specs/app-update.md` (QR-001/AC-01, AC-02, the menu template test note) | the e2e QR-001/AC-02 cases in both languages; the menu unit tests | True |
| `docs/specs/mac-distribution.md` (the README count) | i18n::CON-001 | True on main after this change; #239 implements its unit |
| `docs/specs/global-search.md`, `skills-view.md`, `projects-list.md`, `agents-overview.md`, `appearance.md` | the language set | True (counts removed or made "both"/"every language") |
| `docs/specs/landing-page.md` (CON-002's rationale) | ADR-0031 option 6, ADR-0035 | True |
| `docs/adr/0035-…md` | the measurement of 2026-10-19, the owner's decisions, the release list | True; its sources are dated, no temporary material is cited |
| `docs/adr/0013-…md` (status line, note), `docs/adr/README.md` | ADR-0035 | True: the language set superseded, the scope boundary kept |
| `CONTEXT.md` (Supported language, Source language, the agent-sides invariant, the retired terms) | ADR-0035, the spec, the code's language list | True; the terms are the ones the spec and the feature entry use |
| `docs/prototypes/` (settings page, dimension registry, project list, stale-note page, heading ladder, the shared rail, project column, startup status) | the implementation's selector (three options, divider, names, tick) | Consistent: the prototype was confirmed on 2026-10-21 and the e2e asserts the same three options in the same order |
| `README.md`, `README.en.md` (switcher rows); the four READMEs removed | i18n::CON-001 | True; `pnpm check:ui` green, red under two planted breaks |
| `site/README.md`, the site dictionary's header comment | ADR-0031, ADR-0035 | True |
| `src/shared/i18n/zh.ts`, `types.ts`, `index.ts` comments; the renderer and shared comments that counted languages | the code | True |
| `docs/postmortems/2026-10-21-…md` and its index row | the measurements at bd7d697 and at 5ca6477 | True |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | features (UI language row: changed), specs (i18n row: name and link unchanged, still true), ADR (0013 status, 0035 row), postmortems (new row) | All agree |
| Rule ↔ template and generated documents | No rule this change touched generates a document (the catalogue's content rules and the templates are unchanged) | Row set empty; derived from the change's files: no template or README rule text changed |
| One fact ↔ its other statements: "the UI languages are Chinese and English" | CONTEXT, ADR-0035, ADR-0013's status, the i18n spec, the feature entry and index row, landing-page::CON-002, the site's notes, the READMEs' switcher rows, the prototypes' registry, `check-lang`'s language names, `capabilities.toml`'s i18n sources (both paths still exist) | All state two languages, or point to the dictionaries without counting |
| One fact ↔ its other statements: "a stored removed language reads as follow system" | i18n::REQ-003, the spec's failure-mode row, the Implementation Decision, ADR-0035's neutral consequence | Agree |
| Rule ↔ the gate that holds it: i18n::CON-001 | `check:ui`'s README rule | Covers the links and the single bold entry. "No other localisation exists" is not checked by the gate (a new `README.xx.md` would pass it); held by review — stated here |
| Rule ↔ the gate that holds it: i18n::REQ-001/AC-03 | `pnpm typecheck` | Covers every typed use of a language code; untyped text (a JSON value, prose) is held by the search evidence, not the gate |
| Rule ↔ the gate that holds it: copy never enumerates the agent sides | `check:ui` | Scans both dictionaries; its side-count pattern covers Chinese and English, which is every dictionary there is |
| Rule ↔ the gate that holds it: the working language | `check:lang` | Its exemptions narrowed to the files that still exist; the tests that now assert Chinese copy are listed by name under the "literals only" predicate |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| E1 · An enumerable dimension changed its members: the UI languages, six → two | One pattern per script the scope uses (Latin, Han, Cyrillic, Kana; the scope's scripts counted first: Han in 62 files, Kana 1, Cyrillic 2, Latin all, of 394), over every tracked declaration surface: [evidence/ticket-277/language-dimension-sweep.txt](evidence/ticket-277/language-dimension-sweep.txt), the script beside it. Name hits 43, count hits 120, Chinese 2, Cyrillic 3, Kana 1 | Every hit classified: current statements written for two languages (the spec, the feature entry, ADR-0035, tests naming removed codes to reject them); records of their own date (ADR-0013/0014/0015/0017/0018/0031/0032, the postmortems, dated prototype notes, history comments), which CONTEXT's retired-term entry now explains; unrelated counts (six artifact types, seven days, five sources, the working-language check's Japanese). Structures aligned by position with the language list: only the dictionary table (typed by language, complete by construction) and the selector's option list (derived from the language list). No lie left |
| E1a · The enumeration gate's coverage | `enumeration-wording-gate` is enabled; its source, `check-shared-ui`, checks the agent-side dimension in the dictionaries only | The language dimension is outside it, so the sweep above was by hand. Finding for the owner: whether to build a gate for the language dimension. Recommended not to: the set changes only by an ADR-level decision, and typecheck and the README rule hold its mechanical parts |
| E2 · `Pending:` notes in scope | The touched specs: app-update (two releases exist), landing-page (the page is live), mac-distribution (a notarized release is downloadable) | None made due by this change. The landing page's note was already due (the page is live) and #239's branch removes it with the first release's documents; left to #239 so the two branches do not edit the same lines |
| E3 · New general rules | (a) a test that switches away from the pinned English switches to Chinese; (b) a guard copied into a new form is re-measured in that form | (a) lives in `check-lang`, which enforces it by listing those files; (b) is the review-tests skill's "red once is not proof" rule applied, recorded in the postmortem — its canonical home already exists |
| E4 · A defect fixed: the plural cycle guard never failed | Found in step 4, measured at bd7d697 and at 5ca6477 | Postmortem written with its index row; the code review records it |
| E5 · Work state changed | #277 (its records section, the acceptance items to tick after the merge); #239 (blocked by #277; its branch's README and spec text realign when it resumes); the feature checklist's current verification; the document sync checklist; the open PR #293 from another session, which rewrites all six READMEs | Each listed in [ticket-277-doc-sync.md](ticket-277-doc-sync.md) or raised to the owner with the delivery (the #293 overlap) |

Queue empty; the pre-delivery scope re-check is recorded in the document sync checklist.
