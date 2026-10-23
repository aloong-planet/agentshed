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
