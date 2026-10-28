# Worklog — #325 Antigravity components: skills, the shared skills directory, subagents, plugins and MCP

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

Ticket: [#325](https://github.com/aloong-planet/agentshed/issues/325) · feature checklist: [checklist.md](checklist.md) ·
decisions: [ticket-325-decisions.md](ticket-325-decisions.md)

## Base

Stacked on #322 (PR #330, branch `feat/antigravity-registry`, head a474875), not on main — the orchestrator's recorded
decision. Worktree `agentshed-wt-325`, branch `feat/antigravity-components`, created from `origin/feat/antigravity-registry`
after `git fetch origin`; `git log origin/main..HEAD` at creation listed exactly #322's five commits (853f440, 1526670,
7bff1f7, f51fd57, a474875). The upstream was unset so nothing pushes to #322's branch by accident. No push, no PR until
the orchestrator asks for the rebase onto main.

Requirement baseline: the six specs are unchanged since the ticket's checked commit cbe22ca (`git diff --stat cbe22ca
HEAD -- docs/specs/{skills-view,skill-install,subagents-view,plugins-view,agents-overview,project-detail}.md` is empty);
only CONTEXT.md moved since (#322's product line, chip list and variable count). The checklist's #325 rows map one to
one onto the issue's 36 product acceptance items.

## UI gate (implement step 4.0)

Every interface point of this ticket and the confirmed prototype (owner, 2026-10-28) that draws it:

| Interface point | Prototype |
|---|---|
| Skills list: the AG badge slot, Antigravity global rows, a name several sides hold on one row, the drawer's side switch with Antigravity | agents-page (Skills), skills-view preview |
| Skills list: `flutter:<skill>` rows with AG and the plugin pill | agents-page (Skills) |
| Side card: skill and subagent counts | agents-page (side cards) |
| Subagents list: CC CX AG slots; drawer switch Claude(.md) / Codex(.toml) / Antigravity(.md); Antigravity kv rows tools, subagent, mainAgent, model | agents-page (Subagents) |
| Plugins: ANTIGRAVITY group, rows name · v · enabled pill · "From <marketplace>"; expansion with skills / subagents / MCP | agents-page (Plugins) |
| MCP: ANTIGRAVITY group headed by `~/.gemini/config/mcp_config.json`; disabled pill; plugin rows "From the <plugin> plugin" | agents-page (MCP) |
| Project Skills: "Shared · .agents/skills" heading with CX AG, between the Codex and Antigravity groups; "Global level · Antigravity"; plugin rows with their side's badge | project-detail (Skills), skills-view preview |
| Project Subagents: grouped by level and side, "Project level · .agents/agents", Antigravity rows without shadow pills | project-detail (Subagents) |
| Project Plugins: ANTIGRAVITY group, "In effect globally · from <marketplace>" | project-detail (Plugins) |
| Project MCP: Antigravity servers (global and plugin) | project-detail (MCP) |
| Install picker: one mark per landing directory, the shared mark one outlined group CX AG; stale rows disabled with "Stale, disabled"; "Same name installed" | skill-install |
| Install toast for the shared directory; uninstall confirmation sentence for the shared directory | skill-install |

No point without a prototype. Deviations from a prototype's form are recorded in the decisions file with their reason.

## Slices (one branch)

1. Antigravity global skills — the three directories by precedence, the copy agy uses for preview and install, the
   known roots, the side card count (skills-view::REQ-001/AC-01…AC-03, AC-05, AC-06; skill-install::REQ-001/AC-05).
2. Antigravity plugins — the group, enablement, contents; the plugin skills join on both pages; the plugin roots'
   registration (plugins-view::REQ-001; skills-view::REQ-001/AC-04; skills-view::REQ-002/AC-05).
3. MCP — the Antigravity group on both pages (agents-overview::REQ-003/AC-04; project-detail::REQ-002/AC-03).
4. Subagents — both global forms, the project-level form, the drawer, project grouping (subagents-view::REQ-001).
5. The shared skills directory in project detail, its uninstall sentence (skills-view::REQ-002; skill-install::REQ-002).
6. Install — one landing per directory, the picker's marks, stale and same-name rows, the toasts
   (skill-install::REQ-001, skill-install::REQ-003).
7. Restoring display data saved before the new fields; contract validation.
8. Documents: features, spec write-backs, CONTEXT check, checklist current verification, doc sync.

## Tasklist

- [x] T1 Test design review (`/review-tests` design review) → ticket-325-review-tests.md
- [x] T2 Slices 1–7 by TDD, with typecheck and the slice's tests after each
- [x] T3 Targeted verification: lint, the changed tests, the tests importing changed modules (list from search) — see
  "Targeted verification" below; committed as f68f91e
- [x] T4 Checklist reconciliation for #325's units (below)
- [x] T5 `/review-code` → ticket-325-review-code.md (six findings; fixes with red-first cases)
- [ ] T6 Full verification gate, pre-review run. First run (2026-10-29, at e783065) red on `check:lang` alone: the
  decisions record quoted a Chinese dictionary value; every other command exit 0 (e2e 141 passed, smoke OK). The
  record was fixed and the run repeated at the next commit; the red log is kept in the session scratch, not the repo
  (it quotes the offending line, and no current conclusion rests on it)
- [ ] T7 `/review-tests` post-implementation check (independent sub-agent) → ticket-325-review-tests.md
- [ ] T8 Spec reconciliation (read-only on code), write-backs
- [ ] T9 Archive: decisions, CONTEXT, features (`/features-catalog`), doc sync, checklist rows
- [ ] T10 Full verification gate, final run; commit

## Targeted verification (implement step 4.6), 2026-10-29, before f68f91e

- `pnpm typecheck` exit 0; `pnpm lint` exit 0 (after `pnpm --dir site install --frozen-lockfile`: the fresh worktree
  had no `site/node_modules`, so every site file failed type resolution — a setup gap, not a code finding).
- `pnpm vitest run` (the whole unit suite, a superset of the searched list): 81 files passed, 1 skipped; 968 tests.
- `pnpm check:ui`, `check:lang`, `check:i18n`, `check:nul`: exit 0 each (their own `node --test` suites included).
- `e2e/app.spec.ts` is itself a changed test file, so all of it ran after a fresh `electron-vite build`: 90 passed
  (exit 0, 2.6 min). The two new cases were re-run after the A8 step was added to the picker case: passed.
- The list derived by search — the changed source modules and every test importing one of them, statically or
  dynamically (`plural.test.ts` imports `./index`, which loads both dictionaries), and the tests reading changed data
  files (`scripts/check-lang.test.mjs`, `scripts/check-shared-ui.test.mjs`):

```
rg -l --glob '*.test.ts' --glob '*.test.mjs' "from '(\./|\.\./|@shared/|\.\./\.\./)?(providers/)?(global|install|plugins|project-detail|read-utils|skill-package|subagents|types|scan|display-data|display-shape|domain|validate|ipc|skill-landing|i18n|i18n/en|i18n/zh|en|zh|errors)'" src scripts e2e
rg -n --glob '*.test.ts' "import\(" src
rg -l --glob '*.test.*' "theme\.css|i18n/(en|zh)" src scripts
```

  48 unit files and the two script suites; all inside the runs above.

## UI evidence (ui-design §7), 2026-10-29, at the code of f68f91e

A throwaway spec (deleted, never committed) drove the e2e fixture home through every new surface in English and Chinese
on a fresh build, saving 28 screenshots to the session scratchpad (`t325/shots/`). Read and checked against the
prototypes: the side cards' counts; the Skills list's AG slot and `flutter:` row; the picker's outlined CX AG mark, the
"Stale, disabled" row, the "Same name installed" tag and the CC mark; the Subagents slots and the four Antigravity drawer
rows; the Plugins group with tabs Skills / Subagents / MCP; the MCP group with the Disabled pill and the plugin note;
project detail's shared group between Codex's and Antigravity's global groups with CX AG, the shared rows' badges, the
uninstall sentence under the path, the grouped subagents without shadow pills, the project MCP group.
Seen in passing, not this change's: the app has no `.bdg` rule, so badge slots touch (the prototypes give them a 3px gap).

## Checklist reconciliation (implement step 4.7), 2026-10-29, at f68f91e

Every #325 row of [checklist.md](checklist.md)'s "Spec → tickets → verification" against the issue's 36 product items
(one to one) and the evidence now in hand. U = `src/main/providers/antigravity-components.test.ts` (S = `src/shared/
skill-landing.test.ts`, D = `src/main/display-store.test.ts`), E1/E2 = the two new cases in `e2e/app.spec.ts`
("the agents page with Antigravity's components…", "the shared skills directory: one install target…").

| Unit | Evidence (all passing) | State |
|---|---|---|
| skills-view::REQ-001/AC-01 | U "a name in two…", "a name in all three…", "the preview opens the copy agy uses…"; E1 CLI copy in the drawer | done |
| skills-view::REQ-001/AC-02 | U "agy's built-in skills are not listed"; E1 no `agy-customizations` row | done |
| skills-view::REQ-001/AC-03 | U "a name Claude also holds…"; E1 slots CC…AG and the drawer's Claude / Antigravity switch | done |
| skills-view::REQ-001/AC-04 | U "an enabled plugin's skills join…"; E1 `flutter:` row with AG and Plugin | done |
| skills-view::REQ-001/AC-05 | E1 card "2 projects · 3 global skills · 3 subagents" | done |
| skills-view::REQ-001/AC-06 | U "Codex's ~/.agents/skills is not Antigravity's library" | done |
| skills-view::REQ-002/AC-01 | U ".agents/skills is one project-level group…"; E2 heading with CX AG on agy-demo and transfer, order | done |
| skills-view::REQ-002/AC-02 | E2 shared row previews (drawer names both loaders) and uninstalls | done |
| skills-view::REQ-002/AC-03 | U (same); E2 commit-style / release-notes / tdd hidden from the global groups | done |
| skills-view::REQ-002/AC-04 | U (same); E2 headings order and counts | done |
| skills-view::REQ-002/AC-05 | E2 the plugin row's AG slot | done |
| skills-view::REQ-002/AC-06 | U "the group shows whatever the project is registered on…" | done |
| skill-install::REQ-001/AC-01 | S skillLandings; U "…lands once, with one result…"; E2 marks on agy-demo and transfer | done |
| skill-install::REQ-001/AC-02 | S "no sides, no landing"; E2 decision-form on agy-demo: no mark, the A8 notice | done |
| skill-install::REQ-001/AC-03 | U second install's one conflict | done |
| skill-install::REQ-001/AC-04 | E2 toast "Installed release-notes → agy-demo's shared directory…"; U one result | done |
| skill-install::REQ-001/AC-05 | U "an Antigravity-only skill installs the copy agy uses"; E2 CLI copy on disk | done |
| skill-install::REQ-002/AC-01 | E2 path, sentence, deletion on disk | done |
| skill-install::REQ-003/AC-01 | E2 stale row disabled, labelled, forced click installs nothing | done |
| skill-install::REQ-003/AC-02 | U holdings; E2 tagged rows, blocked notice, nothing in any landing | done |
| subagents-view::REQ-001/AC-01 | U both forms; U project directory form, flat not read | done |
| subagents-view::REQ-001/AC-02 | U naming and description, content as written | done |
| subagents-view::REQ-001/AC-03 | U mainAgent false listed; E1 drawer row | done |
| subagents-view::REQ-001/AC-04 | U one entry, both details; E1 merged row and drawer switch | done |
| subagents-view::REQ-001/AC-05 | U no shadowing; E2 headings, no shadow pill | done |
| subagents-view::REQ-001/AC-06 | E1 the plugin's agent in its Subagents tab only | done |
| plugins-view::REQ-001/AC-01 | U the flutter-shaped plugin; E1 row | done |
| plugins-view::REQ-001/AC-02 | U enablement states, missing / unparsable configuration; E1 Enabled / Not enabled | done |
| plugins-view::REQ-001/AC-03 | U contents; E1 tabs Skills / Subagents / MCP, preview | done |
| plugins-view::REQ-001/AC-04 | U join; E1 disabling → gone | done |
| plugins-view::REQ-001/AC-05 | E2 "In effect globally · from …"; U workspace plugins not read | done |
| plugins-view::REQ-001/AC-06 | E1 disabled plugin readable; no merging by name: U "a Claude plugin and an Antigravity plugin bundling one skill name give two entries…" and E "two sides' plugins bundling one skill name…" (added in review, 2026-10-29) | done |
| agents-overview::REQ-003/AC-01 (#325's part) | E1 card counts | done |
| agents-overview::REQ-003/AC-03 (#325's part) | E1 per section | done |
| agents-overview::REQ-003/AC-04 | U MCP cases; E1 MCP group | done |
| project-detail::REQ-002/AC-03 | E2 project MCP group, no demo-stdio | done |
| project-detail::REQ-002/AC-04 (#325's part) | E2 Skills, Subagents, Plugins | done |

No unit is missing or partial; the gate timing rules leave nothing post-delivery for this ticket. Proceed to step 5.
