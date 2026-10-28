# Antigravity CLI side — documentation cross-check

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

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
