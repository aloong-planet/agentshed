# Test review — #294 (the memory drawer previews Markdown)

Ticket: [#294](https://github.com/aloong-planet/agentshed/issues/294). Spec: [memory-view](../../specs/memory-view.md)
(memory-view::US-001, memory-view::CON-001, sequence E).

## Design review

Date 2026-10-21 · implementation starts from 9b7bb13 (spec update uncommitted) · scope: the tests planned for
memory-view::US-001/AC-01–AC-08, memory-view::CON-001, E1 and E8, and the project-memory main-file path.

### Test design table

| # | Spec item | Seam | Input that drives the branch | Assertion and expected-value source | Fixture shape source | Expensive resource and how it is provided |
|---|---|---|---|---|---|---|
| U1 | Main file on the readable list (Implementation Decisions); D2 | provider: project detail read over a fixture home | a project with MEMORY.md and a topic; one with topics only; one with no memory | `mainFile` is the main file's entry: name `MEMORY.md`, a path whose file reads back the main body the test wrote, in the topics' directory, and the modification time the fixture set; null with topics only and with no memory. Truth: the content and time the test wrote, not a recomputed path. (Row revised 2026-10-21 when the field became an entry, so the drawer's meta has the main file's time; re-reviewed: same seam, inputs and truths, one more assertion) | existing provider fixture (mkMemory) | none (temp dir per test, existing pattern) |
| U2 | R1: contract validation of the new field | contract validator | a detail with a main-file entry, one with `null`, one with a number, one with a bare path, one with an empty path | both valid shapes pass; the number and the bare path fail naming `memory.mainFile`, the empty path names `memory.mainFile.file`. Truth: the field's declared type | existing validate fixtures | none |
| U3 | ADR-0029's upgrade case for the new field (found in /review-code ①): a project detail saved before `memory.mainFile` existed still restores | display store over a cache file written at the filesystem boundary (the existing corruption tests' seam) | a version-1 cache whose project detail has `memory: { main, topics }` and no `mainFile` — the shape the installed app's own cache holds (checked against ~/Library/Application Support/Agentshed/display-cache.json: detail keys path, skills, subagents, memory, plugins, mcp, configs, stats, artifacts; memory keys main, topics) | the restored reads hold that detail with `mainFile` null and its main text intact; a detail with a malformed `mainFile` is still dropped. Truth: the fixture's text. Must be red first (a bug) | real saved-cache shape | none |
| E-A1 | US-001/AC-01, AC-02, AC-04 | e2e, built app, global Memory section | click the demo project's row, then `pitfalls.md` | title = the project name `demo-proj`; meta = `Claude · pitfalls.md · ` + relative time; bar = `pitfalls.md`; switch present with preview on; card rows include `metadata` · `type: feedback`; `[[other-note]]` text present and not inside a link. Truth: the fixture text and the spec's form | real memory topics: front matter `name`/`description`/nested `metadata.type`, Why/How sections, `[[name]]`, links between files (checked against ~/.claude/projects/*/memory) | the F3 test's existing app launch and fixture home |
| E-A2 | US-001/AC-03 | e2e (same launch) | click raw, then preview | raw body text begins `---\nname: pitfalls`; preview shows the card again. Truth: fixture text | as E-A1 | F3 launch |
| E-A3 | US-001/AC-05 (global) | e2e (same launch) | `second.md` read once first (so the switch lands on text already there) and long enough to scroll; scroll `pitfalls.md` down, click the `Second` link | bar = `second.md`, title still `demo-proj`, preview on, the new body can scroll and its scrollTop is 0, body shows `second.md`'s text. (Row revised in /review-code: with a short or unread `second.md` the top position came from the clamp or the loading placeholder, and removing the reset survived — shown by mutation) | as E-A1 | F3 launch |
| E-A4 | US-001/AC-05 (global, the index) | e2e (same launch) | click the `the index` link in `pitfalls.md` | bar = `MEMORY.md`, body shows the main file's text | as E-A1 | F3 launch |
| E-A5 | US-001/AC-06 | e2e (same launch) | click `Gone` (unlisted); click `Docs` (https) with the main process's browser hand-off replaced by a recorder | toast with the out-of-scope wording; drawer still on `pitfalls.md`; the recorder holds the https URL; window URL unchanged. Truth: the dictionary's en wording, the fixture URL | as E-A1 | F3 launch |
| E-A6 | US-001/AC-07 (failure, empty) | e2e (same launch) | `empty.md` (empty file); `vanish.md` removed after the scan | "Empty file"; "File cannot be read: …"; bar and switch present in both | real shape for empty; removal follows the existing removed-after-scan case | F3 launch |
| E-A7 | US-001/AC-08 | e2e (same launch) | Esc; the close button; the overlay | the drawer is gone after each | — | F3 launch |
| E-A8 | US-001/AC-05 (detail), D6 | e2e (same launch), project detail | click `Pitfalls` in the rendered main file, then `the index` inside the drawer | the drawer opens on `pitfalls.md` with title `demo-proj`; then on `MEMORY.md` | as E-A1 | F3 launch |
| E-A9 | Main file registered for project detail (Implementation Decisions) | e2e (same launch), a second project | `late-proj` registered with only `t.md` (links to MEMORY.md); MEMORY.md written after the first scan; open its detail, topic, link | the drawer shows the late main file's text, not a read failure. Must be shown red with the registration removed (a rescan registering it would make this green on its own — checked by mutation during TDD) | real index-link shape | F3 launch |
| E-A10 | CON-001; E8 | e2e (same launch) | memory drawer and the Subagents drawer at 1400 and 900 wide; the plugin skill drawer in detail | memory drawer width = min(720, 0.8 × pane) and left of it stays inside the pane; Subagents drawer = min(680, 0.8 × pane); memory and skill drawers share the bar's gradient background and title block geometry. Truth: the spec's formulas | — | F3 launch |
| E-B1 | US-001/AC-07 (loading) | e2e, the artifact-reopen case's delayed launch | a topic clicked inside the 600 ms read delay | "Loading…" in the body with the bar present, then the text | as E-A1 (one topic) | the existing delayed launch of "reopening an artifact" |
| E-C1 | E1 | e2e, startup restore | the existing restore flow | the saved memory body shows in the preview body (not a raw block) | existing restore fixture | the existing restore launches |

### Coverage
Every acceptance item of memory-view::US-001 and memory-view::CON-001 has a row; E1 and E8 have rows. Not
tested, with the reason recorded here and in the test file: E2 (two reads in flight — the read is keyed by
file, so the earlier read lands in its own key; no deterministic trigger without a per-file delay seam), E5
(a several-hundred-thousand-character fixture would only re-test the read cap; checked by hand over the
owner's real Codex memory when the #279 screenshot is retaken), E7 (language switch while open — copy
comes from the dictionary the language tests already cover). Truncation in AC-07 rides the existing read
cap; no new fixture. Each row's input reaches its branch: E-A6's vanished file is removed after the scan
listed it, so the read itself fails; E-A9's main file appears only after the scan.
Fixtures: the memory files follow the real shape (nested front matter, `[[name]]`, links to siblings and the
index), not one invented from the spec.

### Case design
No mocks of the project's own modules; every e2e row goes through the built app's public UI. E-A5 replaces
Electron's browser hand-off (a system boundary, not project code) to keep the test from opening a browser;
the assertion is that the hand-off received the URL. No internal state is written; E-A9's late file is a
real file written to the fixture home, reachable as an agent would write it.

### False greens (by design)
- Always-true: none — each assertion names a value the old drawer cannot produce (the old drawer has no bar,
  no switch, no card, no project title).
- Same-algorithm expectations: U1 reads back the content rather than recomputing the encoded path; widths
  come from the spec's formulas.
- Old paths: the old `.drawer .raw` assertions for memory files are replaced, not kept beside the new ones.
- E-A9 is the one at risk (a rescan could register the file first): red-ability is to be shown during TDD.

### Resource reuse
Expensive resource: the built Electron app launch (several seconds each). The plan adds no launch: E-A rows
extend the F3 test's launch, E-B1 extends the delayed launch of the artifact-reopen case, E-C1 is the
existing restore flow. The build itself is produced once per e2e run by the existing script. Unit rows use
the existing temp-directory fixtures.

## Post-implementation check

Not run yet (step 6, by an independent agent).
