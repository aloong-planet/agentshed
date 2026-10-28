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
