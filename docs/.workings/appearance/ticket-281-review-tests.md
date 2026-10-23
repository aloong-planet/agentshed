# Test review — #281

Ticket: [#281](https://github.com/aloong-planet/agentshed/issues/281). Spec: [appearance](../../specs/appearance.md),
appearance::REQ-001 and sequence F.

## Design review

2026-10-23. Implementation version: 5f376ad (the spec, the prototype and the records; no implementation yet), on
`fix/thin-scrollbars` cut from fc3fbeb.

### Test design table

| # | Covers | Seam | Input that drives the target branch | Asserted object and expected value's source | Fixture shape source | Expensive resource and how it is provided |
|---|---|---|---|---|---|---|
| S1 | appearance::REQ-001/AC-01, AC-03 (shown while idle); #281's strip | e2e, the running app's project list | 40 registered projects at a 1000×600 viewport, so the list overflows; nothing scrolled | The list overflows (scroll height above client height, asserted first), then its width less its client width less its borders = 6. Expected: the spec's 6px. Red today: the e2e window draws a 15px classic scrollbar | The 40-project home of the #122 case (registered project directories, the form `.claude.json` takes): the rows are what matter, not their contents | One app launch for S1–S7, on the build `pnpm e2e` makes once |
| S2 | appearance::REQ-001/AC-02 (no track), light | the same | S1's state | A pixel in the scrollbar's column below the thumb, read from a capture of the window, equals the list's own background (the first painted background up its ancestors, read from computed styles), within 2 per channel. Expected: the spec's "the surface beneath shows through". Red today: the classic track is a lighter grey than the list | the same | the same launch |
| S3 | appearance::REQ-001/AC-04, light | the same | S1's state | A pixel at the thumb's centre equals black at 25% laid over the list's background, within 2. Expected: the spec's literal alpha, blended by hand in the test, not read from the stylesheet | the same | the same launch |
| S4 | appearance::REQ-001/AC-05, light | the same | The pointer moved onto the thumb | The same pixel equals black at 40% over the background; polled on the pixel itself (false-greens §5) | the same | the same launch |
| S5 | appearance::REQ-001/AC-02, AC-04, AC-05 in dark; sequence F4 | the same | The page's colour scheme emulated dark, with no reload; the list's background polled until it is the dark one | S2–S4 again with white at 22% and 36% over the dark background. Red today, and #281's own symptom: the light track beside a dark list | the same | the same launch |
| S6 | appearance F6 | the same | A wheel turn over the list; a press on the thumb dragged down; a click in the scrollbar's column below the thumb | Each moves the list's scroll position down from where it was. Expected: the spec's "behave as before" — the platform's scrolling, not a value of ours | the same | the same launch |
| S7 | appearance::REQ-001/AC-03 (none when the content fits), F5 | the same | The viewport made taller than the 40 rows need, then short again | Tall: no overflow and a 0 width difference; short again: overflow and 6 | the same | the same launch |
| S8 | appearance::REQ-001/AC-01 (horizontal, 6px tall), AC-02 (the corner), F3, F8 (a drawer, rendered markdown) | e2e, the memory drawer's preview of the wide file, inside the existing case that already opens it | The wide file: a long unbroken path and a wide table make the drawer's body scroll both ways; a wide code line makes its fence scroll sideways | The body's two scrollbars measure 6 and 6, the fence's horizontal one 6; the corner square's innermost pixel equals the body's background, read in dark (amended during implementation, below) | The existing wide-file fixture, shaped on Codex's consolidated memory (memory-view E5) | That case's launch, no new one |
| S9 | appearance::REQ-001/AC-04 (not the theme), C2 | `theme-vars` over the theme stylesheet (the ui-design tool), Evidence | The six theme × appearance states | The two thumb tokens resolve in every state, differ between light and dark, and do not differ across the themes | — | One headless Chrome run, outside the suite |

### Coverage

Against appearance::REQ-001 and sequence F: AC-01 (S1, S8), AC-02 (S2, S5, S8), AC-03 (S1, S7), AC-04 (S3, S5, S9),
AC-05 (S4, S5); F1 is the e2e window's classic case — a trackpad-only Mac's overlay case is not automatable here (the
test machine's input devices decide it), stated as a gap in the e2e file; F2 (macOS's setting) likewise, a gap; F3 (S8);
F4 (S5 for light/dark, S9 for the theme); F5 (S7); F6 (S6); F7 by the full e2e suite (the one-line labels, the
hit-row cut and the side filter row run at the new width); F8 (S8 for the drawer and rendered markdown; that every
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

The expensive resources are the app build (made once by `pnpm e2e`) and an app launch (over a second). S1–S7 take one
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
| S10 (new, T1) | appearance F1, F2 | e2e, the running app, macOS only (an explicit skip elsewhere, naming why) | Two launches, each with a per-process `-AppleShowScrollBars` argument: `WhenScrolling` (the overlay scrollbar) and `Always` (the classic one); the 40-project home | First, that the setting reached the app: a control block given the standard `scrollbar-width: thin`, which makes Chromium draw the platform's own scrollbar for it, measures 0 under `WhenScrolling` and above 0 under `Always`. Then the project list's scrollbar is 6 under both. Expected: the spec's 6px whatever the platform draws | The 40-project home, from one builder shared with S1 | Two launches; a launch measures 0.6–0.7s in the gateway, so it is not an expensive resource (T5) |
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
