# Decisions — #326 Configuration shows CLAUDE.md and AGENTS.md

Ticket: [#326](https://github.com/aloong-planet/agentshed/issues/326) (aloong-planet/agentshed) · feature checklist:
[checklist.md](checklist.md)

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

Every decision below was taken without stopping to ask, under the owner's standing instruction for this work
(choose the reasonable option, research first, record it). Date: 2026-10-29.

| Decision | Chosen | Alternatives considered | Why |
|---|---|---|---|
| Where the agy AGENTS.md files are read from | A new `ScanRoots.geminiHome` (`~/.gemini`), production value from `realRoots()`, fixtures from each test's own root | Derive `~/.gemini` from #322's `antigravityHome` (not on main, so this ticket could not depend on it); derive the home from `claudeConfigFile`'s directory (a hidden coupling) | `ScanRoots` is the injectable seam (ADR-0002); one parent covers both `~/.gemini/AGENTS.md` and `~/.gemini/config/AGENTS.md` |
| Placement of that field | Between `codexHome` and `grokHome` in the type, `realRoots()` and the 14 test literals | After `grokHome` (alphabetical-ish) or at the end | #322 inserts `antigravityHome` right after `grokHome` (seen read-only in its worktree, `cat` of two files only): an unchanged line between the two insertions lets git merge both without a conflict |
| The wire shape of a configuration file | `ConfigFile { file, content: CappedText \| null }`; an absent file is not sent (null for the project's two, left out of the global list); `content: null` = exists but unreadable, worded in the renderer | A structured `AppError` field; keep `CappedText \| null` (cannot tell absent from unreadable) | The specs require the two to differ ("None" against a read error under the path); one failure kind needs no code, and the null-worded-by-the-renderer form is the contract's existing pattern (ADR-0015/0016) |
| What heads a file | Its absolute path | The `~`-abbreviated path the prototypes draw | The app shows absolute paths everywhere it shows one (a project's header path, the reader overlay, the uninstall dialog); the prototypes' paths are mock data (their header says so); `ScanRoots` carries no home directory to abbreviate against |
| The unreadable state's form | The prototype's path heading with the prototype's "None" line form carrying "The file cannot be read (permissions or I/O error)" | Draw a new state in the prototypes and wait for the owner; an error-coloured line; a toast | The specs require the state but neither prototype draws it; reusing two drawn forms adds no new form — the precedent this feature's own checklist set for a failed call shown as prose. **Not confirmed by the owner**; declared in both specs and the checklist's audit so it can be reviewed |
| The "None" state's form | Inside the card, with no frame of its own (`.cfg-files > .none { border: 0 }`) | The app's standalone dashed empty-state box (the form the missing-file state had before) | ADR-0033: the app follows the confirmed prototypes, which draw "None" as a line in the card; scoped so no other empty state changes |
| The card's height | `max-height: 52vh`, contents scrolling inside (`.cfg-files`) | Leave the card growing with the file (the app's behaviour since 2026-07-30) | The prototypes have drawn 52vh since their first version and the app never followed; the step-8 rule fixes a prototype mismatch in the touched interface within the round. Scoped to this card: the memory card's identical difference is outside this change (see the open findings) |
| Copy | "None" and its Chinese counterpart (the prototypes' shared `cfgNone`) for an entry with no file; a new `config` dictionary section shared by both pages; the removed summaries' keys and the orphaned `placeholder.notSet` and `codexConfig` deleted | Keep "File does not exist" | The specs say "None"; "File does not exist" is false for an entry of three files; the deleted keys had no other user |
| Entry labels | The file names `CLAUDE.md` / `AGENTS.md`, not dictionary copy | "Global CLAUDE.md" / "Global AGENTS.md" from the dictionary | The prototypes mark the names as names, not copy; the project page already used the bare names |
| Order and set of the global AGENTS.md files | A fixed list — `~/.codex/AGENTS.md`, `~/.gemini/AGENTS.md`, `~/.gemini/config/AGENTS.md` — read file by file | Scanning `~/.gemini` for instruction files | The spec fixes the order (agy loads its two root-first, measured); a fixed list excludes GEMINI.md, rules and Grok's AGENTS.md by construction (AC-05) |
| Saved display data from before the change | Converted on restore: a saved project detail's files get their paths from its own path; the saved snapshot's two global files get theirs from the main process's roots (`DisplayStore` takes them); the summaries are dropped | Drop the old shapes (one cold start after the update); fill the old snapshot with "None" | CONTEXT's saved-page invariant and the 2026-10-21 postmortem; this machine's cache held 27 saved details and a snapshot in the old shape; "None" would fabricate a state |
| Where the conversion of the snapshot lives | `parseDisplayData(v, paths?)`, the paths given only by the main process; the preload's parse (no paths) never sees the old shape | Convert in the main process after parsing (the parse drops the old shape first) | The parse is where validation happens; without the paths the old shape is left for validation to drop, fail-closed |
| One section component for both pages (step-5 refactor) | `ConfigSection` holds the two-entry switch; each page passes its files and link context | Keep the switch duplicated in both panes | The entry list is a spec fact; one copy cannot drift. Covered by the e2e case on both pages |
| A restore e2e case for the main process's wiring | Added (`startup-restore.spec.ts`) | Leave the one-line wiring untested and say so in the test file | Cheap, and the only seam that reaches the main process passing its roots to the display store |
| Fixture projects for the configuration e2e | Projects registered on Claude Code | A project registered on Antigravity only, as project-detail's Testing Decisions planned | The Antigravity side is not in the code yet (#322); configuration is read by path whatever the registration, so registration adds nothing to this check. project-detail's Testing Decisions rewritten to say so |
| How an unreadable file is detected | `existsSync`, then a read; a failed read (permission, a directory at the path) is unreadable; a path whose parent cannot be searched reads as absent | Classify `stat` errors to tell "cannot see" from "absent" | Matches the existing capped read; agy cannot load such a file either; the effect stays on that one entry |
| Long paths | Wrap inside the card (`overflow-wrap: anywhere`) | Scroll the card sideways | Real and fixture paths are long; the heading must not widen the card |
| The site's dependencies in this worktree | Installed (`pnpm install --frozen-lockfile` in `site/`) before lint | Treat the 151 lint errors in `site/` as failures | CI installs them before lint; the errors were unresolved types from a fresh worktree, in files this change does not touch |

## Open findings

| Finding | Impact | Suggested handling | Home |
|---|---|---|---|
| After #322 merges, `ScanRoots` holds `geminiHome` (`~/.gemini`) and `antigravityHome` (`~/.gemini/antigravity-cli`), one root inside the other | No defect; two roots for one tree, and #325's configuration readers (MCP, plugins, skills under `~/.gemini/config`) must pick one | Fold one into the other when both are on main — #327's closeout is the natural place | No durable home yet — needs a decision by the orchestrator or the owner |
| The memory section's main-file card (project page) differs from the prototypes the same way the configuration card did: the prototypes bound it at 52vh, the app lets it grow | A long MEMORY.md lengthens the page instead of scrolling inside its card | Decide at the round's closing cross-check (ADR-0033 puts app-versus-prototype differences there): adopt the bound, or confirm the app's form with the owner | No durable home yet — outside this ticket's interface; needs a decision (#327's cross-check is the place) |
| A named pipe at any capped-read path (now including the two new `~/.gemini` paths) would block the scan | The scan hangs on a machine where a pipe sits at such a path; never observed | Leave; a fix would change every capped read | Recorded in ticket-326-review-code.md (finding 4); no further home proposed |

## Spec final check (before step 7, 2026-10-29, code read against the specs at cbe22ca)

| Atomic requirement (spec text) | Implementation | Verdict |
|---|---|---|
| agents-overview::REQ-004/AC-01 "two entries, CLAUDE.md and AGENTS.md, not grouped by side" | `ConfigSection`: two file-named buttons; no side badge in the section | Met |
| AC-02 "CLAUDE.md is `~/.claude/CLAUDE.md`" | `claudeMdPath(roots)` | Met |
| AC-03 "every global AGENTS.md a side was observed to load that exists — `~/.codex/AGENTS.md`, `~/.gemini/AGENTS.md`, `~/.gemini/config/AGENTS.md`, in that order — each headed by its path. When none exists … "None"" | `globalAgentsMdPaths` (fixed order), `readConfigFile` per file, `.cfg-path` headings, `config.none` | Met |
| AC-04 "The Codex `config.toml` summary is removed, and no settings summary is shown for any side" | `summarizeCodexConfig`, `settingsSummary`, their contract fields and copy deleted | Met |
| AC-05 "agy's GEMINI.md files and its rules are shown nowhere; Grok's global AGENTS.md is not added" | Only the fixed list is read; the project reads only its two files | Met |
| The failure modes (one of three unreadable; GEMINI.md without AGENTS.md; entries named by file) and B5 | `content: null` slot under its path; `[]` → "None"; truncation by the shared cap | Met |
| project-detail::REQ-002/AC-02 "two entries … the project's own files, each headed by its path, "None" when absent … shown once … settings summary removed" and its failure modes, A4, R3 | `readProjectDetail` configs; the shared section; link context unchanged | Met |
| Unrecorded scope expansions found | The card's height (prototype conformance), the restore conversions (CONTEXT invariant), `ScanRoots.geminiHome` (implementation) | The first two written back into the specs (B5; Implementation Decisions); the third is below spec level |
| Implementation differing from the spec | project-detail's Testing Decisions planned the configuration e2e on an Antigravity-only project | Spec rewritten (the files are read by path, whatever the registration) — the owner's standing instruction stands in for a confirmation |

## Work log

- Self-check of the step-6 fix, items 6–7 (post-implementation-check.md): the fix's evidence is
  [ticket-326-fix1-verification.log](ticket-326-fix1-verification.log) (HEAD, version list, commands, unpiped exit
  codes, full output) and [ticket-326-fix1-change-scope.log](ticket-326-fix1-change-scope.log) (verdict `run`: the
  test file changed, so an incremental check was handed over); the records the fix touched (T4a's row, the
  Coverage sentence, checklist.md's restore row) agree with the fixed test. No finding.
- The first pre-review gate run (started 00:46) was stopped mid-e2e when the card-height mismatch was found; it was
  rerun from scratch on a9c382f ([ticket-326-gate-prereview.log](ticket-326-gate-prereview.log), PASS).
- A targeted runner first failed with exit 127 on every command: zsh does not word-split an unquoted `$c`, so each
  command ran as one name. Rerun under bash; the log on file is the bash run.
- The fix-1 log's dependants search did not run: under bash `rg` is not a command (it is a zsh function here),
  exit 127, and the log's overall PASS passes over it. The incremental check's own `grep` search stood in (no
  dependant). The fix-2 log searches with `grep` ([ticket-326-fix2-verification.log](ticket-326-fix2-verification.log)).
- Two incremental checks followed the first round: Finding 1 (a saved AGENTS.md that is a file was never converted
  under test) fixed in 8493010; Finding 2 (that fix dropped the only saved absent AGENTS.md) fixed in 84f0b76.
