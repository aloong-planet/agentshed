# Test review — #281

Ticket: [#281](https://github.com/aloong-planet/agentshed/issues/281). Spec: [appearance](../../specs/appearance.md),
appearance::REQ-001 and sequence F.

## Design review

2026-10-23. Implementation version: 5f376ad (the spec, the prototype and the records; no implementation yet), on
`fix/thin-scrollbars` cut from fc3fbeb.

### Test design table

| # | Covers | Seam | Input that drives the target branch | Asserted object and expected value's source | Fixture shape source | Expensive resource and how it is provided |
|---|---|---|---|---|---|---|
| S1 | appearance::REQ-001/AC-01, AC-03 (shown while idle); #281's strip | e2e, the running app's project list | 40 registered projects at a 1000×600 viewport, so the list overflows; nothing scrolled | The list overflows (scroll height above client height, asserted first), then its width less its client width less its borders = 6. Expected: the spec's 6px. Red today: the e2e window draws a 15px classic scrollbar | The 40-project home of the #122 case (registered project directories, the form `.claude.json` takes): the rows are what matter, not their contents | One app launch for S1–S7, on the build `pnpm e2e` makes once (a launch is 0.6–0.7s, not an expensive resource: corrected below) |
| S2 | appearance::REQ-001/AC-02 (no track), light | the same | S1's state | A pixel in the scrollbar's column below the thumb, read from a capture of the window, equals the list's own background (the first painted background up its ancestors, read from computed styles), within 2 per channel. Expected: the spec's "the surface beneath shows through". Red today: the classic track is a lighter grey than the list | the same | the same launch |
| S3 | appearance::REQ-001/AC-04, light | the same | S1's state | A pixel at the thumb's centre equals black at 25% laid over the list's background, within 2. Expected: the spec's literal alpha, blended by hand in the test, not read from the stylesheet | the same | the same launch |
| S4 | appearance::REQ-001/AC-05, light | the same | The pointer moved onto the thumb | The same pixel equals black at 40% over the background; polled on the pixel itself (false-greens §5) | the same | the same launch |
| S5 | appearance::REQ-001/AC-02, AC-04, AC-05 in dark; sequence F4 | the same | The page's colour scheme emulated dark, with no reload; the list's background polled until it is the dark one | S2–S4 again with white at 22% and 36% over the dark background. Red today, and #281's own symptom: the light track beside a dark list | the same | the same launch |
| S6 | appearance F6 | the same | A wheel turn over the list; a press on the thumb dragged down; a click in the scrollbar's column below the thumb | Each moves the list's scroll position down from where it was. Expected: the spec's "behave as before" — the platform's scrolling, not a value of ours | the same | the same launch |
| S7 | appearance::REQ-001/AC-03 (none when the content fits), F5 | the same | The viewport made taller than the 40 rows need, then short again | Tall: no overflow and a 0 width difference; short again: overflow and 6 | the same | the same launch |
| S8 | appearance::REQ-001/AC-01 (horizontal, 6px tall), AC-02 (the corner), F3, F8 (a drawer, rendered markdown) | e2e, the memory drawer's preview of the wide file, inside the existing case that already opens it | The wide file: a long unbroken path and a wide table make the drawer's body scroll both ways; a wide code line makes its fence scroll sideways | The body's two scrollbars measure 6 and 6, the fence's horizontal one 6; the corner square's innermost pixel equals the body's background, read in dark (amended during implementation, below) | The existing wide-file fixture, shaped on Codex's consolidated memory (memory-view E5) | That case's launch, no new one |
| S9 | appearance::REQ-001/AC-04 (not the theme), C2 | `theme-vars` over the theme stylesheet (the ui-design tool), Evidence; since the post-implementation check, also the six-combination e2e case in every run (S9 changed, in the handling section below) | The six theme × appearance states | The two thumb tokens resolve in every state, differ between light and dark, and do not differ across the themes | — | One headless Chrome run, outside the suite |

### Coverage

Against appearance::REQ-001 and sequence F: AC-01 (S1, S8), AC-02 (S2, S5, S8), AC-03 (S1, S7), AC-04 (S3, S5, S9),
AC-05 (S4, S5); F1 is the e2e window's classic case — a trackpad-only Mac's overlay case is not automatable here (the
test machine's input devices decide it), stated as a gap in the e2e file; F2 (macOS's setting) likewise, a gap
(superseded: both are driven by S10 since the post-implementation check, below); F3 (S8);
F4 (S5 for light/dark, S9 for the theme); F5 (S7); F6 (S6; keyboard scrolling left out, below); F7 by the full
e2e suite (superseded: held by construction, none of those layouts sits beside a drawn scrollbar, below); F8 (S8 for the drawer and rendered markdown; that every
other surface takes the rule is the code review's to read, the rule naming no surface). AC-01's rounded ends are not
asserted: a 3px radius on a 6px thumb is a few antialiased pixels, and a pixel test of it would test the antialiasing;
the capture saved by S5 shows it (Evidence). Fixture: the project rows' shape does not reach the scrollbar's drawing;
S8's file is shaped on real memory files. No finding.

### Case design

S1–S7 share one launch and one page, each step reading the state the previous left (the order is the user's: look,
hover, switch to dark, scroll, resize). No module double, no private state written: dark is the same emulation the
other dark cases use, and the pixels come from the window as drawn. The pixel helper decodes the capture in the page
(a canvas), so the channel order is RGBA whatever the platform's bitmap order. The capture is taken at the device's
scale; the helper converts the CSS position by the image's own scale. No finding.

### False greens (by design)

- **Always-true assertions**: S1 asserts the overflow before the width (false-greens §8: a list that fits measures 0
  whatever the rule). S7's 0 is read only after asserting the list fits. S2's and S3's pixels sit at positions taken
  from the list's measured box and the thumb's measured length, and S3 asserts its pixel differs from S2's (the thumb
  is not where the track was sampled).
- **Tautology**: the expected colours come from the spec's literal alphas, blended in the test, against a background
  read from the DOM — not from the stylesheet's tokens.
- **Old path**: the assertions read the drawn window, which is what the user sees, not a token's value.
- Mutation testing: `capabilities.toml` declares `mutation-testing` with `enabled = false`, so it is not run. When
  each case goes red: S1, S2, S5 on today's code (the e2e window's classic scrollbar: 15px, a light track) — run red
  first, since they reproduce #281; S3–S5 under a wrong or missing token; S4 under a missing hover rule; S6 if drawing
  broke the platform's scrolling; S7 if a gutter were reserved for content that fits; S8 if the drawer or the fence
  kept the platform's scrollbar or the corner stayed painted.

### Resource reuse

The expensive resource is the app build (made once by `pnpm e2e`); an app launch was counted as one too, but measures 0.6–0.7s (corrected below). S1–S7 take one
launch, S8 takes the existing case's, so the suite gains one launch. Existing setups searched: the 40-project home of
the #122 case (reused, as a shape), the memory case's wide file (reused as is). No finding.

### Changes to the design during implementation (re-reviewed before the tests were changed)

- **S8, the corner, read in dark, at the corner square's innermost pixel.** The first reading (3px in from the
  body's corner, in light) failed on the drawer's rounded corner, whose border line crosses the square's outer part
  (`evidence/ticket-281/corner-rounded-border.png`, a 44px capture ending past the corner: the curve and the horizontal thumb). Moved to the innermost pixel.
  Then a planted uncleared corner still passed in light: an uncleared corner is a white square, the same as the light
  body (`e2e-plants.txt`, plant A). The corner is read with the page emulated dark, where the white square cannot pass
  for the background, and the page goes back to light after; planted again, it fails at the corner
  (`e2e-plant-corner-dark.txt`). Re-reviewed: the row still drives the both-way body; its asserted pixel can now fail.
- **S3 in light cannot tell the rule from no rule.** The classic thumb's grey is about 193, and black at 25% over
  white is 191: within the tolerance. S3's light reading catches a missing or wrong token (a missing one leaves the
  thumb unpainted, the background's 255); the absence of the rule is caught by S1 and S2 (15px, a 250 track), and in
  dark the two are far apart (80 against 193). Not changed; recorded so the light reading is not taken for more.
- **Planted faults** (`e2e-plants.txt`): no hover rule fails at S4's poll; a wrong dark thumb token fails at S5's dark
  thumb (143 against 80). Restored byte for byte and rebuilt after each.
- **Red first** (`e2e-red-first.txt`): S1, S2 and S5 on the unfixed code — 15px in both, a 250 track against the
  light list's 255 and against the dark list's 31,33,36 (#281's strip).

## Post-implementation check

2026-10-23. Ticket: [#281](https://github.com/aloong-planet/agentshed/issues/281), feature `appearance`. Implementation
version: 7211ff3 (the code, the tests and the data they read). The change's range is fc3fbeb..be791fe; its last commit,
be791fe, adds only the gateway log (`git diff --stat 7211ff3 be791fe` lists that one file). Run by an independent
subagent that did not inherit the implementation conversation. First round, so the objects are every test the change
wrote or changed: the scrollbar case (`e2e/app.spec.ts:4156`), the memory case's scrollbar block
(`e2e/app.spec.ts:2266–2309`), the helpers they share (`e2e/app.spec.ts:1901–1983`), and S9's evidence.

Run evidence: the full verification gateway at 7211ff3 ([gateway-7211ff3.txt](evidence/ticket-281/gateway-7211ff3.txt)),
not re-run. It meets /implement's log requirements: HEAD 7211ff3 with a clean status (so no file to hash), every
`pnpm verify` step with its command, full output and exit code (all 0), and `VERIFY_EXIT=0`. Its version matches the
range. No finding. No test was run in this check: mutation testing is off (below), and the open questions concern cases
outside this change, which this check may not run.

### Test design table against the written tests

| Row | Result |
|---|---|
| S1 | Matches. 40 registered project directories at 1000×600; the overflow is asserted hard before the soft 6px (`:4174–4177`). The fixture is an eight-line copy of the #122 case's builder (`:787–794`), see T6 |
| S2 | Matches. The pointer moves away first; the pixel is at the column's centre, 3px above the list's bottom, compared with the first painted background up the ancestors (`.side`'s card, since the list's own background is transparent), within 2 |
| S3 | Matches. The thumb's centre comes from the measured scroll geometry, it is asserted unlike the track pixel, and it is compared with black at 25% blended in the test |
| S4 | Matches. The poll reads the asserted pixel itself |
| S5 | Matches, with one wording difference: the poll waits until the background is no longer the light one, not until it is the dark one. That is equivalent here, because no background in the renderer's stylesheet has a transition (its ten `transition` declarations animate a transform, an opacity and a stroke offset), so the first changed value is the final one |
| S6 | Matches, in a different order (click, drag, wheel, where the table has wheel, drag, click); the order changes nothing. Keyboard scrolling, which F6 also names, is in neither the table nor the case: T3 |
| S7 | Matches |
| S8 | Matches the amended row: the both-way body is asserted first, then 6, 6 and 6, the corner's innermost pixel in dark, and a poll back to light |
| S9 | Matches: Evidence outside the suite (`theme-vars.txt`). What that leaves unguarded is T4 |
| Resource column | One launch for S1–S7 (`launch` once, `close` once) and none added for S8: matches. "An app launch (over a second)" does not: T5 |

Gap notes (Dimension 1): the file head's "Known gaps" paragraph (`e2e/app.spec.ts:8–18`) has no scrollbar gap. F1's
overlay case and F2 are noted only in the case's own comment (`:4150–4155`), with no re-test condition: T1.

### Coverage

Conclusion: four findings (T1–T4); the remaining items are covered as designed.

Below, each item of appearance::REQ-001 and sequence F, with the input that drives execution into it:

- AC-01: S1, S5 and S7 measure the list's 6px; S8 measures the body both ways and the fence sideways. The rounded ends are
  not asserted (the design gives the reason; the captures show them).
- AC-02: S2 and S5 for the track, S8 for the corner (in dark, the only reading that can fail).
- AC-03: S1 and S3 with nothing scrolled and the pointer away; S7 for content that fits. This holds for the classic
  window; the overlay case belongs to F1 (T1).
- AC-04: S3 in light (which cannot tell the rule from no rule, as recorded) and S5 in dark. The theme part rests on S9
  alone: T4.
- AC-05: S4 and S5 under the pointer.
- F1, F2: only the classic case is covered: T1.
- F3: S8.
- F4: S5 switches to dark with no reload. It enters at the colour-scheme media query; the step from the mode control to
  the media query is covered by the mode cases. The theme half: T4.
- F5: S7 makes overflow come and go by resizing the area rather than by growing the content. Overflow flips both ways
  either way, and the table states the input. Accepted.
- F6: click, drag and wheel are driven; keyboard is not: T3.
- F7: T2.
- F8: S8 for the drawer and rendered markdown. For every other surface, the code review read the global, selector-less
  rule.
- Fixture shape: the project rows do not reach the scrollbar's drawing, and the wide memory file (from before this
  change) is shaped on Codex's consolidated memory. No finding.

### Case design

Conclusion: no red flag; one smell (T6).

The red flags were checked over the whole diff, not a sample:

- No module double. The new code has no route stub and no main-process stub; the memory case's `shell.openExternal` stub
  predates this change and is unrelated.
- No private state written for setup. `toTop` sets `scrollTop` to 0 between S6's steps, a position the user reaches by
  scrolling up. The memory case's `scrollLeft` to the end predates this change.
- No call counts.
- What is read is the drawn window, plus the DOM's geometry and computed styles.
- Dark is entered through the page's colour-scheme emulation. A dark system produces the same state, so it is reachable.

Isolation: each case has its own app, userData and home, all removed when the case closes. The memory case's dark step
returns to light and polls the body back before its later steps.

The assertions target the right objects: the painted background of the list (`.side`'s card) and of the drawer body
(`.md-preview-body.preview`'s card).

### False greens

Per the project capability declaration, mutation-testing is not enabled (`[mutation-testing] enabled = false`), so
mutation testing is skipped. When each assertion goes red is answered below against the code under test and the expected
values' sources.

| Assertion | Goes red when | Seen red |
|---|---|---|
| List overflows (`:4175`), body both ways (`:2294`), fence sideways (`:2297`), list fits (`:4232`) | Preconditions: the fixture or window no longer produces the state | Not needed |
| List width 6, light and dark (`:4177`, `:4198`, `:4236`) | The platform's scrollbar (15px) or any other width | Yes, red first: 15 |
| Track = background, light and dark (`:4182`, `:4200`) | A track is painted | Yes, red first: 250 against 255 and against 31,33,36 |
| Thumb pixel unlike track pixel (`:4185`) | The sampled point is not on a painted thumb: a mismeasured position, or a token that resolves to nothing and leaves the thumb transparent | No; reasoned |
| Light thumb = black 25% (`:4186`) | The light token is missing (the background's 255 shows) or off by more than 2 per channel; not when the rule is absent (the classic thumb is about 193 against 191, as recorded) | No in light; plant C shows the mechanism in dark |
| Light hover = black 40% (`:4189`) | No hover rule, or a wrong light hover token | Yes, plant B |
| Dark thumb = white 22% (`:4202`) | A wrong or missing dark token (a missing one inherits the light one: black over the dark list, about 23 against 80) | Yes, plant C: 143 against 80 |
| Dark hover = white 36% (`:4204`) | No hover rule, or a missing (the light black 40% would be inherited) or wrong dark hover token: rest is about 80 and hover about 112, far beyond the tolerance of 2 | No: plant B stopped the case at the light hover poll, a hard assertion; reasoned |
| Click below the thumb pages down (`:4215`) | The column takes no click: no scrollbar, or a 0px overlay one (the click lands on the content) | No; reasoned |
| Thumb drag scrolls (`:4222`) | The thumb does not drag. The press is on the thumb: it uses the position where S5 read the dark thumb's pixel | No; reasoned |
| Wheel scrolls (`:4226`) | Only if the list stops scrolling at all; the drawing cannot affect it. It is a regression check, which is what F6's "as before" asks for | No |
| No gutter when it fits (`:4233`) | A gutter is reserved for content that fits (`overflow-y: scroll`, `scrollbar-gutter: stable`). It does not tell the rule from no rule (the classic scrollbar is 0 there too), and AC-03 does not need it to | No; reasoned |
| Body 6 and 6, fence 6 (`:2295–2298`) | The platform's scrollbar (15) | Never run red: the red-first run covered only the list case. Reasoned from the same mechanism as the list's width, and from the absence of any other scrollbar styling in the renderer (the code review's search) |
| Corner = dark body (`:2307`) | The corner is left painted (a white square) | Yes, plant A in dark: 255 against 31,33,36 |
| S9's token reading | Never again: it was a one-off run | T4 |

Form list (Dimension 3):

- Always-true: preconditions are asserted first. `near` iterates the pixel, which always has three channels, so an empty
  expected colour gives NaN comparisons and fails instead of passing vacuously.
- Tautology: three independent sources — alphas typed from the spec, the background from the DOM, the pixels from the
  capture.
- Old path: none.
- Silent skip: none in either case (both read in full).
- Assertions that might not run: every poll and capture is awaited, and no assertion sits in a callback.

UI assertions (review-code `false-greens.md`):

- §1: effects and geometry, not existence.
- §2: input goes through Playwright's mouse, which sends hit-tested input events. `:hover` is reached, as plant B shows.
  `toTop` is setup, not the behaviour under test.
- §5: the hover checks poll the asserted pixel. The dark readings poll the background and then read pixels, so one
  propagation (style to paint) lies between them. An early read would show the light drawing, which fails every dark
  expectation, so that gap can only flake red, never pass; it has not been seen.
- §8: overflow is asserted before width.
- §4 does not apply: there is no new gate.

No false green found; T4 covers what is not guarded.

Environment note, not a finding: the pixel reads have run only on this Mac. CI's e2e job runs on ubuntu under xvfb
(`.github/workflows/ci.yml:51–67`), so the PR's first run will be their first Linux run.

### Resource reuse

Conclusion: no reuse finding; one correction to the record (T5).

Counted from the gateway run:

- The build is the one expensive resource. A single `electron-vite build` (log lines 455–479, its three bundles once)
  precedes the 146 cases.
- The quiet Electron copy is made once per run, in global setup. This change does not touch it, and it printed nothing in
  this run.
- App launches print nothing, so their count comes from the code: the scrollbar case launches once for S1–S7, and the
  memory case's block adds none.
- The new case took 1.3s in all (log line 550).

### Findings

| # | Dimension | Location | Finding | Suggested handling |
|---|---|---|---|---|
| T1 | Coverage | `e2e/app.spec.ts:4150–4155` (case comment) against the file head `:8–18`; [checklist](checklist.md) F1/F2 rows; this record's Coverage | The overlay case (F1) and macOS's setting (F2) are a gap, but it is noted only in the case's comment, not under the file head's "Known gaps", which states a re-test condition for each gap. Here there is no re-test condition. The comment says "accepted by hand", yet no record arranges that acceptance: the checklist says "unverified by test". Its premise, "which a test cannot set", may also be untrue. Inference, not measured, since this check may run only the tests under review: AppKit reads `AppleShowScrollBars` through NSUserDefaults, whose argument domain takes `-AppleShowScrollBars WhenScrolling` from the process's own arguments, and Chromium's browser process passes the preferred scroller style to the renderer. So launching with those two extra arguments may give the overlay case for that process alone, without touching the machine's setting. The same project shape was found before in `docs/.workings/global-search/ticket-273-review-tests.md` (F1) | Now: probe the launch arguments once. With the rule: 6px and a visible idle thumb. Without it: 0px and a hidden idle thumb. If the probe confirms it, add the overlay case and F2's three settings to the scrollbar case; that is the only test of the claim the code review could ground only in Chromium's source. If not, move the gap into the file head's "Known gaps" with its re-test condition (a run on a Mac with no mouse, Show scroll bars on Automatic or When scrolling). Either way, arrange the hand acceptance (deferred acceptance per /implement) or reword it as "unverified; grounded in Chromium's source" |
| T2 | Coverage | This record's Coverage line for F7 ("run at the new width"); [checklist](checklist.md) F7 rows | Coverage is overstated: none of the cases it names runs a width-measuring layout beside a scrollbar that is present. The side filter row (`.opts`) sits outside the `.list` scroller (`ProjectsPane.tsx:104`, `:122`): confirmed. The project-detail tab row sits in `.pane-head`, outside the `.pane-body` scroller: confirmed from the stylesheet. The skills-row case has two skills, and the hit-row case four hits per list: inference, too few rows to overflow. Also, the e2e window's classic scrollbar took 15px, so wherever an area did overflow, the change gave it 9px more room. F7's risky direction is an overlay Mac (0px to 6px), which no e2e case can reach (T1) | Now: correct the record's F7 line and the checklist's F7 rows. F7 is not driven by any case. It holds by construction: no renderer code references a scrollbar width, and the width-measuring layouts (`SessionHits.tsx`, `NameReveal.tsx`, `TokenViz.tsx`) measure their own boxes. The overlay direction is a gap with T1's re-test condition. No new test: in the classic window a layout can only gain room |
| T3 | Coverage | `e2e/app.spec.ts:4209–4227`; this record's S6 row and Coverage; [checklist](checklist.md) F6 rows (its current verification calls F6 verified) | F6 names keyboard scrolling. No step drives it, and the record does not say it is left out | Now: record that it is left out, and why. Keyboard scrolling never touches the scrollbar's drawing, so, like the wheel step, a keyboard step could go red only if the list stopped scrolling. Adding a key press step is possible, but the wheel step already gives what it would |
| T4 | Coverage / False greens | S9 (`theme-vars.txt`, outside the suite); spec Testing Decisions, `docs/specs/appearance.md:426–427` ("is checked across all six states"); [checklist](checklist.md) C2/B5 row | F4's theme half and C2 for the two thumb tokens rest on a one-off reading that cannot go red after this change. A theme block that later declares `--scroll-thumb` (taking the accent, say) passes every case, since the scrollbar case reads only purple. The suite already has the pattern for this class: the six-combination case asserts that `--float-shadow` varies with light and dark and not with the palette (`e2e/app.spec.ts:4132–4144`), over the same six states, with no extra launch | Now: in that case, read the two thumb tokens in each of the six states and assert one light value and one dark value that differ. The spec line then holds as written. Alternative: keep S9 as evidence and reword the spec line to say the check was made once |
| T5 | Resource reuse | This record's resource column ("an app launch (over a second)") | The gateway's timings contradict it: whole cases with one launch take 0.6–0.7s (cold start 632ms, log line 495; the language fallback 601ms), so a launch is under the 1-second threshold and is not an expensive resource. The conclusion is unchanged (one launch per case) | Amend the wording when the table is next edited; no test change |
| T6 | Case design | `e2e/app.spec.ts:4157–4164` against `:787–794` | The 40-project home is an eight-line copy of the #122 case's builder. It is cheap, not an expensive resource, and drift would fail loudly (both cases assert 40 rows) | Not now. It needs no persistent record; the owner decides whether to keep or drop it |

### Document sync

Scope checked:

- The materials handed over: the spec, this record and the gateway log, each read in full, and the range's diffs (e2e,
  the theme stylesheet, the prototypes' stylesheets).
- The feature's workings directory, listed with hidden files (`ls -laR`; all 25 files are tracked):
  - Read in full: `checklist.md`, `ticket-281-doc-sync.md`, `ticket-281-review-code.md`, `ticket-281-tasks.md`, and the
    evidence files `e2e-plants.txt`, `e2e-plant-corner-dark.txt`, `e2e-red-first.txt`, `theme-vars.txt`,
    `chromium-custom-scrollbar.txt`.
  - Not read: the screenshots, the probes (`scrollbar-probe.txt`, `prototype-measure.txt`) and the targeted logs. They
    back the design and the targeted runs, and this check takes its run results from the gateway.
- A repository-wide `rg -uu` for scrollbar statements over `docs`, `CONTEXT.md`, the READMEs, `AGENTS.md`, `e2e` and
  `src` (227 hits). Outside appearance, the hits are other features' records naming #281 as a follow-up, and unrelated
  "accepted by hand" notes; none is affected.
- `docs/features/appearance.md` has no scrollbar statement yet (step 8, pending in the doc-sync checklist).
- Excluded: `site/` (out of scope: the landing page).

What the findings oblige, for the main agent to apply (this check edited only this section):

- T1: the e2e file head and the case comment; the checklist's F1/F2 rows; this record's Coverage. If the probe works,
  also the spec's "no overlay Mac was measured" and the checklist's planned verification for F1/F2.
- T2: this record's F7 line; the checklist's F7 rows (planned "Gate: the full e2e suite (...)", current "Not run yet").
- T3: this record's S6 row and Coverage; the checklist's F6 rows.
- T4: the six-combination case (if it is extended) and the spec's Testing Decisions line, which then either holds or is
  reworded; the checklist's C2/B5 row.
- T5: this record's resource column.
- The checklist and spec edits fall under the doc-sync checklist's pending rows "Record the actual verification of this
  ticket's units" and "Write back what implementation changes or finds". If the T1 probe or the T4 extension changes a
  test's executable content, an incremental check follows. A comment-only change (T1's gap note) needs none.

## Handling of the post-implementation check's findings (implementing session, 2026-10-23)

### Design changes, re-reviewed before the tests changed

| # | Covers | Seam | Input that drives the target branch | Asserted object and expected value's source | Fixture shape source | Expensive resource and how it is provided |
|---|---|---|---|---|---|---|
| S10 (new, T1) | appearance F1, F2 | e2e, the running app, macOS only (an explicit skip elsewhere, naming why) | Two launches, each with a per-process `-AppleShowScrollBars` argument: `WhenScrolling` (the overlay scrollbar) and `Always` (the classic one); the 40-project home | First, that the setting reached the app: a control block given the standard `scrollbar-width: thin`, which makes Chromium draw the platform's own scrollbar for it, measures 0 under `WhenScrolling` and above 0 under `Always`. Then the project list's scrollbar is 6 under both, and, the pointer away and nothing scrolled, its thumb's centre is black at 25% over the list's background (the spec's light value, blended in the test). Expected: the spec's 6px whatever the platform draws. Re-reviewed with the idle reading added (the incremental check's I1 and K1) | The 40-project home, from one builder shared with S1 | Two launches; a launch measures 0.6–0.7s in the gateway, so it is not an expensive resource (T5) |
| S9 (changed, T4) | appearance::REQ-001/AC-04 (not the theme), C2 | e2e, the existing six-combination case | Its three themes × two appearances | The two thumb tokens read in each state, beside the float shadow it already reads: one light value, one dark value, the two different. Kept: the one-off `theme-vars` reading as evidence | — | That case's launch, no new one |
| S6 (unchanged, T3) | appearance F6 | — | — | Keyboard scrolling is not driven, and is left out on purpose: like the wheel step, a keyboard step could fail only if the list stopped scrolling at all, which the click, drag and wheel steps already guard; the drawing does not reach the keyboard path | — | — |

Probe behind S10 (`evidence/ticket-281/overlay-probe.txt`): on a build without the rule, the injected block measured 0
with no argument (this Mac's automatic setting resolved to overlay that day, where the first red run had measured the
classic 15), 0 under `WhenScrolling`, 15 under `Always`, 0 under `Automatic`; on this change's build, 6 in all four.

### Coverage and resources corrected

- **F7 (T2)**: held by construction, not by the suite. The layouts that measure their width read their own boxes (the
  hit row's cut, the name reveal, the token chart's labels), so a 6px scrollbar changes their input, not their rule;
  no e2e case puts such a layout beside a scrollbar that is drawn (the side filter row and the tab row sit outside
  their scrollers, and the skills and hit-row fixtures do not overflow). The overlay direction, where content loses
  6px it had, is the case S10 now drives for the scrollbar itself; its effect on a measured layout stays unverified.
- **F1, F2 (T1)**: driven by S10 on macOS. The case's comment saying a test cannot set them is corrected.
- **T5**: an app launch is not an expensive resource here (0.6–0.7s); the conclusions do not change.
- **T6** (the 40-project builder copied from the #122 case): one builder now serves the scrollbar cases; the #122
  case keeps its own copy, outside this change. Left for the owner to keep or drop as a note.

### Shown red (`evidence/ticket-281/e2e-plants-d-e.txt`)

- S10 under a missing width rule: fails at the `WhenScrolling` launch's 6px assertion (the platform's overlay scrollbar
  then measures 0).
- S9's six-state assertion under a theme block declaring its own light thumb: fails at "one light thumb in every theme".
Restored byte for byte and rebuilt after each. The changes touch the e2e file's executable content, so an incremental
check follows on their commit.

## Post-implementation check — incremental, on the fix

2026-10-23. Ticket: [#281](https://github.com/aloong-planet/agentshed/issues/281), feature `appearance`. Fix range:
be791fe..b0bcfac. Implementation version: b0bcfac. Run by the same independent subagent as the first round, which did
not inherit the implementation conversation.

Run evidence: the fix's targeted verification ([targeted-fixes-t.txt](evidence/ticket-281/targeted-fixes-t.txt)). Its
recorded version is be791fe plus four modified files, each with its `git hash-object`. All four equal b0bcfac's blobs:
`e2e/app.spec.ts` 51fc6ae, the spec 04b0092, the checklist 84b94e9, this record 64e6d85. b0bcfac adds only three
evidence files on top, none of which a test reads. The log has every command, its full output and its exit code: lint,
typecheck, the site tests, one build, all 84 cases of `e2e/app.spec.ts`, and the three checks, all 0, with
`TARGETED_EXIT=0`. No finding.

The latest full gateway, [gateway-7211ff3.txt](evidence/ticket-281/gateway-7211ff3.txt), predates the fix. Per
/implement it must be re-run before delivery. This check did not re-run it and ran no test.

### Incremental scope and how it was found

- Code changed in the range: `git diff --stat be791fe b0bcfac -- src e2e scripts playwright.config.ts package.json`
  lists only `e2e/app.spec.ts` (62 insertions, 10 deletions). The changed tests:
  - the scrollbar case: its fixture moved into a helper, and its comment changed;
  - the new macOS styles case (S10, `e2e/app.spec.ts:4267`);
  - the six-combination case, which now also reads the thumb tokens (S9, `e2e/app.spec.ts:4051`).
- Changed helpers: `launch` gains a trailing `extraArgs` parameter that defaults to `[]`, and `manyProjectsHome` is new.
- Who imports the e2e file: `rg -n "app\.spec" e2e src scripts playwright.config.ts` finds no import, only comments and
  `check-lang`'s fixture path strings, so the dependents all sit in `e2e/app.spec.ts`.
- Who calls `launch`: a scan of the file for calls to the helper, excluding `electron.launch(` and comment lines, finds
  66 calls in 65 source tests. Their argument counts: 45 pass two, 20 pass three, and one passes four (S10,
  `:4270`).
  - For the 64 tests that pass three or fewer, the launch arguments are unchanged: `...extraArgs` spreads an empty
    array.
  - The memory case launches Electron directly, so it does not depend on the helper.
- Who calls `manyProjectsHome`: `rg -n "manyProjectsHome\(" e2e` finds its definition (`:4165`), the scrollbar case
  (`:4184`) and S10 (`:4270`).
- Rows of the test design table changed in the range: S10 (new), S9 (changed) and the S6 note on keyboard scrolling,
  all in the handling section above.
- Carried over from the first round (the "Post-implementation check" section above, at 7211ff3): the memory case's
  scrollbar block, and the helpers `pixelAt`, `paintedBackground`, `scrollArea`, `near` and `over`. The fix did not
  touch them.

### Test design table against the written tests (incremental)

| Row | Result |
|---|---|
| S10 | Matches. macOS only, through an explicit, named `test.skip`. Two launches, one with `-AppleShowScrollBars WhenScrolling` and one with `Always`, each on a fresh 40-project home from the shared builder. Each launch asserts a control block with `scrollbar-width: thin` (0 for the overlay launch, above 0 for the classic one), then the list's overflow, then its 6px, then no main-process error |
| S9 | Matches. The two tokens are read as one `rest / hover` string in each of the six states, beside the float shadow. The case asserts six states, one light value, one dark value, and that the two differ; the light value also may not have an empty half. The six states are entered through the mode control and the theme control, as before. The `theme-vars` reading is kept as evidence |
| S6 note | Matches: no keyboard step, and the reason is stated |
| Scrollbar case (S1–S7) | Its behaviour is unchanged: the builder's code moved verbatim into `manyProjectsHome` (same prefix, same 40 directories, same `.claude.json`). Its comment no longer says a test cannot set macOS's style |
| The 64 other `launch` callers | No rows in this ticket's table; their launch arguments are unchanged (above) |

Gap notes (Dimension 1): the first round's T1 asked for the overlay gap to be noted in the file head. That is no longer
needed: F1 and F2 are now driven on macOS, and S10 states in its skip reason why it does not run on other platforms.

### Coverage

Conclusion: T1–T4 handled. One finding about what S10's coverage rests on (I1), and one about stale statements in this
record (I2).

- F1, F2: S10 reaches both of macOS's styles in the app's own process.
  - It reads the list's width under each. A 6px gutter under the overlay style shows that Chromium did not draw the
    styled scrollbar as an overlay one, which would take no width.
  - It does not read the thumb at rest under the overlay style. That is F1's user-visible claim (the thumb does not
    hide when idle), which therefore rests on the inference that only overlay scrollbars fade.
  - F2 names three settings, but S10 drives two. Automatic resolves to one of those two styles (the probe read it as
    overlay), so the two launches cover every style the app can meet, but nothing states this. Both points: I1.
- F4's theme half and C2: S9 now guards the tokens in every run (plant E).
- F6: the reason for leaving keyboard scrolling out is now recorded, in the checklist and in the S6 note.
- F7: the checklist now says "by construction", names the layouts that read their own boxes, and says no layout beside a
  drawn scrollbar is driven. The handling section says the same.
- The 64 other `launch` callers: unaffected.

### Case design

Conclusion: no red flag.

- S10's control block is a measuring instrument, not state under test. The test appends it with fixed positioning,
  measures it and removes it before the list is read, so it takes no part in the list's layout. It plays the same role
  as the canvas `pixelAt` uses.
- The setting goes through the launcher's public arguments.
- The skip is Playwright's explicit one, with its reason.
- Each launch has its own userData and home, both removed by `close`.
- S9 reads the computed tokens in the same way the case already reads the float shadow.
- The `launch` change is a defaulted trailing parameter: no existing caller's arguments change.

### False greens

Per the project capability declaration, mutation-testing is not enabled, so mutation testing is skipped. When each new
or changed assertion goes red:

| Assertion | Goes red when | Seen red |
|---|---|---|
| S10, control 0 under `WhenScrolling` (`:4284`) | That launch's platform style is classic: the argument is ignored and the machine has a mouse | No; the probe shows the style switching (`overlay-probe.txt`: 0 under `WhenScrolling` and 15 under `Always` on a build without the rule) |
| S10, control above 0 under `Always` (`:4285`) | That launch's platform style is overlay: the argument is ignored on a trackpad-only machine | No; same probe. Between them, the two controls make the case fail loudly if the argument stops working on either kind of machine, rather than quietly testing one style twice |
| S10, list overflows (`:4287`) | Precondition | Not needed |
| S10, list 6 (`:4288`) | The rule is missing (the platform's overlay scrollbar measures 0, and its classic one 15) or the width is wrong | Yes, plant D at the `WhenScrolling` launch. Under `Always`, reasoned from the first round's red first (15) |
| S9, six states (`:4152`) | A state is not read | Not needed |
| S9, one light value (`:4155`) | A theme block declares its own light thumb or hover | Yes, plant E |
| S9, one dark value (`:4156`) | A theme's dark block declares its own | No; reasoned, the same mechanism as plant E |
| S9, light differs from dark (`:4157`) | The dark declaration is missing (the light one is inherited) or equal | No; reasoned |
| S9, no empty half (`:4158`) | A light token resolves empty; the case's existing resolution check catches this first | No; reasoned |

Form list:

- Always-true: each S10 control and the list's overflow are asserted before the width.
- Tautology: none. The expected 6 comes from the spec. S9's expectations are structural (one value per appearance), not
  recomputed from the stylesheet.
- Old path: S9 asserts the tokens, which is what C2 states. A theme rule written directly on the scrollbar
  pseudo-element would bypass the tokens and pass. The same holds for every token-guarded neutral colour in that case
  (the float shadow too), and the scrollbar case draws only the default theme. Recorded as what the guard does not
  catch; no change recommended.
- Silent skip: none. S10's skip is explicit and named, so CI's ubuntu run reports it as skipped. F1 and F2 are
  therefore verified only in macOS runs (the local gateway), as the checklist says.
- Assertions that might not run: S10's `if (overlay) … else …` asserts in both branches. Everything is awaited.

UI assertions (`false-greens.md`): §9, S10's control reads the platform style in the same document and process as the
list, so it observes the style the list is drawn under.

S10's comment says the control "shows the argument took effect". Strictly, each control shows the style in effect for
its launch, whatever caused it; the pair shows the argument works. Either way the state under test is reached, so the
conclusion holds.

Environment note, not a finding: the probe found this Mac in the overlay style later the same day, where the first
red-first run had found it classic. So in the scrollbar case, which assertion carries the absence of the rule depends
on the machine.

- On a classic-style machine, the track assertions catch it (a painted track).
- On an overlay-style machine there is no platform track, but the width (0), the thumb at rest (the background) and the
  click below the thumb still catch it.

The case goes red without the rule either way.

### Resource reuse

Conclusion: no finding. Counted from the targeted run:

- One `electron-vite build` (log lines 57–81) precedes the 84 cases.
- S10 makes two launches in 1.4s in all (line 143), about 0.7s each, so a launch is not an expensive resource (T5).
  The launches are separate because the setting is per process: different arguments give a different app.
- S9 adds no launch (853ms, line 141).
- The scrollbar case still launches once (1.2s, line 142).
- `manyProjectsHome` builds a fresh home per launch: 40 empty directories, not an expensive resource.

### Findings

| # | Dimension | Location | Finding | Suggested handling |
|---|---|---|---|---|
| I1 | Coverage | S10, `e2e/app.spec.ts:4267–4292`; the handling section's S10 row; [checklist](checklist.md) F1/F2 rows ("Verified on macOS") | Under the overlay style, S10 asserts the gutter only. F1's user-visible point, that the thumb stays shown while nothing scrolls, is not read; it rests on the inference that only overlay scrollbars fade (the code review's source reading). F2 names three settings and S10 drives two; that Automatic resolves to one of the two styles is not stated | Now: in the `WhenScrolling` launch, with the pointer away, read the thumb's centre against black at 25% over the list's background. This uses existing helpers and no extra launch; it goes red if a styled scrollbar were faded at rest. Then state in the S10 row and the checklist why Automatic needs no launch of its own. Alternative: state both inferences in the S10 row and the checklist instead of adding the read |
| I2 | Coverage (record) | This record's "Design review": the test design table's S9 row (Evidence outside the suite), no S10 row, the Coverage paragraph (F1 "not automatable here … stated as a gap in the e2e file", F2 "likewise, a gap", "F7 by the full e2e suite (… run at the new width)", F6 with no keyboard note), and the Resource reuse paragraph ("an app launch (over a second)") | The corrections sit only in the later handling section, so the test design table and its coverage still carry the superseded statements beside them. This goes against the document-sync rule that the old summary of the same scope is replaced, not followed by a conflicting one, and against this table's own precedent for S8 ("amended during implementation, below") | Now, documents only (no re-check needed): amend the S9 row, add the S10 row, and correct the Coverage and Resource reuse lines in place, each with a pointer to the handling section. The first-round "Post-implementation check" section stays as it is, as the original report of that review |

### Document sync (incremental)

Scope checked:

- The fix's diff for the tests, the spec and the checklist.
- This record's handling section.
- The new evidence files `overlay-probe.txt`, `e2e-plants-d-e.txt` and `targeted-fixes-t.txt`, each read in full. Plant
  D's failing line (`:4288`) and plant E's (`:4155`) are the current lines of the assertions they target, so each plant
  reached its target.
- The latest gateway log, for its version.

The spec's Implementation Decisions and Testing Decisions now describe S10 and S9 as written. The checklist's F1/F2, F6,
F7 and C2/B5 rows were updated in place.

What the findings oblige, for the main agent to apply (this check edited only this section):

- I1: S10, if the read is added; the handling section's S10 row; the checklist's F1/F2 rows. Adding the read changes
  S10's executable content, so a further incremental check would follow. Stating the inferences instead is
  documents-only.
- I2: this record's design table, Coverage and Resource reuse lines in the Design review section.
- Independently of these findings: the full gateway must be re-run before delivery (/implement), since the tests
  changed after 7211ff3.

## Handling of the incremental check's findings (implementing session, 2026-10-23)

| # | Handling |
|---|---|
| I1 | S10 now reads the idle thumb in both launches, the pointer away: black at 25% over the list's background, so the thumb is shown painted at rest under both styles; what rules out an overlay scrollbar is the 6px width, which an overlay one would not take (corrected after the second incremental check's K2). The case's comment states why macOS's automatic setting needs no launch: it resolves to overlay with only a trackpad and classic with a mouse, and the probe measured it at 0, the overlay style (`overlay-probe.txt`) |
| I2 | The design review section's stale statements amended in place, each pointing here: the S9 and S1 rows, the Coverage paragraph's F1, F2, F6 and F7, the resource wording |

Shown red: an invisible light thumb fails at the `WhenScrolling` launch's idle-thumb reading, the width still 6 (`evidence/ticket-281/e2e-plant-f.txt`). I1 changes the e2e file's executable content, so the incremental check runs once more on its commit.

## Post-implementation check — second incremental, on the I1 and I2 fix

2026-10-23. Ticket: [#281](https://github.com/aloong-planet/agentshed/issues/281), feature `appearance`. Fix range:
b0bcfac..db00779. Implementation version: db00779. Run by the same independent subagent, which did not inherit the
implementation conversation.

Run evidence: the fix's targeted verification ([targeted-fixes-i.txt](evidence/ticket-281/targeted-fixes-i.txt)). It
records b0bcfac plus three modified files with their `git hash-object`, and all three equal db00779's blobs:
`e2e/app.spec.ts` 54c7118, the checklist 301aee9, this record d28d2be. db00779 adds only evidence files on top (plant
F's and this log), none of which a test reads. The log has every command, its full output and its exit code: lint,
typecheck, the site tests, one build, all 84 cases of `e2e/app.spec.ts`, and the three checks, all 0, with
`TARGETED_EXIT=0`. No finding.

The full gateway ([gateway-7211ff3.txt](evidence/ticket-281/gateway-7211ff3.txt)) still predates both fixes and must be
re-run before delivery (/implement). This check did not re-run it and ran no test.

### Incremental scope and how it was found

- Code changed: `git diff --stat b0bcfac db00779 -- src e2e scripts playwright.config.ts package.json` lists only
  `e2e/app.spec.ts` (8 insertions, 1 deletion).
- Where in that file: `git diff -U0 b0bcfac db00779 -- e2e/app.spec.ts` has two hunks, both inside S10:
  - `+4265,3`, in S10's doc comment (`:4260–4268`);
  - `+4291,5`, the idle-thumb read in S10's body (`:4269–4299`).
- No helper changed: `pixelAt`, `scrollArea`, `near`, `over` and `rgb` are only called. So no other test depends on the
  change, and the only test in scope is S10.
- Rows of the test design table changed in the range: the S1 row's resource note, the S9 row's pointer, and the Design
  review's Coverage and Resource reuse paragraphs (I2). The S10 row, whose test changed, was not changed: K1.
- Carried over: every other test and helper, from the previous incremental round (at b0bcfac) and the first round (at
  7211ff3).

### Test design table against the written tests (incremental)

| Row | Result |
|---|---|
| S10 | Does not match. The test now reads the idle thumb in both launches: the pointer moved away, then the thumb's centre is compared with black at 25% over the list's background. The design row (handling section, "S10 (new, T1)") still lists only the control block and the 6px, so the table no longer describes the test: K1 |
| S1, S9 (I2 amendments) | Consistent with the tests; the amendments only point to later sections |

### Coverage

Conclusion: I1 and I2 are handled; one record finding (K1).

- F1: the thumb is now read at rest under both of macOS's styles, so its user-visible point is read, not inferred, for
  the moment of the read. That the thumb stays shown over time is K2.
- F2: the comment and the checklist now say why Automatic needs no launch: it resolves to one of the two driven styles,
  and the probe measured it as overlay.
- I2: the Design review's stale statements (S1's resource, S9, F1, F2, F6, F7, and the resource paragraph) are now
  marked as superseded, with pointers. S10 has no row in the main table, but the Coverage paragraph points to the S10
  row in the handling section, which follows the S8 precedent. Accepted.

### Case design

Conclusion: no red flag. The idle read moves the pointer to (5, 5), outside the list; nothing in S10 had put the pointer
over the thumb. It reuses the measured `columnX` and `thumbY`; nothing has scrolled, so the thumb is still at the top. It
asserts through the same pixel helpers as S3.

### False greens

Per the project capability declaration, mutation-testing is not enabled, so mutation testing is skipped.

| Assertion | Goes red when | Seen red |
|---|---|---|
| S10, idle thumb = black 25%, both launches (`:4294–4295`) | The thumb is not painted at rest under that style (a transparent or missing token, or a rule that leaves it unpainted), or the light token is off by more than 2 | Yes, plant F at the `WhenScrolling` launch: 255 against 191. Plant F's failing line (`:4295`) is the current line of the assertion, so it reached its target. Under `Always`, reasoned from the same mechanism |

Under `Always` in light, the platform's classic thumb (about 193) would sit inside the tolerance of 191, as recorded for
S3. But the 6px assertion just before it already rules out the platform's scrollbar, so this is no false green.

§5 (reading too early): the read comes moments after the window is resized and the list first overflows. So it shows
the thumb painted at rest at that moment, not that it stays so. It is the width that excludes the overlay style: an
overlay scrollbar takes no width, so the 6px assertion fails first. Inference: an overlay scrollbar that had just
appeared on that change might not yet have faded at the read. So the comment "an overlay scrollbar would have faded"
and the handling note "the overlay style's fading is excluded by a reading, not by inference" give the read credit for
something the width does: K2. The case's verdict is sound either way; only what the read claims is overstated.

### Resource reuse

Conclusion: no finding. Counted from the targeted run: one `electron-vite build` (log lines 56–80) before the 84 cases.
S10 still makes two launches, now 1.6s in all (line 142). The read adds no launch.

### Findings

| # | Dimension | Location | Finding | Suggested handling |
|---|---|---|---|---|
| K1 | Coverage (record) | The S10 design row ("S10 (new, T1)", in "Handling of the post-implementation check's findings"); "Handling of the incremental check's findings", nested as an H3 under the previous review section | The test gained the idle-thumb read, but its design row did not. The skill asks for the design table to be changed and re-reviewed before a case's design changes; here the table still describes the earlier test. Also, the handling for I1 and I2 sits as an H3 inside the previous review's section, so it reads as part of that review's report. The first handling section was a section of its own | Now, documents only (no re-check needed): add the idle read to the S10 row's asserted object (both launches, pointer away, black at 25% from the spec's light alpha blended in the test) and note that it was re-reviewed. Promote the handling heading to an H2, like the first handling section |
| K2 | False greens (wording) | The comment at `e2e/app.spec.ts:4291` ("an overlay scrollbar would have faded"); the I1 handling row ("excluded by a reading, not by inference") | The read shows the thumb painted at rest at one moment, right after the list first overflows. The width is what excludes the overlay style. Reading persistence would need a delayed second read | Now: reword both. Say the read shows the thumb painted at rest, and that the 6px excludes the overlay style. This is a comment-only change, so no re-check is needed once /implement's syntax-tree comparison shows only the comment changed. A delayed second read (the suite already waits a set time for "does not happen" checks, such as `app.spec.ts:5065`) is not recommended: no known mechanism fades a scrollbar that keeps its gutter |

### Document sync (incremental)

Scope checked:

- The fix's diff for the test file and the checklist.
- This record's diff: the Design review's amendments and the new handling rows.
- Plant F's evidence and the targeted log, each read in full.

The checklist's F1/F2 row now names the idle read and plant F, and says why Automatic needs no launch. It describes the
read accurately ("in both, the idle thumb black at 25% over the list, the pointer away").

What the findings oblige, for the main agent to apply (this check edited only this section):

- K1: the S10 design row, and the heading level of "Handling of the incremental check's findings".
- K2: the comment at `e2e/app.spec.ts:4291` and the I1 handling row.
- Both are documents and comments only. The full gateway is still to be re-run before delivery.

## Handling of the second incremental check's findings (implementing session, 2026-10-23)

| # | Handling |
|---|---|
| K1 | The S10 design row now lists the idle reading and says it was re-reviewed; the earlier handling heading is promoted to the same level as the first, so it no longer reads as part of a review |
| K2 | The case's comment and the I1 handling row reworded: the reading shows the thumb painted at rest, the 6px rules out overlay. Comment only: the syntax trees without comments match (`evidence/ticket-281/k2-comment-only.txt`), so no further check |
