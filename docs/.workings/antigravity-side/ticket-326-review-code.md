# Code review — #326 Configuration shows CLAUDE.md and AGENTS.md

Ticket: [#326](https://github.com/aloong-planet/agentshed/issues/326) (aloong-planet/agentshed) · feature checklist:
[checklist.md](checklist.md)

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

Date: 2026-10-29 · reviewed: d0c68d7 against cbe22ca (the whole diff, 35 files), then the step-5 changes on top of it
(the shared `ConfigSection`, the restore e2e case) · scope: the main-process reads, the contract, the display-cache
restore, the renderer section and its CSS, the dictionaries, and the tests.

## Underlying premises

- The read order and locations (Codex's `~/.codex/AGENTS.md`; agy loading `~/.gemini/AGENTS.md` and
  `~/.gemini/config/AGENTS.md` together, the root one first; GEMINI.md and rules elsewhere) rest on the research
  record's measured table (§10.9, run s19), not on documentation names — re-read for this review. Holds.
- "A directory at the path makes the read fail (EISDIR) whoever runs the test" (the unit tests' comment): observed —
  the providers tests and the e2e case get `content: null` from it on macOS; Linux's `readFileSync` throws EISDIR on a
  directory the same way. Holds.
- "The prototypes draw no unreadable state" (`ConfigSection.tsx` header): both prototypes were read in full; neither
  has one. Holds.
- "The page refreshes by transfusion with the selected entry kept" (e2e comment): the e2e case moves through four file
  states on the AGENTS.md entry without re-selecting it. Holds.
- The old-shape restore comments ("the only place the project's own two files live"; "the two agy files that version
  never read") match `readProjectDetail` and the previous `readGlobalLayer`. Hold.
- A premise that does not hold everywhere: `existsSync` reports false when a parent directory cannot be searched, so a
  file inside an unreadable `~/.gemini/config` reads as absent ("None") rather than "cannot be read". Recorded as
  finding 5.

Conclusion: no premise the change rests on is unverified; one boundary recorded.

## Runnability

- Each configuration file is read on its own (`readConfigFile` per path, `flatMap` over the three): a failed read
  empties only its own slot, the other files and the rest of the global layer are untouched — the escape surface is
  self-harm only, as CONTEXT's degradation invariant requires.
- The restore path: the main process parses the cache with its roots' paths (`DisplayStore` ← `savedConfigPaths`), and
  everything it later hands the preload (`getStartup`) is the converted shape, so the preload's path-less parse never
  meets the old shape. A saved detail holding both the old memory shape and the old configuration shape gets both
  upgrades (the previous code returned after the first). Verified by `display-store.test.ts` and the new restore e2e.
- State paths of the section's entry choice: entering the tab (CLAUDE.md), switching entries, a snapshot refresh
  (kept — the pane is not remounted), leaving the tab (reset — conditional render), a project switch (reset — the
  section subtree is keyed by project). Same paths as before the change; the e2e drives refresh and project switch.
- A named pipe at a configuration path would block `readFileSync` and so the scan: a pre-existing property of every
  `readCapped` read, not introduced here (finding 4).

Conclusion: no defect.

## Security

- File paths render as React text; file bodies go through the one markdown carrier (sanitising exit and link
  interception); the agents page's previews keep the explicit out-of-scope notice for every relative link — driven in
  e2e (toast, URL unchanged).
- The new reads are read-only (`existsSync`, `readFileSync`) under `~/.gemini`; nothing is created or changed there
  (token-stats::CON-002's stance). A symlinked AGENTS.md is followed, as agy itself and the existing CLAUDE.md read do;
  the contents are the user's own files on their own machine and reach only the user's own display cache (mode 0600),
  as CLAUDE.md's already did.
- No new IPC channel and no new allow-list entry: the contents travel in the snapshot and the detail as before.

Conclusion: no finding.

## Consistency

- Invariants checked: no copy enumerates the sides (entries are named by file; `pnpm check:ui` passes); no natural
  language crosses IPC (an unreadable file is `content: null`, worded in the renderer; ADR-0015/0016); one markdown
  carrier and rule set (the path line is a dedicated class, `.cfg-path`, not a descendant rule into the body); a
  reshaped saved type restores across an update (CONTEXT, "A page switch is atomic…"; the 2026-10-21 postmortem).
- Class-level check of "a saved type whose shape this change alters must be upgraded on restore": the saved kinds are
  the snapshot and the reads (`projectDetail`, `sessionPage`, `turnContent`, `artifactContent`, `skillContent`,
  `skillFiles`), enumerated from `SavedRead` and `DisplayData`; two are altered (the snapshot's global layer, the
  project detail's `configs`), both upgraded; the other five carry no configuration field.
- Class-level check of "a configuration file sent without its path": the four files (global CLAUDE.md, the global
  AGENTS.md list, the project's CLAUDE.md and AGENTS.md), enumerated from the `GlobalLayer` and `ProjectDetail`
  types — all four carry `ConfigFile`.
- Baseline smells, on code this change introduced or substantially touched: Duplicated Code (finding 1, fixed);
  readConfigFile/readCapped's shared existence-and-try shape (finding 2, exempt). No other smell hit.

## Findings

1. **Duplicated Code** — both panes carried the same two-entry switch, so the entry list (a spec fact: two entries,
   CLAUDE.md and AGENTS.md) lived twice. Impact: self-harm only (a third entry added to one page and not the other).
   Disposition: done in step 5 — the switch moved into the shared `ConfigSection` (`ConfigSection.tsx`); both pages
   pass their files and link context. Safety net: the configuration e2e case on both pages and the existing
   config-link case, rerun green after the change.
2. **Duplicated structure, exempt** — `readConfigFile` and `readCapped` both check existence then read in a try.
   Reason it stays: their contracts differ (an unreadable file is a path with no contents for one, null for the
   other), and the one rule that must change in one place — truncation — is the shared `capped()`. No action.
3. **Cross-ticket: two roots for one directory tree** — this change adds `ScanRoots.geminiHome` (`~/.gemini`), and
   #322 (in flight in another worktree) adds `antigravityHome` (`~/.gemini/antigravity-cli`). After both merge, one
   root sits inside the other. Impact: no defect (each reads its own files), a later reader sees two roots for one
   tree and the configuration readers of #325 must pick one. The `geminiHome` line was placed between `codexHome`
   and `grokHome` so the two insertions do not collide textually. Disposition: needs a decision when both are on
   main — fold `antigravityHome` into `geminiHome` (or the reverse) in #327's closeout, or keep both documented. No
   durable home yet: reported to the orchestrator.
4. **Pre-existing: a FIFO at a read path blocks the scan** — `readFileSync` on a named pipe never returns. Applies to
   every `readCapped` read since before this change; this change adds two paths of the same kind. Impact: upper escape
   (the scan hangs), on a machine where the user put a pipe at `~/.gemini/AGENTS.md` — not observed anywhere.
   Disposition: not changed here (outside the change's own behaviour; a fix would touch every capped read).
   Recorded only.
5. **Boundary: an unreadable parent directory reads as absent** — `existsSync` is false when it cannot stat, so the
   slot shows "None" rather than the read error. Impact: self-harm (that entry's wording); agy cannot load such a file
   either. Disposition: accepted, no action.
6. **Gap closed: the main process's restore wiring** — `index.ts` passing the roots' paths to the display store had no
   behavioural test (design review). Disposition: done in step 5 — the e2e case "a snapshot saved before
   configuration entries carried their paths restores with them, before the first scan" (`startup-restore.spec.ts`).
   When it would go red, by reading the code (not run as a mutation — the project's `mutation-testing` capability is
   not enabled): without the paths the old snapshot fails validation and is dropped, so with the scan held for 20 s
   no Configuration section is drawn and the case's 5 s wait on the restored path heading times out.

7. **Prototype mismatch, found while preparing step 8** — the prototypes draw the configuration card at
   `max-height: 52vh` with its files scrolling inside (since their first version, 2026-07-29); the app's card grew with
   its contents. Impact: self-harm (several AGENTS.md files, or one long file, lengthen the page). Disposition: done in
   a9c382f — `.cfg-files { max-height: 52vh }`, scoped to this card; the configuration e2e case asserts the bound with
   the oversized CLAUDE.md. The memory card's identical difference is outside this interface and is an open finding in
   ticket-326-decisions.md.

Bugs fixed with a test that first went red: none — no bug was found.

Self-check of the step-6 fix (post-implementation-check.md item 1, 2026-10-29): the fix for the Post-implementation
check's Finding 1 changed no product code (only `display-store.test.ts` and the records), so there is no product
statement to set beside its spec text. Not applicable.
