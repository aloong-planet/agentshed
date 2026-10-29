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

## #324 Antigravity sessions and turns — 2026-10-29

Ticket: [#324](https://github.com/aloong-planet/agentshed/issues/324) · scope: this ticket's change (branch
`feat/antigravity-sessions`, stacked on #323's `c9f69aa`; product code as of the post-implementation fix `0e9f3ea`,
documents in the same branch). Languages in scope, by a script count (`grep -c -P '[\x{4e00}-\x{9fff}]'` and
`grep -c -P '[A-Za-z]'` per file): the three feature pages, the two specs and CONTEXT.md hold no Han text; README.md
(50 Han lines) and `site/src/i18n/ui.ts` (47) hold Chinese beside English; README.en.md is English (one Han line, the
language switcher); the dictionaries hold both, the Chinese one by definition.

### Stage 1: changed declarations

Declaration surfaces this round changed (`git diff --stat c9f69aa -- docs README.md README.en.md package.json site
src/shared/i18n docs/prototypes CONTEXT.md`, working records aside): three feature pages (session-view, project-detail,
global-search), two specs (session-view, token-stats), CONTEXT.md and both dictionaries (the fork banner's two forms,
the fork pill's copied-history tooltip, the subagent block's reworded note). READMEs, `package.json`, the site, the
prototypes and the ADRs are unchanged (that command lists none of them).

| Pair | Statement checked | Result |
|---|---|---|
| session-view spec ↔ implementation | session-view::REQ-003, REQ-004, REQ-005 and the Antigravity clauses of US-001/AC-01, AC-04, AC-07, unit by unit; "Failure modes and boundaries: Antigravity sessions" with the 2026-10-29 write-backs; Implementation Decisions "The Antigravity CLI side" | True: the spec final check in [ticket-324-review-code.md](ticket-324-review-code.md) finds every unit met at the fix; every failure mode is driven by a case (the test review's coverage and its increment, T35–T43) except the refusal of a turn after agy rewrites a transcript, a named gap in `antigravity.test.ts`'s header with what would close it |
| session-view spec ↔ implementation | R1 "The rule = listed sessions + subagent and nested transcripts" | Made false for this side by this ticket (REQ-004/AC-09: a subagent conversation is not on the list, its transcript never read); R1 now names the Antigravity CLI exception and points to REQ-004/AC-09 |
| token-stats spec ↔ implementation | C16's 18 → 19 conversion sentence; REQ-004's cache key "and … its transcript's modification time and size" | True: `CACHE_VERSION` 19; the entry's signature is the database's plus the transcript's time and size; the shape guard accepts the empty fields the conversion gives (`''` id, `null` time, fork and title, no question, not listed) and no row reads them |
| session-view spec ↔ features | The pages' new sentences against the spec: the Sessions list on every agent side; agy's own title, a later one at the next automatic refresh (the spec: "at the next scan"); questions without the notes agy appends (REQ-004/AC-01); the turn's answer, plain-text thinking, tool calls with results, a dispatch with what came back, a failed call as text (AC-04 to AC-06); a rewound question unnumbered, unshown and not found by a question search (AC-03 and the full-text boundary); a fork's own questions and tokens (REQ-005/AC-03, REQ-003/AC-05); the copied-history banner, never uncertain, and its no-longer-here form (REQ-005); `agy --conversation`, the conversation ID, the database as the record file (US-001); the opened-and-left conversation as a warmup session (REQ-003/AC-02); a subagent's own steps not shown (REQ-004/AC-05); workspace links as text (introduced content) | Agree after two fixes this round: "the next refresh" became "the next automatic refresh" (the page's own term), and "the message the subagent sent back" became "what the subagent sent back" (a subagent may send several, shown in order) |
| session-view spec ↔ features | "Subagent dispatches are visible in place" | Rewritten this round to the two reasons the steps are not shown (no stable reference chain, or the subagent's own record, not read), as the reworded note says |
| project-detail spec ↔ features | project-detail::REQ-002/AC-04: the Sessions section shows the side | Agree: Sessions lists every agent side; the boundary now says an Antigravity CLI conversation is listed with the AG badge |
| global-search spec ↔ features | global-search::REQ-001: listed sessions' displayed questions are searched | Agree: the boundary adds that a question undone by a rewind cannot be found |
| ADR-0037 ↔ specs and features | "a session is one conversation database, identified by its path"; "Turn contents: from the conversation's `transcript_full.jsonl`, by byte range; a turn whose step indices are later reused … is abandoned" | No statement contradicts the ADR; no decision of this round reaches the ADR threshold ([ticket-324-decisions.md](ticket-324-decisions.md): the allow-list's content and the derived transcript are in REQ-004/AC-09 and CONTEXT "Session") |
| CONTEXT ↔ every document above | "Session" (the database is the identity; the transcript read only through it) and "Turn" (a byte range in the transcript) amended; "Antigravity CLI" in documents, "Antigravity" / AG in the interface; "fork", "rewind", "undone" used alike in the spec, the pages and the dictionaries | True |
| Dictionaries ↔ prototype | `session.forkedFromCopiedTail` and `forkedFromGone` against the session-page prototype's `forkedFromCopied` and `forkedFromGone`, both languages | Same wording (the e2e reads the English banner's whole sentence); `detail.forkTipCopied` is a copy variant of the drawn pill and `turn.unlinkedNote` the block's default copy, both under the pure-copy exemption (the spec's in-turn blocks entry; [ticket-324-decisions.md](ticket-324-decisions.md)) |
| Prototypes ↔ implementation | The AG rows and fork pills, both banner forms, the header's ID, resume and Finder buttons, the thinking block, a tool call | Match: window screenshots in light and dark at the implementation (the Sessions tab, the fork's page with its banner and header tooltip, the parent's turn, the gone banner, global search). The prototype's Antigravity sub block draws inner steps from its mock data (its header calls the session content mock); the product shows the unattributed note, as on every side (C3) |

### Stage 2: related declarations

| Relation | Statement checked | Result |
|---|---|---|
| features README ↔ the three changed pages | Each page's one-line description | Still true (session view: "the page copies a session's own ID and the command to resume it in its tool" holds for the fourth side); no change |
| specs README ↔ the two changed specs | Their rows (links only) | No change |
| Rule ↔ its gate: copy never enumerates the sides, by name or by count (CONTEXT) ↔ `pnpm check:ui` | The reworded note dropped its side count, so its allowance in `check-shared-ui.mjs` lost its object and was removed; the gate ran green on the new copy (targeted run). The gate's count words are the two-side forms (the Chinese for "two sides", written `\x{4e24}\x{4fa7}` here, "both sides", "both global", "two sides"): a "three sides", or the Chinese for "four sides" (`\x{56db}\x{4fa7}`), would pass it | Covered for this round's copy; the wider count forms are held by hand (Stage 3's searches, both languages, found none in the dictionaries). Widening the word list is outside this ticket: raised in the delivery report for the owner to place |
| Rule ↔ its gate: the working language in this feature's records ↔ `pnpm check:lang` | The ticket's ignored records are scanned once added with `-f` | Covered: the check ran green with every record of this round added |
| The read allow-list ↔ every statement of it | session-view R1, REQ-004/AC-09, CONTEXT "Session", the security seam's comment | R1 amended (Stage 1); the others agree |
| The subagent block's note ↔ every statement of it | Both dictionaries ↔ spec C3 ("an unattributed warning") and REQ-004/AC-05 ↔ the features page ↔ the gate's allowance list | Agree after this round's rewrite; the e2e reads of the Claude and Codex dispatches keep their phrase |
| The cache version ↔ statements of it | `rg -n "\+c18\b|\bc18\b|version 18\b|structure version 1[0-9]|v18\b"` outside the working records → the change-log comment and C16's conversion note only | Agree; the e2e stamps moved to `+c19` |
| Other tickets' sync rows ↔ the sentences this round rewrote | #325's rows (skills and component pages, project-detail's Skills line — untouched), #326's (the Configuration lines — untouched), #327's (the README index, CONTEXT's onboarding note, the Pending note — untouched) | Still accurate; no change |
| The feature checklist's mapping ↔ its current verification | Every unit #324 owns has a current-verification row naming its evidence | Re-evidenced with the fix (`0e9f3ea`, [ticket-324-fix-targeted.log](ticket-324-fix-targeted.log)) |

### Stage 3: events

| Event | How it was enumerated | Result |
|---|---|---|
| The sides whose sessions are listed and searched grew from three to four | English: `rg -n -i "Claude Code, Codex and Grok|Claude Code, Codex, Grok|Codex and Grok|CC/CX/GK|CC / CX / GK|three sides|all three|both sides|every side|each side|all sides|every agent side|each agent side|Claude Code / Codex|Claude and Codex|codex resume|grok --resume|claude --resume|agy --conversation" docs/features docs/specs/{session-view,project-detail,global-search,token-stats}.md CONTEXT.md README.md README.en.md package.json site/src src/shared/i18n` (73 lines, saved in the session scratch); Chinese (Han characters as code-point escapes): `rg -n "\x{4e24}\x{4fa7}|\x{4e09}\x{4fa7}|\x{56db}\x{4fa7}|\x{5404}\x{4fa7}|\x{6bcf}\x{4e00}\x{4fa7}|\x{6bcf}\x{4fa7}|\x{6240}\x{6709}\x{4fa7}|\x{5168}\x{90e8}\x{4fa7}|Claude Code\x{3001}Codex|Codex \x{548c}|Codex\x{548c}|Grok|CC/CX/GK|codex resume|grok --resume|claude --resume|agy --conversation" README.md site/src/i18n/ui.ts src/shared/i18n/zh.ts` (5 lines); index-aligned structures: the badge, the side's full name and the resume command derive from total Records keyed by side (`SIDE_BADGE`, `SIDE_FULL_NAME`, the resume builder's switch, #322) | Made false and rewritten: session-view's Sessions line ("Claude Code, Codex and Grok … CC/CX/GK") and its resume list; project-detail's Sessions line and its boundary ("not listed in Sessions"). The subagent note's "(measured on both sides)" — shown on Antigravity dispatches from this round — rewritten (next row). Still true: README.md lines 5 and 38, README.en.md lines 18 and 50, the site's lede (side-neutral); the agents page's "both sides" copy (`emptyGlobalLib`, `globalHint`, `projectHint`, allowed by key for the surfaces they judge) is outside sessions |
| Subagent blocks now appear for a side whose dispatch names its subagent's conversation | The note's two dictionary entries, the features sentence, spec C3 and REQ-004/AC-05 | The note's reason ("no stable reference chain … measured on both sides") was untrue of an Antigravity dispatch: rewritten in both languages and in the features page; C3 and REQ-004/AC-05 already true |
| A side's thinking block has a body | `rg -n -i "thinking|reasoning"` over the pages, the specs in range, CONTEXT, README.en.md, the site and the English dictionary; Chinese: `rg -n "\x{601d}\x{8003}|\x{63a8}\x{7406}" README.md site/src/i18n/ui.ts src/shared/i18n/zh.ts` | Made false and rewritten: session-view's "Reasoning and thinking are presented honestly" (now names Antigravity CLI's plain-text thinking). Still true: C6 (it speaks of Claude and Codex), `thinkingSum` ("plain text available"), `reasoningNote` (Codex against Claude) |
| The cache structure version moved (18 → 19) | As in Stage 2 | No stale statement |
| Pending notes in range | `rg -n "Pending:" docs/specs/session-view.md docs/specs/token-stats.md docs/specs/project-detail.md docs/specs/global-search.md CONTEXT.md` → one: token-stats::REQ-003/AC-08 (multi-folder conversation) | Not expired: this round observed no conversation listing more than one folder; kept for the closeout |
| New general rules this round | The decisions table ([ticket-324-decisions.md](ticket-324-decisions.md)) | None at the CONTEXT or ADR level: what this side's allow-list holds (the database, the transcript derived from it on the main process) is a rule of this side, written into session-view::REQ-004/AC-09, R1 and CONTEXT "Session"; the summaries copy directory is a test seam following the parse jobs'; the note's wording applies CONTEXT's existing side-count rule |
| Work state changed | The feature checklist, this ticket's sync checklist, the review records; outside the repository the research notes (§10.12) and, after the merge, the issue's checkboxes | Current-verification rows rewritten after the fix; sync rows updated (see [ticket-324-doc-sync.md](ticket-324-doc-sync.md)) |
| The post-implementation check's findings resolved (F1–F5) | The statements the check listed as untrue at 05faa8a: the checklist's four rows (F1), the Design review's coverage row on the compaction gap (F2), the "Verified" rows above the six untested write-backs (F3) | Each now true: the cases T35–T43, the header gap, the rows re-evidenced; the version commands' exit codes are in the full run's log (F5) |

Queue empty after the fixes above; the pre-delivery scope re-check is recorded in
[ticket-324-doc-sync.md](ticket-324-doc-sync.md).

## #325 Antigravity components: skills, the shared skills directory, subagents, plugins and MCP — 2026-10-29

Ticket: [#325](https://github.com/aloong-planet/agentshed/issues/325) · scope: this ticket's change (branch
`feat/antigravity-components`, stacked on #322's `a474875`; product code as of `e783065`, tests as of `14c76ba`,
documents as of this section's commit). Languages in scope, by a script count (`grep -c -P '[\x{4e00}-\x{9fff}]'` per file, control
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
| plugins-view spec ↔ implementation | REQ-001/AC-01…AC-06 and the settled boundaries (identity, no marketplace, group visibility, agents' names, links and duplicates, block scalars, two sides' plugins) | True: U8–U11, U30–U34, E1, E4; identity by directory (U35), non-boolean enabled values (U36), an agent named by its file (U37), the no-marketplace forms on both pages (E4), the group hidden without agy and without plugins (E5), drawn without agy for a plugin (E4) and empty with agy (#322's case) — added for the test review's findings 1, 2 and 7 |
| agents-overview spec ↔ implementation | B2 (written back), REQ-003/AC-01, AC-03, AC-04 and the MCP boundaries | True: E1 card line and Antigravity's MCP rows; U12–U14; Claude's plugin server naming its plugin (U30, E4 — finding 3); the group's empty sentence with agy (#322's case), its absence without agy and without servers (E5), and its presence without agy for a server (E4) — findings 2 and 7 |
| project-detail spec ↔ implementation | REQ-002/AC-03, AC-04 and the MCP group's visibility | True: E2 (with servers); no group on a project's page without servers (#322's case — finding 2) |
| each spec ↔ its features page | The six pairs, the capabilities and boundaries written this round | Agree; no features sentence states a behaviour the spec lacks |
| ADR-0037 ↔ specs and features | Shared skills directory one target and one group; built-in skills, rules, project MCP file not shown; components shown only where agy was observed to load them | No contradiction; no decision this round reaches the ADR threshold (decisions in [ticket-325-decisions.md](ticket-325-decisions.md)) |
| CONTEXT ↔ every document above | "Shared skills directory" (one group, one target, uninstall for every loader, always project-level), "Antigravity CLI" in documents and "Antigravity" / AG in the interface, "Global library", "Effective view" | True |
| Prototypes ↔ implementation | The interface points of the worklog's UI gate table | Match: 28 screenshots against the agents-page, project-detail, install and skills-preview prototypes (worklog "UI evidence"); the review fixes add no form |
| Dictionaries ↔ the behaviour they state | The new and changed keys (`installedShared`, `pickStale`, `pickHasSame`, `pickTarget`, `noAgMcp`, `mcpFromPlugin`, `fromMarketplace`, `inEffectGlobally`, the subagent hints, `projectGroup`, `globalGroup`, `secShared`, `secAgGlobal`, `confirmShared`, `sideJoin`) | True: each is read on screen in English by E1–E5 or #322's case — `noAgMcp` by #322's case, `inEffectGlobally`'s bare form by E4, `projectGroup` for all three directories by E2 (corrected after the test review's findings 2 and 4, which found these three unread); the Chinese values carry the same slots (`pnpm check:i18n`, `pnpm typecheck`) |

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

## #327 Closeout: the full-feature regression — 2026-10-29

Ticket: [#327](https://github.com/aloong-planet/agentshed/issues/327), the feature's closeout ticket (its issue says so) ·
scope: **the whole feature**, `7fe3588..HEAD` of `feat/antigravity-closeout` — #328's specification commit `cbe22ca`
(ADR-0037, CONTEXT.md, the eleven specs, the prototypes), the five implementation tickets as the landing rehearsal
combined them (`dc80aa2`: #329 for #326, #330 for #322, #323, #325, #324), and this ticket's commits (`db5aecf` the
`~/.gemini` path fold, `87ec0b3` the combined e2e case, `a57150b`, `2e76d06`, `434cfac` and `274cb00` the documents and records, `9762152` the side-badge slot gap with the case's review fixes). The tree is the combined
product the feature will be on main once the five land and this branch is rebased onto them. Languages in scope, by a
script count per file (`grep -c -P '[\x{4e00}-\x{9fff}]'` and `grep -c -P '[A-Za-z]'`): the eleven feature pages, the
eleven specs, CONTEXT.md and ADR-0037 hold no Han text; README.md (50 Han lines), `site/src/i18n/ui.ts` (47) and the
Chinese dictionary (376) hold Chinese and were searched with Chinese terms too; README.en.md holds one (the language
switcher).

### Full-feature checklist reconciliation (features-catalog, the full-feature closeout)

- **The mapping, both ways** (`/to-tickets` "The feature checklist"): a script lists every coverage unit the eleven
  specs define on a line the feature added (86) and every identifier the checklist's "Spec → tickets → verification"
  table names, ranges expanded — 0 units without a mapping row; the 7 mapped identifiers not defined in the range are
  existing units the feature amended or cites (the Antigravity clauses of session-view::US-001/AC-01, AC-04, AC-07,
  session-view::CON-001/CON-002, global-search::REQ-001). 89 units, as the breakdown audit counted. Recorded in the
  checklist's Two-way audit.
- **Every unit re-judged against the combined product**: the closeout rows of the checklist's Current verification
  (dated 2026-10-29, #327). The per-ticket rows' "Verified for #32x's path; the rest is #32y's" were each written on a
  branch that held one ticket's paths; every case they quote is in the combined tree's test files (196 of 196 titles, a
  script over the rows' quotes) and ran green in this tree's full gate ([ticket-327-gate-full.log](ticket-327-gate-full.log)),
  so each unit's paths are now verified together. The two cross-ticket units the issue names have their own evidence:
  agents-overview::REQ-003/AC-01 (the card read whole) and project-detail::REQ-002/AC-04 (one all-sides project, every
  section) by the e2e case "the Antigravity side whole: …"; token-stats::REQ-003/AC-08's Pending note re-judged and
  kept ([ticket-327-pending-check.log](ticket-327-pending-check.log)).
- No unit is unmapped, unverified or failing; no acceptance criterion was narrowed or removed.

### Stage 1: changed declarations

Declaration surfaces the whole feature changed (`git diff --stat 7fe3588 HEAD -- docs/features docs/specs docs/adr
docs/postmortems docs/prototypes CONTEXT.md README.md README.en.md package.json site src/shared/i18n`): eleven feature
pages with the index, ten specs (global-search's is unchanged), ADR-0037 with the ADR index, a postmortem with its
index, thirteen prototype files, CONTEXT.md and both dictionaries. The READMEs, `package.json` and the site are unchanged
(that command lists none of them).

| Pair | Statement checked | Result |
|---|---|---|
| specs ↔ implementation | The eleven specs' Antigravity sections, unit by unit, against the combined tree: each ticket's spec final check (the five code review records) holds for its paths; the closeout's spec final check ([ticket-327-review-code.md](ticket-327-review-code.md)) for the two combined units; every failure mode each ticket's test review traced to a case or a named header gap (the header gaps all present in the combined tree's test files — read for this regression) | True after this round's fixes: project-detail A1 listed eight sections and the page has nine (Sessions added); token-stats said the CONTEXT.md cache-write invariant "is amended when this side ships" (it was, by #323) — rewritten to the present; its Testing Decisions said the ccusage comparison covers "all three sides" — it covers Claude Code, Codex and Grok, and the Antigravity CLI baseline is the 2026-10-28 reconciliation (written); its Out of Scope called "the Claude and Grok sides" the exact ones (every side but Codex is); projects-list said the session count backfill "covers all three sides" (it covers every side's listed sessions); token-stats said a conversation found unreadable "is not read again" — true of the usage reads, which cache the verdict since #323, not of the activity walk, which keeps only successful reads (#322 had left that to #323): the failure mode now says the walk opens such a conversation at every scan |
| spec ↔ features, per slug | The eleven pairs, every features sentence the feature wrote or rewrote against its spec, read in the combined state | Agree after this round's fixes: agents-overview's Skills line listed the four libraries by name (now "every side's global library") and its Antigravity CLI boundary said the card reports "its global skills and subagents" (it reports how many); memory-view's explanation listed "Codex only, Antigravity CLI only, or both", which leaves out Grok-only projects that get it too (now side-neutral); the subagents-view, plugins-view and skills-view pages named the side "Antigravity" bare seven times, a term CONTEXT.md keeps out of documents (now "Antigravity CLI"); session-view's fork paragraph said a fork "replays the parent's history at its start" and is titled from its first question after stripping, untrue of an Antigravity CLI fork, which #324 described in another paragraph (now pointed to it) |
| ADR-0037 ↔ specs and features | Every decision bullet and the three appended notes against the specs' Antigravity sections and the features pages | No contradiction. The ADR's "presumed to be the launch directory — to be confirmed … during implementation" had no answer once implementation ended: a dated closeout note now says it is still unconfirmed and where the Pending note carries it, and that the CONTEXT.md amendment its consequences call for was made. Status reviewed: Accepted stands — nothing supersedes or narrows a decision beyond the notes already appended |
| CONTEXT ↔ every document above | The terms the feature added or amended (Agent side, Shared skills directory, Session, Turn, the TokenTotals invariant, the saved-page invariant, the flagged ambiguity) against every document in range; synonyms | True after this round's fixes: "Agent side" said Antigravity CLI is "being onboarded" — retired; `agy` stood beside "Antigravity CLI" in nine features sentences and many spec ones with no rule for which is which — the entry now says documents use `agy` for the tool acting and "Antigravity CLI" for the side (every use read against it: each is the tool acting); "Subagent" named only Claude's and Codex's definition forms (Antigravity CLI's added); "Effective enabled plugins" defined only Claude's layers while plugins-view::REQ-001/AC-04 applies the term to agy's plugins (its one layer added) |
| Prototypes ↔ implementation | The combination's interface points, which no ticket could see together: the Antigravity card with detection, figure and its three counts; a project registered on every side — the four header chips in side order, the Overview's per-side row with four figures and a four-provider bar, the Sessions list mixing the four badges, the Skills groups in order, Subagents grouped, Plugins and MCP groups | Match, against the agents-page and project-detail prototypes, read off the e2e case's rendered DOM and window screenshots of the combined build before and after this round's fix ([ticket-327-ui-evidence.log](ticket-327-ui-evidence.log)). One mismatch, in this round's range: the side-badge slots (both Skills lists, the global Subagents list) touched in the app, while the skills-view and agents-page prototypes draw them 3px apart (`.bdg`, whose agents-page width #328 widened for the fourth slot) — fixed in the implementation this round (`9762152`, the `.bdg` rule; computed gaps `[0,0,0]` → `[3,3,3]`; read by the combined case). Not in range and listed for the owner: the memory card's bound (O4). Each ticket's own interface points keep their per-ticket screenshot checks (the sections above) |
| Dictionaries ↔ behaviour | The keys the five tickets added or changed, in both languages | Unchanged by this round; `pnpm check:i18n` and `pnpm check:ui` green in the full gate |
| Postmortem ↔ implementation | [2026-10-29](../../postmortems/2026-10-29-a-guard-read-after-the-value-it-guards.md): "the four sites now guard first" | True in the combined tree: every read of a cached entry's kind in `token-stats.ts` follows `isWellFormedAgg` (enumerated: lines 280, 663, 677–679, 691–697, 730–731, 776, 892, 913), including #324's fork-parent lookup written after the postmortem |

### Stage 2: related declarations

| Relation | Statement checked | Result |
|---|---|---|
| features README ↔ the eleven touched pages | Each page's one-line description | True; the Agents overview row's "every agent sides'" corrected to "every agent side's" |
| specs README, ADR README, postmortems README ↔ their touched files | Rows (spec links; ADR-0037 "Accepted"; the postmortem's account) | True; no change |
| Rule ↔ its gate: copy never enumerates the sides ↔ `pnpm check:ui` | The gate's count words and its exemption rule, against the combined dictionaries | Covered for the two-side forms only; a "three sides" / "four sides" form passes it, and a key on the line after an allow-listed key is exempt by position (#324's and #325's findings) — held by hand this round (Stage 3's searches found none in the dictionaries); listed for the owner (O1, O2) |
| Rule ↔ its gate: the working language in this feature's records ↔ `pnpm check:lang` | Records added with `-f` | Covered: every record of this round is tracked and the full gate's check:lang ran over it |
| A fact ↔ its statements: where `~/.gemini` is read | `ScanRoots`'s comments (after the fold) ↔ the specs' paths (`~/.gemini/config/…`, `~/.gemini/skills`, `~/.gemini/AGENTS.md`) ↔ CONTEXT "Shared skills directory" | Agree: the fold changed how the paths are derived, not which (no spec names a derivation) |
| A fact ↔ its statements: the project page's sections | features "nine sections" ↔ project-detail A1 ↔ the page's tabs | Agree after A1's fix |
| A fact ↔ its statements: the side card's counts | agents-overview B2, REQ-003/AC-01 ↔ skills-view::REQ-001/AC-05 ↔ the features card bullet ↔ the agents-page prototype's three counts ↔ the card | Agree (the combined case reads the three counts on one card) |
| A fact ↔ its statements: the cache structure version | `CACHE_VERSION` 19 ↔ the e2e archive stamps (`+c19` ×2) ↔ token-stats C16's 17 → 18 → 19 steps | Agree |
| A fact ↔ its statements: the multi-folder presumption | ADR-0037's "to be confirmed" ↔ token-stats::REQ-003/AC-08's Pending note ↔ #322's and #323's checklist rows | Agree after the ADR's closeout note |
| The feature checklist's mapping ↔ its current verification | Every unit has a current row covering every path | Agree: the closeout rows |
| The tickets' sync checklists ↔ the closeout | Table below | — |
| The tickets' open findings ↔ a durable home | The decisions records, review-code refactoring lists, test review records and #325's worklog | Collected below (Open findings for the owner); #326's "two roots for one tree" resolved by `db5aecf`, and #326's decisions record now points its other two rows at this list |

### Stage 3: events

| Event | How it was enumerated | Result |
|---|---|---|
| The agent sides grew from three to four (the whole feature) | English: `rg -n -i "both sides\|all three\|three sides\|two sides\|every side\|each side\|all sides\|all four\|four sides\|claude code, codex\|claude and codex\|claude code and codex\|codex and grok\|and grok\b\|claude code / codex\|CC/CX/GK\|CC / CX / GK\|either side\|neither side\|both global\|the two sides\|both of the\|three agent\|four agent" docs/features docs/specs/{the eleven}.md CONTEXT.md README.md README.en.md site/src src/shared/i18n/en.ts package.json` (128 lines, read whole); Chinese (code-point escapes): `rg -n "\x{4e24}\x{4fa7}\|\x{4e09}\x{4fa7}\|\x{56db}\x{4fa7}\|\x{53cc}\x{7aef}\|\x{53cc}\x{4fa7}\|\x{5404}\x{4fa7}\|\x{6bcf}\x{4e00}\x{4fa7}\|\x{6bcf}\x{4fa7}\|\x{6240}\x{6709}\x{4fa7}\|\x{5168}\x{90e8}\x{4fa7}\|Claude Code\x{3001}Codex\|Claude \x{548c} Codex\|Claude\x{548c}Codex\|Codex \x{548c}\|Codex\x{548c}\|Grok\|Antigravity\|\x{4e24}\x{4e2a}\x{4fa7}\|\x{4e09}\x{4e2a}" README.md README.en.md site/src/i18n/ui.ts src/shared/i18n/zh.ts` (13 lines); index-aligned structures: `rg -n "\['claude', ?'codex'\|'cl', ?'cx'\|\['cc', ?'cx'" src scripts` outside tests | Made false and rewritten: agents-overview features (the four libraries listed), memory-view features, token-stats spec (ccusage "all three sides", "the Claude and Grok sides are exact"), projects-list spec ("all three sides"), CONTEXT "Subagent". Still true: dated measurements ("Measured 2026-08-21 … across all three sides", G7), two-side statements about Claude and Codex (subagent shadowing, `projectHint`), the READMEs' and site's "Claude Code, Codex and other coding agents" and the Chinese `\x{5404}\x{4fa7}` ("each side") and `Claude Code\x{3001}Codex \x{7b49}` ("Claude Code, Codex and others"), side-neutral, plugins-view's "A group per side — Claude Code, Codex and Antigravity CLI" (the groups that exist; Grok's plugins are not read, said on the agents page). Index-aligned: one hit, `DETAIL_SKILL_SIDES` (project detail's skill sides, Grok deliberately absent — O3); the side arrays elsewhere derive from total Records |
| Pending notes in range | `rg -n "Pending:" docs/specs docs/features CONTEXT.md docs/adr/0037-…` → one, token-stats::REQ-003/AC-08 | Not expired: 0 of 19 conversations list more than one folder (re-read 2026-10-29, read-only). Kept as written; its condition stays a product fact |
| New general rules this round | The decisions record ([ticket-327-decisions.md](ticket-327-decisions.md)) | One terminology rule — documents name the tool `agy` when it acts and the side "Antigravity CLI" — with its canonical text in CONTEXT.md ("Agent side"). The fold's "every location under `~/.gemini` derives from `geminiHome`" is a property of one type, stated on the type |
| The cache structure version moved 17 → 19 across the feature | Stage 2's row | Agree |
| Work state changed | The feature checklist, the six sync checklists, #326's decisions record, the issue | Checklist closeout rows and audit row written; #322's CONTEXT row and #327's rows done in this branch; #326's open-findings rows point here; the issue's boxes are not ticked here (the orchestrator's instruction: nothing is ticked on GitHub) |

### The tickets' document sync checklists

| Ticket | Rows | Pending | State for the closeout |
|---|---|---|---|
| [#322](ticket-322-doc-sync.md) | 8 | 0 | Seven done, each "completed with this PR's merge" — #330 not merged yet: Waiting for that merge. The CONTEXT "being onboarded" row is done in this branch (the closeout's rewrite) |
| [#323](ticket-323-doc-sync.md) | 9 | 0 | All done in its branch; Waiting for its PR's merge |
| [#324](ticket-324-doc-sync.md) | 7 | 0 | All done in its branch; Waiting for its PR's merge |
| [#325](ticket-325-doc-sync.md) | 6 | 0 | All done in its branch; Waiting for its PR's merge |
| [#326](ticket-326-doc-sync.md) | 5 | 0 | All done in its branch; Waiting for #329's merge |
| [#327](ticket-327-doc-sync.md) | see it | 0 | Done in this branch, completed with this branch's merge |

### Closeout conclusion

The full-feature closeout is complete for the combined product: every coverage unit is mapped and verified on every
path, the two cross-ticket combinations by their own e2e case, the Pending note re-judged and kept with its reason, and
the regression's three stages above are complete with every difference found fixed in this round or listed below for
the owner. Waiting, and not counted as done: the merges of #329, #330, #323, #325 and #324 (each ticket's sync rows
complete with them) and of this branch after its rebase onto them; the owner's acceptance of the feature; the issue's
acceptance boxes on GitHub.

### Open findings for the owner

Every finding the feature's records leave without a durable home, in one list. Searched: the five tickets' decisions
records and code review records (their refactoring lists included), the five test review records (read whole for this
list), #325's worklog, the six sync checklists, and this closeout's own regression. Not repeated here: findings whose
home is already a spec, a test file's header, CONTEXT.md or an ADR (each ticket's header gaps, all present in the
combined tree's test files; the fork banner's inexact wording for an unreadable parent, a session-view failure mode;
the twice-per-scan read, a token-stats failure mode), and findings already resolved (#326's two roots for one tree, by
`db5aecf`; #325's touching badge slots, by `9762152`). None blocks the
feature. None has a durable home in the repository: each needs the decision in its last column, and a ticket or a
written decision is its home once taken.

| # | Finding (source) | Impact | Recommended handling | Decision needed |
|---|---|---|---|---|
| O1 | The shared-UI gate's side-count words cover the two-side forms only ("both sides", "two sides", the Chinese for "two sides", `\x{4e24}\x{4fa7}`): "three sides", "all four" and the Chinese for "four sides", `\x{56db}\x{4fa7}`, pass (#324's regression, Stage 2) | A dictionary value enumerating the sides by count passes `pnpm check:ui`; held by hand meanwhile | Another task: match any number word with "side(s)" in both languages, with red cases for three and four | Open a ticket, or accept "held by people" |
| O2 | `scripts/check-shared-ui.mjs` exempts a line when an allow-listed key is on the previous line (`prev.includes`, line 511) — any key that follows an allow-listed one is exempt (#325's worklog) | The gate stays green over an enumeration written on the line after an allow-listed key; it hid `subagents.globalHint`'s "Both sides…" until #325 | Another task: exempt the continuation only when the previous line opens that key's value without closing it; add a red case for the neighbour | Open a ticket |
| O3 | Project detail's Skills section lists no Grok skill — neither `.grok/skills` nor Grok's global library (`DETAIL_SKILL_SIDES` is Claude, Codex, Antigravity CLI) — while the project-detail and skills-view features say anything that exists only globally is still listed (#325's worklog) | A Grok skill installed into a project does not appear on its page; the features sentence over-claims for Grok | Another task, through the prototype gate (a new group); or state the boundary in both features pages and the spec until then | Implement, or document as a boundary |
| O4 | The project page's memory card grows with MEMORY.md; the project-detail prototype bounds that card at 52vh, as it bounds the configuration card #326 aligned (#326's decisions; outside this feature's interface points) | A long MEMORY.md lengthens the page instead of scrolling inside its card | A one-rule change scoped to the memory card, as the configuration card's was | Adopt the prototype's bound, or keep the app's form (then the prototype changes, with the owner's confirmation) |
| O5 | Three unit cases skip under root with a silent `return` (`plugins.test.ts:322`, `subagents.test.ts:135`, `:150`), while subagents-view's Testing Decisions says such cases are explicitly skipped (#325's worklog) | Run as root they report green without asserting | `it.skipIf(process.getuid?.() === 0)`, as `antigravity-components.test.ts` does | Open a ticket (a three-line change) |
| O6 | `pnpm bench:scan` and `pnpm restore:archive` run in no gate; #322's first SQLite loader broke both, found only by running them by hand (#322's code review, refactoring list) | A construct valid in the app can break the developer scripts silently; a broken restore is found when it is needed | Another task: run each script's usage path in `pnpm test:scripts` | Open a ticket |
| O7 | Each reader of a cached entry calls the shape guard itself; the guard-after-read defect was fixed site by site (#323's code review, refactoring list; the 2026-10-29 postmortem names it) | If a future reader reads a field first, a corrupt entry fails every scan until the cache file is deleted (upper escape) | Another task: one accessor returning a well-formed entry or nothing, replacing the direct reads | Open a ticket |
| O8 | A named pipe at a capped-read path — now including `~/.gemini/AGENTS.md` and `~/.gemini/config/AGENTS.md` — blocks the scan (#326's code review, finding 4) | The scan hangs; never observed | Leave: a fix would change every capped read | Accept |
| O9 | A global AGENTS.md inside a directory that cannot be searched reads as absent ("None") rather than unreadable (#326's code review, finding 5, accepted there) | That entry's wording only; agy cannot load such a file either | Write it into agents-overview's failure modes as an accepted boundary, with a unit case or a named gap | Write it down, or drop it |
| O10 | The unreadable configuration file's form — the "None" line's form carrying the read error under the path — was declared a prototype exemption, not drawn (#326's decisions; both specs) | The form stands without the owner's confirmation | Confirm it, or draw the state in the prototypes | Owner confirmation |
| O11 | Spec wording changed during implementation under the standing instruction, marked "(spec)" for the owner's review: four rows in #323's decisions, six in #324's | Requirement text changed without the owner's explicit look | Review those rows; nothing changes unless the owner disagrees | Owner review |
| O12 | The specs use "Antigravity" bare about 90 times — for the side and for interface labels — against CONTEXT.md's _Avoid_ ("Antigravity" bare in documents); the features pages were brought in line this round (this closeout) | Two names for one side in requirement text; most spec sections open by naming Antigravity CLI, which keeps the bare name readable there | Either scope CONTEXT's rule (documents about what is read; interface labels quoted as such), or rewrite the specs in one pass | Which of the two |
| O13 | Refactoring items left as their records say: the activity walk caching an unreadable conversation's verdict as the usage reads do (#322's refactoring list left it to #323, which cached it for the usage reads only — the token-stats failure mode now states it); the linked parent-title fragment shared by the Codex and Antigravity CLI banners (#324, R1); project detail's skill row key colliding for two Claude plugins of one bare name from different marketplaces, `PROJECT_AGENTS_DIR` restating the reader's directories, the picker's tags not refreshed by a rescan while open, front matter read by a hand subset of YAML (#325); the e2e home builders' duplicated helpers (#327) | Self-only or Claude-only edge cases, or test code | Fold each into a later change of the same code; no ticket | Accept |
| O14 | Stale text older than the feature: `AgentsPane.tsx`'s comment above `notDetectedHint` says the button's label is passed in (it is not); the cold-start e2e case's title says "both summary cards" (four render) (#322's code review) | A misleading comment and title | Fix with the next change to those lines | Accept, or fix |
| O15 | Verification gaps the test reviews accepted and recorded only in their records — among them #326's agents-page CLAUDE.md "None" not drawn in e2e and a restored "neither file" detail's entries not asserted, #325's lack of a dedicated agy symlink case, #324's titles rendering through the shared text path, #323's identity guard not exercised alone (each record lists its own) | None known; each judged acceptable where recorded | Accept as recorded | Accept |
