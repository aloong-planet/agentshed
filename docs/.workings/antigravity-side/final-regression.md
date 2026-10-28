# Antigravity CLI side — documentation regression

Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md. Each ticket of
the feature adds its own section for its step 8; the closeout (#327) adds the full-feature section.

## #322 Antigravity side: registry, project list and activity — 2026-10-29

Ticket: [#322](https://github.com/aloong-planet/agentshed/issues/322) · scope: this ticket's change (branch
`feat/antigravity-registry` from `cbe22ca`; product code as of `1526670`, tests as of `7bff1f7`, documents in the same PR). Languages
in scope, by a script count (`grep -c -P '[\x{4e00}-\x{9fff}]'` per file): the feature pages, the two specs and
CONTEXT.md hold no Han text; README.md is Chinese and was searched with Chinese terms as well (Stage 3).

### Stage 1: changed declarations

Declaration surfaces this round changed (`git diff --stat cbe22ca` restricted to documents, dictionaries, READMEs,
package metadata, site and prototypes): six feature pages, two specs, CONTEXT.md. Dictionaries, READMEs,
`package.json`, the site, the prototypes and the ADRs are unchanged (that command's output for those paths is empty).

| Pair | Statement checked | Result |
|---|---|---|
| projects-list spec ↔ implementation | projects-list::REQ-001/AC-01 … AC-05 and the added boundary sentence (entries that are not paths, unreadable or non-local first folder) | True: each has a passing case (checklist, current verification), the non-local first folder included since the test review's round ("a first folder that is not a local file credits no project…") |
| token-stats spec ↔ implementation | token-stats::CON-001, CON-002 and the four added failure-mode bullets (log first, full copy, killed read, folder field and zero depth) | True: the reader copies the log first, plainly, under `mkdtemp` (owner-only, asserted while a read runs), credits field 7 else field 1.1, treats depth 0 as no marker, reads an unchanged conversation from its last read and retries a failed one (each with a case since the test review's round); the copy order and a killed read are named gaps; the measured figures are this round's |
| projects-list spec ↔ features | The trusted-folder registry, untrusted folders, agy's own projects, first-folder activity, subagents, the log's time | Agree; the features page says nothing the spec does not |
| token-stats spec ↔ features | The overview names the sides whose records are aggregated; the reads that change nothing | Agree: Antigravity CLI usage is not aggregated in this ticket (its usage is #323's) |
| agents-overview spec ↔ features | agents-overview::CON-004, REQ-003/AC-01 (detection, project count), REQ-003/AC-03 (Memory nothing) | Agree; the features page states what the side's card does not read yet |
| project-detail spec ↔ features | project-detail::REQ-002/AC-01 (header chips), AC-04 (Memory D4) | Agree; Sessions and Overview now name the sides whose data they hold |
| memory-view spec ↔ features | D4 for an Antigravity-only project; Antigravity CLI memories out of scope | Agree |
| session-view spec ↔ features | The Sessions list's sides | Agree for this ticket (no Antigravity session is listed; session-view::REQ-003 is #324's) |
| ADR-0037 ↔ specs and features | Registry, root, no writes, subagent recognition, first-folder credit | No statement contradicts the ADR; no new decision reaches the ADR threshold (recorded in [ticket-322-decisions.md](ticket-322-decisions.md)) |
| CONTEXT ↔ every document above | "Antigravity CLI" in documents, "Antigravity" / AG / ANTIGRAVITY in the interface; "Project", "registry", "Activity", "Stale project" used as defined | True after this round's fixes ("Antigravity" bare corrected to "Antigravity CLI" in two feature sentences) |
| Prototypes ↔ implementation | Side card chip and pair, dropdown and hover names with the Google-blue dot, header chip, stale note chips, the fourth badge slot and skeleton card | Match: window screenshots in light and dark against the agents-page, project-list, project-detail and stale-note prototypes; computed colours by the e2e colour case |

### Stage 2: related declarations

| Relation | Statement checked | Result |
|---|---|---|
| features README ↔ the six changed pages | Each page's one-line description | Still true (Project list's "the union of every side's registered projects" became true of the fourth side by this ticket); no change |
| specs README ↔ the two changed specs | Their one-line descriptions | Unchanged meaning; no change |
| Rule ↔ its gate: copy never enumerates the sides as a closed set | `pnpm check:ui` mirrors the side names from `side-badge.ts`, so "Antigravity" joined its surface without a change to the gate; its run passed (pre-review log) | Covered |
| Rule ↔ its gate: one source for the chip labels | The same gate mirrors `SIDE_CHIP_LABEL`, ANTIGRAVITY included | Covered |
| The side's names ↔ every statement of them | agents-overview::CON-004 ↔ `side-badge.ts` ↔ the project list's names ↔ the prototypes' `SIDE_NAME` and chips ↔ CONTEXT "Agent side" | Agree |
| The badge pair ↔ every statement of it | The spec's four values ↔ `theme.css` ↔ the prototypes' `_shared/theme.css` | Agree (identical values) |
| The side colour ↔ ADR-0021 | `.dot.antigravity` on `--p-google` in the app and in the prototypes' `project-side.css` | Agree |
| The display cache's fill-in ↔ CONTEXT's page-switch invariant | "a field added to a saved type is filled in on restore" | Agree; this ticket applies it to the side Records |
| The memory D4 copy ↔ the memory-view spec and features | The dictionary's sentence (Claude-side mechanism, Codex global) ↔ D4 ↔ the features sentence | Agree; the copy is unchanged and still true for an Antigravity-only project |
| The closeout's sync row ↔ this report | It said the closeout creates this file | Was false once this section existed; rewritten |
| Other tickets' sync rows ↔ the sentences this round wrote | #323, #324, #325 will make "Claude Code, Codex and Grok" sentences and the Antigravity boundary untrue | Each of their rows now names the sentence to rewrite |
| The feature checklist's mapping ↔ its current verification | Every unit #322 owns has a current-verification row naming its evidence | Agree |

### Stage 3: events

| Event | How it was enumerated | Result |
|---|---|---|
| The agent sides grew from three to four | English: `rg -n -i "both sides\|all three\|three sides\|every side\|each side\|all sides\|every agent side\|each agent side\|Claude Code, Codex\|Claude Code / Codex\|Codex and Grok\|and Grok\|Claude and Codex\|Grok\)" docs/features README.md README.en.md CONTEXT.md package.json site/src`; Chinese (Han characters written as code-point escapes, which rg reads as the characters): `rg -n "\x{4e24}\x{4fa7}\|\x{4e09}\x{4fa7}\|\x{5404}\x{4fa7}\|\x{6bcf}\x{4e00}\x{4fa7}\|\x{6bcf}\x{4fa7}\|\x{6240}\x{6709}\x{4fa7}\|\x{5168}\x{90e8}\x{4fa7}\|Claude Code\x{3001}Codex\|Codex \x{548c}\|Grok\|\x{548c}\x{5176}\x{4ed6}\|\x{7b49}\x{7f16}\x{7801}" README.md README.en.md site/src`; dictionaries through `pnpm check:ui` (its surface covers the new side, Stage 2); index-aligned side structures: `rg -n "\['cl', 'cx'\|'cl' \| 'cx'\|\['claude', 'codex'" src scripts` (only the configuration tabs' selectors, not side arrays; the side arrays derive from `SIDE_BADGE`) | Made false and rewritten: the dropdown's list (projects-list), "every side's global library" (agents-overview), "sessions on every agent side" (project-detail, session-view), "every side's session records" (token-stats), CONTEXT's product line and chip list. Still true: the README and site lines ("Claude Code, Codex and other coding agents"), the subagent and MCP sentences naming Claude and Codex, the accounting sentence naming Codex and Grok, CONTEXT's TokenTotals invariant (three sides with usage; amended when Antigravity usage lands, #323's row). Judged true at the level they speak, with a caveat: README.en.md's "every agent side's global picture on one screen, with its token totals" (README.md line 15 says the same in Chinese) and the site's overview card ("what every coding agent has installed and how many tokens it has burned"; its alt text describes its screenshot) describe the page's shape — a card per side with its totals — while the Antigravity card's figure stays zero until #323 counts the side's usage, which the agents-overview features page states; #323's and the closeout's regressions re-read them |
| Pending notes in range | `rg -n "Pending:" docs/specs/projects-list.md docs/specs/token-stats.md docs/specs/agents-overview.md docs/specs/project-detail.md docs/specs/memory-view.md` → one: token-stats::REQ-003/AC-08 (multi-folder conversation) | Not expired: 19 of 19 conversations on this machine list one folder. Kept; re-judged at the closeout |
| New general rules this round | Review of the decisions table | None: deriving the side set from a total Record applies ADR-0020; filling a saved payload in applies CONTEXT's page-switch invariant |
| Work state changed | The feature checklist, the sync checklists, the ticket | Current verification rows written; this ticket's sync rows done; the issue's checkboxes are ticked after the merge (outside the repository) |

Queue empty after the fixes above; the pre-delivery scope re-check is recorded in
[ticket-322-doc-sync.md](ticket-322-doc-sync.md).

## #323 Antigravity usage in the statistics — 2026-10-29

Ticket: [#323](https://github.com/aloong-planet/agentshed/issues/323) · scope: this ticket's change (branch
`feat/antigravity-usage`, stacked on #322's `a474875`; product code as of `fc5d0b1`, tests as of the post-implementation
check's fixes, documents in the same branch). Languages in scope, by a script count (`grep -c -P '[\x{4e00}-\x{9fff}]'` and `grep -c -P '[A-Za-z]'` per
file): the four feature pages, the three specs, CONTEXT.md, ADR-0037 and the new postmortem with its index hold no Han
text; README.md is Chinese
(50 Han lines) and README.en.md English; the dictionaries hold both, the Chinese one by definition.

### Stage 1: changed declarations

Declaration surfaces this round changed (`git diff --stat a474875 -- docs README.md README.en.md package.json site
src/shared/i18n docs/prototypes`, plus CONTEXT.md): four feature pages (token-stats, agents-overview, project-detail,
projects-list), three specs (token-stats, agents-overview, projects-list), ADR-0037 (an appended note), CONTEXT.md,
both dictionaries (the unreadable line), and a postmortem with its index row (step 7). READMEs, `package.json`, the
site and the prototypes are unchanged.

| Pair | Statement checked | Result |
|---|---|---|
| token-stats spec ↔ implementation | token-stats::CON-001 (the columns read, the trajectory table's cascade id added), CON-002 (usage reads), REQ-003/AC-01 … AC-09 (AC-03's difference and AC-06's no-step record rule as written back), REQ-004/AC-01 … AC-04, and the failure-mode bullets this round added or rewrote (read twice per scan, a verdict kept until the files change, the activity walk's format check, the call without identity, a deletion between listing and read, a record's bytes in memory one at a time, model names as text) | True: each has a passing case in `antigravity.test.ts` / `agy-proto.test.ts` / `token-stats.test.ts` (the checklist's current verification) — the call without identity, the two deletion windows of the usage read and the unreadable conversation agy then writes since the post-implementation check (F2–F4); the memory figures measured (research §10.11). The deletion bullet was made exact (deleted before its read: gone that scan; while read: gone the next); the walk's own deletion window and the checkpoint between the two copies are header gaps of `antigravity.test.ts` |
| agents-overview spec ↔ implementation | agents-overview::REQ-003/AC-01 (the figure), AC-02 (line, warning colour, tooltip, zero → usual line), the two added failure modes (the error first; the count saved with the display copy) | True: e2e "Antigravity usage: the card in every window …"; the error first, the count after the repair: e2e "Antigravity usage: a corrupt settings file on the card comes before the unreadable count …" (F5); the display store case for the saved count |
| projects-list spec ↔ implementation | The rewritten boundary: a conversation that will not open, is not in the supported format or whose record will not decode gives no activity; a failed read while agy writes keeps the last folder | True: the walk cases "a conversation in another format gives its folder no activity either" and "a walk read that fails while a log is beside the database keeps the last folder …" |
| token-stats spec ↔ features | Every agent side aggregated; Antigravity CLI's accounting (once per call, forks, four-field total above agy's own by the reads and any writes, failed attempts, subagents, models as recorded, no-model calls); unreadable conversations and the read while agy writes; untrusted folders global; past days kept through rewinds, unreadable turns and a deleted fork parent; per-model exactness; `/btw` and the Auto-mode reviewer not counted; desktop app and IDE not read | Agree; the features page says nothing the spec does not |
| agents-overview spec ↔ features | The unreadable line, its colour, hover text, figure kept, return to the usual line, error first; the side's card now carries its usage | Agree |
| project-detail spec ↔ features | project-detail::REQ-002/AC-04's Overview part: usage counts in the Overview like every side's; not listed in Sessions | Agree (Sessions are #324's) |
| projects-list spec ↔ features | A subagent conversation and one in a format the app does not support neither count nor move the time | Agree |
| ADR-0037 ↔ specs and features | "Higher than agy's own by exactly the cache reads" | The appended note and REQ-003/AC-03 say the same: exactly the reads where no write is reported (every measured call), by any writes too otherwise; the features page says so |
| CONTEXT ↔ every document above | "Antigravity CLI" in documents (two bare "Antigravity" in the feature pages corrected this round); the TokenTotals.input invariant amended: Antigravity CLI's input leaves the reads out, cache writes reported by Claude Code and Antigravity CLI only, the three buckets on every side | True after the fixes |
| Dictionaries ↔ prototype | `agents.unreadableConversations`, `agents.unreadableTip` in zh and en against the agents-page prototype's `unreadableConvs` / `unreadableTip` | Same wording in both languages (en plural by the language's rules, as the prototype's `plural`) |
| Prototypes ↔ implementation | The card's figure and its warning line, the trend switch's Antigravity, the model rows, the project Overview's per-side row | Match: window screenshots in light and dark against the agents-page and project-detail prototypes; computed colour `rgb(179, 85, 47)` (e2e) and `rgb(240, 168, 132)` (dark) — the two `--warn-fg` values |
| Postmortem ↔ implementation and records (re-checked after the post-implementation check's fixes) | [2026-10-29](../../postmortems/2026-10-29-a-guard-read-after-the-value-it-guards.md): the four sites now guarding first, the cases named, the per-site defence and the refactor item | True against `token-stats.ts` at fc5d0b1 (the guard first in `antigravityPlan`, `sessionQuestions`, `codexPlan`, `codexShown`), the cases K1–K3 (red against the unfixed order, the code review record's Runnability 1) and K4 at 0e8f5b9 (the variant's checks, each red when removed — the postmortem says it pins no order), and the code review record's refactor list; corrected after the incremental check's F8, which found the postmortem crediting K4 with a red against the unfixed code |

### Stage 2: related declarations

| Relation | Statement checked | Result |
|---|---|---|
| features README ↔ the four changed pages | Each page's one-line description | Still true; no change |
| specs README ↔ the three changed specs | Their one-line descriptions | Unchanged meaning; no change |
| postmortems README ↔ the new postmortem | Its index row: date, title, the one-line account | Added with the file; the line says what the file says (a new reader and two Codex readers; a `null` entry failing every scan; no case had written one) |
| Rule ↔ its gate: copy never enumerates the sides as a closed set | The new copy names one side's tool (agy) only; `pnpm check:ui` ran green on it (pre-review log) | Covered |
| The unreadable count ↔ every statement of it | token-stats::REQ-004/AC-02 ↔ agents-overview::REQ-003/AC-02 ↔ the dictionaries ↔ the agents-page prototype's demo note ("comes from the conversation databases the scan could not read") ↔ the features pages | Agree |
| The cache version ↔ statements of it | The current value and change log live only in the `CACHE_VERSION` comment (session-view's rule); `rg -n "c17\b\|\+c1[0-9]\|version 17\|v17\b\|structure version 1[0-9]\|CACHE_VERSION" docs CONTEXT.md README.md README.en.md scripts site/src` → no stale value; C16's conversion note names the 17 → 18 step | Agree |
| The archive's e2e stamps ↔ the cache version | `+c17` literals in two e2e cases | Moved to `+c18` with the bump (the comment's own instruction) |
| Rule ↔ its gate: the working language (English) in this feature's working records ↔ `pnpm check:lang` | The gate reads tracked and untracked-unignored files, so an ignored record is scanned only once it is added | Covered once committed: the fix's targeted run went red on Chinese quoted in this report (tracked), fixed; the ticket's ignored records were scanned with the gate's own character class before being added (none left), and the full run scans them committed |
| Other tickets' sync rows ↔ the sentences this round rewrote | #324's row cites project-detail's boundary ("not listed in Sessions" — kept); #325's row cites agents-overview's boundary ("skills, subagents, plugins and MCP servers are not read" — kept) | Still accurate; no change |
| The feature checklist's mapping ↔ its current verification | Every unit #323 owns gets a current-verification row naming its evidence | Written with this round (see checklist) |

### Stage 3: events

| Event | How it was enumerated | Result |
|---|---|---|
| Antigravity CLI's usage is now counted (statements that it is not, or that its figure is zero) | `rg -n -i "not read\|read zero\|reads zero\|figure stays zero\|usage is not\|usage, skills\|zero until" docs/features docs/specs CONTEXT.md README.md README.en.md site/src docs/prototypes/agents-page docs/prototypes/project-detail` (44 lines, saved in the session scratch); Chinese: README.md's line 15 (its overview sentence, which names each side's token usage) and the site's `ui.ts` overview lines read directly | Made false and rewritten: agents-overview's boundary on the side ("its usage … are not read, so its card's figure … read zero"), project-detail's ("its usage is not in the Overview's figures"), token-stats' overview ("Claude Code, Codex and Grok"). Now true without change: README.md line 15 / README.en.md line 18 ("every agent side's global picture … with its token totals") and the site's overview card ("how many tokens it has burned") — the caveat #322's regression left for this ticket is closed |
| The trend switch gained a mode | `rg -n -i "Claude / Codex / Grok\|Claude, Codex, Grok\|Claude, Codex and Grok\|single side" docs/features docs/specs/token-stats.md docs/specs/project-detail.md`; index-aligned structures: the mode bar and the skeleton's derive from `TREND_MODE_LABEL` (a total Record) | Every statement speaks of "a single side", count-neutral; nothing aligned by index |
| The cache structure version moved (17 → 18) | As in Stage 2 | No stale statement |
| Pending notes in range | `rg -n "Pending:" docs/specs/token-stats.md docs/specs/agents-overview.md docs/specs/project-detail.md docs/specs/projects-list.md` → one: token-stats::REQ-003/AC-08 | Not expired: 19 of 19 conversations on this machine list one folder; kept for the closeout |
| New general rules this round | The decisions table ([ticket-323-decisions.md](ticket-323-decisions.md)) | None at the CONTEXT/ADR level: the shape guard before a cached entry's kind applies the spec's existing cache rule (C2, Implementation Decisions "Cache"); the own-id and copy rules are this side's, written into token-stats::CON-001 and REQ-003/AC-06. The guard read after the value it guards met the three conditions for a postmortem (root cause, why no case caught it, a defence at every site): [2026-10-29](../../postmortems/2026-10-29-a-guard-read-after-the-value-it-guards.md), indexed in the postmortems README; its statements agree with the code review record's Runnability 1, the cases K1–K3 for the guard order and K4 for the variant's checks (re-checked after F8) |
| Work state changed | The feature checklist, this ticket's sync checklist | Current verification rows for #323 written after the fix commit 0e8f5b9, every quoted case title checked against the test files (54 of 54 found); the regression row's Gate part verified by the full run at 57dd5ec ([ticket-323-gate-full.log](ticket-323-gate-full.log), OVERALL exit=0); this ticket's sync rows done (see [ticket-323-doc-sync.md](ticket-323-doc-sync.md)) |
| The post-implementation check's findings resolved (F1–F7) | The statements the check listed as untrue at fc5d0b1: the code review record's Runnability 2, this report's token-stats and agents-overview rows, the test review's Dimension 1 sentence on header gaps | Each rewritten to the cases added in 0e8f5b9 (see the rows above and the test review record's increment); the token-stats deletion bullet made exact |

## #325 Antigravity components: skills, the shared skills directory, subagents, plugins and MCP — 2026-10-29

Ticket: [#325](https://github.com/aloong-planet/agentshed/issues/325) · scope: this ticket's change (branch
`feat/antigravity-components`, stacked on #322's `a474875`; product code and tests as of `e783065`, documents as of
this section's commit). Languages in scope, by a script count (`grep -c -P '[\x{4e00}-\x{9fff}]'` per file, control
`src/shared/i18n/zh.ts` 379): the six feature pages, the six specs, CONTEXT.md and the features and specs indexes hold
no Han text; README.md (50 lines), `site/src/i18n/ui.ts` and the Chinese dictionary hold Chinese, so the first two were
searched with Chinese terms as well (Stage 3) and the dictionary through `pnpm check:ui`.

### Stage 1: changed declarations

Declaration surfaces this round changed (`git diff --stat a474875 HEAD -- docs/features docs/specs docs/adr
CONTEXT.md README.md README.en.md package.json site docs/prototypes src/shared/i18n`): six feature pages, the features
index (one row, from Stage 2), six specs, the two dictionaries. ADRs, CONTEXT.md, the root READMEs, `package.json`, the
site and the prototypes are unchanged (that command's output for those paths is empty).

| Pair | Statement checked | Result |
|---|---|---|
| skills-view spec ↔ implementation | REQ-001/AC-01…AC-06, REQ-002/AC-01…AC-06 and the boundaries written back (shared rows and drawer, two sides' plugin rows) | True: each unit's evidence in the checklist's current verification; the written-back boundaries driven by E2 (shared row badges, drawer label) and E4 (two rows, the open one kept); "the row's preview opens that copy" also when a higher directory holds the name without a SKILL.md (U39, added for the test review's finding 5) |
| skill-install spec ↔ implementation | REQ-001/AC-01…AC-05, REQ-002/AC-01, REQ-003/AC-01, AC-02 and the boundaries written back (the copy a shared landing takes, the failure notice naming the directory, nothing installed for a tagged target, tags per opening) | True: U23–U26, E3, E5; "Codex's copy when both qualify" is asserted by U23 (the two copies differ, the landed one is Codex's) |
| subagents-view spec ↔ implementation | REQ-001/AC-01…AC-06, the boundaries written back (first in name order, block scalars, the drawer's rows) and the project detail layout | True: U15–U19, U33, E1, E2; first in name order by U38, the drawer's "—" rows by E1's exact key-value read, Claude's and Codex's project headings by E2's `transfer` read — the three added for the test review's finding 4 |
| plugins-view spec ↔ implementation | REQ-001/AC-01…AC-06 and the settled boundaries (identity, no marketplace, group visibility, agents' names, links and duplicates, block scalars, two sides' plugins) | True: U8–U11, U30–U34, E1, E4; identity by directory (U35), non-boolean enabled values (U36), an agent named by its file (U37), the no-marketplace forms on both pages (E4), the group hidden without agy (E5) and empty with it (#322's case) — added for the test review's findings 1 and 2 |
| agents-overview spec ↔ implementation | B2 (written back), REQ-003/AC-01, AC-03, AC-04 and the MCP boundaries | True: E1 card line and Antigravity's MCP rows; U12–U14; Claude's plugin server naming its plugin (U30, E4 — finding 3); the group's empty sentence (E4, #322's case) and its absence without agy (E5) — finding 2 |
| project-detail spec ↔ implementation | REQ-002/AC-03, AC-04 and the MCP group's visibility | True: E2 (with servers); no group on a project's page without servers (#322's case — finding 2) |
| each spec ↔ its features page | The six pairs, the capabilities and boundaries written this round | Agree; no features sentence states a behaviour the spec lacks |
| ADR-0037 ↔ specs and features | Shared skills directory one target and one group; built-in skills, rules, project MCP file not shown; components shown only where agy was observed to load them | No contradiction; no decision this round reaches the ADR threshold (decisions in [ticket-325-decisions.md](ticket-325-decisions.md)) |
| CONTEXT ↔ every document above | "Shared skills directory" (one group, one target, uninstall for every loader, always project-level), "Antigravity CLI" in documents and "Antigravity" / AG in the interface, "Global library", "Effective view" | True |
| Prototypes ↔ implementation | The interface points of the worklog's UI gate table | Match: 28 screenshots against the agents-page, project-detail, install and skills-preview prototypes (worklog "UI evidence"); the review fixes add no form |
| Dictionaries ↔ the behaviour they state | The new and changed keys (`installedShared`, `pickStale`, `pickHasSame`, `pickTarget`, `noAgMcp`, `mcpFromPlugin`, `fromMarketplace`, `inEffectGlobally`, the subagent hints, `projectGroup`, `globalGroup`, `secShared`, `secAgGlobal`, `confirmShared`, `sideJoin`) | True: each is read on screen in English by E1–E5 or #322's case — `noAgMcp` by E4 and #322's case, `inEffectGlobally`'s bare form by E4, `projectGroup` for all three directories by E2 (corrected after the test review's findings 2 and 4, which found these three unread); the Chinese values carry the same slots (`pnpm check:i18n`, `pnpm typecheck`) |

### Stage 2: related declarations

| Relation | Statement checked | Result |
|---|---|---|
| features README ↔ the six changed pages | Each page's one-line description | Made false and rewritten: Subagents view's "Both sides' subagent definitions" (three sides are read now). Still true: Agents overview, Project detail, Plugins view ("grouped by side"), Skills install, Skills view |
| specs README ↔ the six changed specs | Their one-line descriptions | Unchanged meaning; no change |
| Rule ↔ its gate: copy never enumerates the sides as a closed set | `pnpm check:ui` over the dictionaries; this round removed the `noneGlobal` exemption (its copy no longer names sides) and wrote no new enumeration; the gate passed (pre-review log) | Covered for the dictionaries. Not covered by the gate: an enumeration formed by joining names at run time (`sideJoin`) — the joined names are the directory's loaders, a fact about one directory rather than the side set, so the rule does not apply; recorded here as the reason |
| A fact ↔ its other statements: the shared skills directory | CONTEXT "Shared skills directory" ↔ ADR-0037 ↔ skills-view::REQ-002 ↔ skill-install::REQ-001/REQ-002 ↔ the features pages (skills-view, skill-install, project-detail) ↔ the install and skills-preview prototypes | Agree |
| A fact ↔ its other statements: the side card's skill count | agents-overview B2 (written back) ↔ skills-view::REQ-001/AC-05 ↔ the features page's card bullet ↔ the agents-page prototype's card line | Agree; the prototype draws counts, not their accounting |
| A fact ↔ its other statements: the MCP row form | agents-overview REQ-003 boundaries (written back) ↔ the agents-page prototype (plugin note on Claude's plugin row) ↔ the features page's MCP bullet | Agree |
| A fact ↔ its other statements: project detail's Subagents layout | subagents-view Implementation Decisions (written back) ↔ the features pages (subagents-view, project-detail) ↔ the project-detail prototype | Agree |
| A fact ↔ its other statements: block-scalar descriptions | plugins-view and subagents-view boundaries ↔ plugins-view H1 and skills-view's "frontmatter description" | Agree: "the frontmatter description" is now what is shown for that form too |
| Other tickets' sync rows ↔ the sentences this round wrote | #322's row for CONTEXT "Agent side" ("being onboarded"); #323's and #324's rows naming agents-overview and project-detail sentences | #322's row: still true (usage and sessions are not read yet), left for the closeout. The agents-overview boundary bullet now says only the usage is not read — #323's row names that sentence; project-detail's Sessions bullet untouched (#324's) |
| The feature checklist's mapping ↔ its current verification | Every unit #325 owns has a current-verification row naming its evidence | Agree (rows written this round) |

### Stage 3: events

| Event | How it was enumerated | Result |
|---|---|---|
| The sides whose skills, subagents, plugins and MCP servers are read grew by Antigravity CLI | English: `rg -n -i "Claude and Codex\|Claude Code and Codex\|Claude Code, Codex\|both sides\|two sides\|either side\|all three\|three sides\|Codex and Grok\|and Grok\b" docs/features README.md README.en.md CONTEXT.md package.json site/src` and the six specs; Chinese (code-point escapes): `rg -n "\x{4e24}\x{4fa7}\|\x{4e09}\x{4fa7}\|\x{53cc}\x{7aef}\|\x{53cc}\x{4fa7}\|Claude Code\x{3001}Codex\|Claude \x{548c} Codex\|Claude\x{4e0e}Codex\|Codex \x{548c}" README.md README.en.md site/src`; dictionaries through `pnpm check:ui` | Made false and rewritten: the features pages' Skills, Subagents, Plugins and MCP sentences (agents-overview, subagents-view, plugins-view), the features index row for Subagents, the subagents-view spec's Solution, user stories 1 and 3 and A1, plugins-view's user story 7, E9 and sequence H's heading, skills-view A9, agents-overview A1–A3 (already false since Grok, found in this read). Still true: README and site lines (side-neutral: "Claude Code, Codex and other coding agents", "the agent sides' subagents"), problem statements written in the past tense, the Sessions and token sentences naming three sides (#323's and #324's) |
| The side card's skill count changed meaning for Claude (its enabled plugins' skills no longer counted) | `rg -n -i "global skill\|skill count\|skills count" docs/features README.md README.en.md site/src CONTEXT.md`; Chinese `rg -n "\x{5168}\x{5c40} \?skill\|\x{6280}\x{80fd}\x{6570}" README.md site/src` | Only the agents-overview features page states it; rewritten |
| The install picker lists stale projects (it excluded them) | `rg -n -i "stale projects excluded\|excluded stale\|stale.{0,20}excluded" docs README.md README.en.md site/src src/shared/i18n`; Chinese for the old dictionary value | No statement left (the dictionary title and the skill-install features page were rewritten this round) |
| Claude's plugin MCP servers gain the plugin note; descriptions in block-scalar form read as text on every side | Covered by the two Stage 2 rows above | No other statement found |
| Pending notes in range | `rg -n "Pending:"` over the six specs → none | Nothing to judge |
| New general rules this round | Review of the decisions table and the code review's findings | None: keying a merged list's rows by source applies React's key rule; reading block scalars applies CONTEXT's sampling invariant (grounded in the sample); following a plugin agent's link follows the "admitting fails invisibly" invariant |
| Work state changed | The feature checklist, the sync checklists, the ticket | Current verification rows written; this ticket's sync rows; the issue's checkboxes are ticked after the merge (outside the repository) |

Queue empty after the fixes above; the pre-delivery scope re-check is recorded in
[ticket-325-doc-sync.md](ticket-325-doc-sync.md).

## #326 Configuration shows CLAUDE.md and AGENTS.md (2026-10-29)

Ticket: [#326](https://github.com/aloong-planet/agentshed/issues/326) · range: cbe22ca..HEAD of
feat/configuration-two-entries (implementation d0c68d7, 8e0a464, a9c382f, 8493010, 84f0b76, plus this round's
documentation commit) · scope: this ticket's change only (not a feature closeout — #327 is the closeout ticket).

### Stage 1: changed declarations

The declaration files this round changed: `docs/specs/agents-overview.md`, `docs/specs/project-detail.md`,
`docs/features/agents-overview.md`, `docs/features/project-detail.md`, `CONTEXT.md`, the dictionaries
(`src/shared/i18n/zh.ts`, `en.ts` — the `i18n` capability is enabled), and this feature's working records.

| Pair | Statement | Verdict |
|---|---|---|
| spec ↔ implementation | agents-overview::REQ-004/AC-01…AC-05, B5 (now "None" in its card, truncation, the card's height), the failure modes (unreadable slot and its declared form, GEMINI.md without AGENTS.md, entries named by file), the new "Configuration files carry their paths" decision, the Testing Decisions sentence on the restore | True against `global.ts`, `read-utils.ts`, `display-data.ts`, `ConfigSection.tsx`, `theme.css`; each failure mode has a test (ticket-326-review-tests.md, Coverage) |
| spec ↔ implementation | project-detail A4, REQ-002/AC-02 and its failure modes (form of the read error), the new "Configuration entries carry their paths" decision, the rewritten Testing Decisions (configuration over any project) | True against `project-detail.ts`, `display-data.ts`, `DetailPane.tsx`, the e2e case's fixture projects |
| spec ↔ features | agents-overview: features' Configuration bullet (two entries, Codex's then Antigravity CLI's two root-first, path headings, card that scrolls past about half the window, "None", unreadable under its path, truncation, no summary, no GEMINI.md or rules) against REQ-004 and B5 | Consistent; nothing in features absent from the spec, no user-visible change of the spec missing |
| spec ↔ features | project-detail: features' Configuration bullet against REQ-002/AC-02, A4, R3 | Consistent |
| ADR ↔ spec/features | ADR-0037 "Configuration narrowed…": two entries, the three paths in order, path headings, summaries removed, GEMINI.md and rules nowhere, Grok's AGENTS.md not added | Restated faithfully in both specs and features; no new decision of this round reaches the ADR threshold (ticket-326-decisions.md: each is a local choice) |
| CONTEXT ↔ all | The saved-page invariant now covers a reshaped field and a conversion fed by the main process; terms in the touched documents: "Antigravity CLI" in documents (features), "agy" in specs as before, "Configuration section", "None" | Consistent; no synonym introduced |
| prototype ↔ implementation | The switch (two file-named entries), the path line (monospace 11px, secondary colour, a rule above every file but the first), several files in one card, "None" as a line in the card, the card at 52vh scrolling inside | Match, checked on screenshots of both pages in light and dark against the prototypes' Configuration tabs and by the e2e case's computed values. The unreadable slot is not drawn in the prototypes: declared exemption, written into both specs. The gap between a path and a rendered first heading follows the app's one markdown rule set (CONTEXT invariant), not the prototypes' mock `h3` |
| dictionaries ↔ prototypes' copy | `config.none` (the Chinese value and "None") against the prototypes' shared `cfgNone` in both languages; `config.unreadable` has no prototype counterpart (the state is undrawn) | Match; the unreadable sentence follows the subagent read-error wording already in the dictionaries |
| working records | checklist.md's #326 rows, ticket-326-review-code.md, ticket-326-review-tests.md, ticket-326-decisions.md | True at this round's commits; the decisions record's "rewritten to say so" and "written into both specs" are now true (both specs carry them) |

### Stage 2: related declarations

| Relation | Rows derived | Verdict |
|---|---|---|
| file ↔ its index row | `docs/features/README.md` rows for Agents overview and Project detail; `docs/specs/README.md` rows for both specs | Still true: neither row names the configuration entries or a summary |
| a fact ↔ its other statements | Search in both languages (the scope uses Han and Latin script, counted per area). English: `config.toml summary`, `settings summary`, `codexConfigSummary`, `settingsSummary`, `claudeGlobalMd`, `codexAgentsMd`, `File does not exist`, `global AGENTS.md`, `global CLAUDE.md`, `Configuration section/tab`, `Config tab`. Chinese: the zh dictionary's own values of the removed or renamed keys (`agents.cfgToml`, `agents.cfgClaudeMd`, `agents.cfgAgentsMd`, `agents.fileMissing`, `detail.settingsSummary`, `detail.fileMissing`) and the prototypes' Chinese name for the configuration tab, each searched as written there. Over `docs/` (except other features' working records), `CONTEXT.md`, both READMEs, `site/src`, `src`, `e2e`, `scripts`: 100 lines, read in full | Every hit outside this change still true: memory-view spec D "rendered directly (the same pattern as the Configuration section)" and its `MemoryView.tsx` comment; memory-view features "CLAUDE.md and AGENTS.md"; ADR-0037; the prototypes; README.md / README.en.md and `site/src/i18n/ui.ts` speak of "configuration" generally. Entry-count statements (`two entries`, `three entries` and their Chinese forms) all say two |
| rule ↔ its gate | "Copy never enumerates the sides" — `pnpm check:ui` (passed in the pre-review run); the saved-page conversion rule (CONTEXT) — no gate: held by review and by restore tests written per change | The first is covered for the dictionaries; the second is held by people, as before this round |

### Stage 3: events

| Event | Check | Verdict |
|---|---|---|
| An enumerable member set changed: the Configuration section's entries (three to two on both pages) and the global AGENTS.md files (one to up to three) | Searched for statements counting or listing them (stage 2's searches and the entry-count search) | All current; no positional parallel structure depends on either set |
| `Pending:` notes in range | `rg -n Pending` over both specs and both features pages: no hit (exit 1) | None to judge |
| A new general rule this round | The saved-page invariant's widening (a reshaped field is converted; a missing fact comes from the main process) | Its text lives in CONTEXT.md (Invariants, "A page switch is atomic…") |
| Work state changes | This ticket's rows in checklist.md (Current verification), ticket-326-doc-sync.md, issue #326 (closed by the PR's merge, which the orchestrator performs) | checklist and doc-sync updated in this PR; the issue's state follows the merge |

Pre-delivery scope re-check (document-sync.md), 2026-10-29: the changes of this round (two specs, two features pages,
CONTEXT.md, the dictionaries, the working records) were set against the doc-sync checklist's rows; one item the
checklist lacked was added (the CONTEXT amendment), none marked done rested on a basis that no longer holds.
