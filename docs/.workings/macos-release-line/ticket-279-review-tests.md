# Test review — #279

Ticket: [#279](https://github.com/aloong-planet/agentshed/issues/279), the landing page's memory and search steps
and its pinned features section. Spec: [landing-page](../../specs/landing-page.md) as rewritten in 80f2968.
Coverage: [checklist.md](checklist.md), rows marked #279.

## Design review

2026-10-21. Implementation version: 80f2968 (the spec and the confirmed prototype; no site code changed yet).
Scope: every test planned for #279 in `site/`, and the browser measurement that carries the spec's Evidence
items (landing-page Testing Decisions: the features section's scroll behaviour and the layout are measured in a
browser, not tested).

### Test design table

Seams, as the spec's Testing Decisions name them: **the built-site check** (`site/test/built-site.test.ts`, the
pages one fresh build produces, read with JSDOM before any script runs) and **the browser measurement** (a
script driving Chrome through Playwright against a fresh build served by `astro preview`, kept with the
evidence, as #237 and #238 did). The features script and the language switch have no unit seam: their
behaviour is geometry and scrolling, which only a browser computes.

Resources: **the site build** (0.45s measured in the post-implementation check, so under this review's one-second bar for an expensive resource; F5 corrected the design's "several seconds"), built once per test run by the existing global
setup (`site/test/build-site.ts`) and shared read-only by every built-site test; **the browser and the served
build** of the measurement, one build and one browser per measurement run, each page a fresh context.

| # | Test (built-site check unless marked) | Spec units | Input that reaches the branch | Assertion and where the expectation comes from | Fixture shape | Resource |
|---|---|---|---|---|---|---|
| B1 | Six feature steps in order, each with its own screenshot (changes "four feature steps") | landing-page::US-003/AC-01 | The served pages in both languages | The showcase's screenshots and the stacked steps' screenshots are `overview, project, memory, tokens, session, search` in that order, as `/shots/<view>-<locale>.png`: a literal list, from the spec's order | The product's own build; no external data | The shared build |
| B2 | As served, the first step is the current one, and the count reads "01 / 06" to "06 / 06" | landing-page::REQ-004/AC-01 | The served pages, before any script | The `.on` flags of the six texts and the six screenshots are `[true, false × 5]`; the count labels are the six literal strings, the format the spec gives ("03 / 06") | As B1 | The shared build |
| B3 | The English feature titles are the spec's six (changes "the spec's four") | landing-page::US-003/AC-01 | The English page | A literal list of six titles, from the confirmed prototype's copy | As B1 | The shared build |
| B4 | The sessions step speaks of searching within the project, the search step of searching across projects, and no step names a shortcut | landing-page::US-003/AC-02 | Both pages | English: the sessions step's text ends with "or search within the project." and the search step's text is the confirmed prototype's sentence, literal; Chinese: the sessions step's text contains the prototype's words for "search within the project", and the search step's its words for searching every project's sessions (amended after the post-implementation check, F5: the test carried this assertion; reviewed, no further finding); no step's text in either language contains a shortcut glyph or key name (⌘, ⇧, Cmd, Ctrl, Shift) | As B1 | The shared build |
| B5 | The hero's heading and paragraph are the README's opening line and summary | landing-page::REQ-007 | Both pages, and `README.md` / `README.en.md` at the repository root | The README's opening paragraph — the first after the title and the line linking the other README, split at blank lines, line breaks read as spaces — equals, exactly: the page's heading and the language's full stop in bold, the sentence that calls Agentshed a macOS app, and the page's paragraph. So a summary extended or cut at either end, in the README or on the page, fails it (shown: `evidence/ticket-279/readme-check-plant.txt`). Amended after the post-implementation check (F1) together with REQ-007, which now says what "the summary" is; reviewed again. The expectation comes from the README files, independent of the site's dictionary; the English heading is also checked against the spec's literal "Your coding agents, in full view" | The repository's real READMEs | The shared build; two small files read once |
| B6 | Every image declares its size, and the count of images is fifteen (changes eleven) | landing-page::REQ-005/AC-03 | Both pages | Fifteen images: the brand, the hero icon, the hero window, six in the showcase, six in the stacked steps — counted from the spec's six steps shown in two places; each declared aspect equal to the PNG's own | The shipped PNGs, read for their header | The shared build |
| B7 | Every string of the copy is on its page (unchanged; its data grows by the two new steps and the new hero copy) | landing-page::US-002/AC-02 | Both pages | Each dictionary string found in the page's text or attributes | As B1 | The shared build |
| M1 | Browser: the showcase pins under the header, a narrow text column and a large screenshot, whole under the header in a short window; nothing but the text and the screenshot in it | landing-page::REQ-004/AC-01; Failure C3 | 1280×800 and 1280×560, both languages, scrolled into the showcase | The pinned block's top equals the header's bottom (58px) at several scroll positions inside the showcase; the text column narrower than half the screenshot's width; the screenshot's rect inside the viewport below the header at both heights; the pin's children are exactly the text column and the screenshot stage | The fresh build | One build, one browser |
| M2 | Browser: natural scrolling turns the steps | landing-page::REQ-004/AC-08; Failure C1 | Scroll positions before the showcase, at its pin point plus k × 60% of the window (k = 0…5) ± 10% of a turn, and past it; a jump from the download section back | Current step = the literal expected k at each position, 0 before and 5 after; after a jump the step matches the position. The wheel: a real wheel event through Playwright moves `scrollY` by its delta (a captured wheel would not) | As M1 | As M1 |
| M3 | Browser: a turn cross-fades in place | landing-page::REQ-004/AC-05; Failure C6 | Turning from each step to the next, read after the 0.3s transition | Every step's count and title sit at the same rect top before and after the turn; mid-turn (100ms in, the incoming text and screenshot at an opacity between 0 and 1) they already stand where they end, so a slide fails; only opacity is animated (`transition-property` `opacity`, and `opacity, visibility` for the hidden) and nothing is transformed; the screenshot stage's rect unchanged; the fade is 0.3s, and 0s under reduced motion (emulated); the five other texts and screenshots compute `visibility: hidden`; the element at the stage's centre belongs to the current screenshot. The mid-turn sample and the property were added after the post-implementation check (F2) and reviewed | As M1 | As M1 |
| M4 | Browser: phones get the stacked steps | landing-page::REQ-004/AC-06 | 400×800, both languages | The showcase is not displayed; six stacked steps, each with its screenshot, and a gap of at least 44px between one step's screenshot and the next step's title | As M1 | As M1 |
| M5 | Browser: switching language keeps the step | landing-page::REQ-004/AC-07; Failure C5 | At each of the six steps, a real click on the other language's link | On the other page the same step is current and the showcase's block sits at the same distance from the top (±1px). It would fail if the pinned block marked the place: every step would come back as the first. Also, away from the showcase (added after the post-implementation check, F4, and reviewed): at 400px with the third stacked step across the middle, and at 1280px with the install section across it, the same element comes back at the same distance (±1px) | As M1 | As M1 |
| M6 | Browser: resizing leaves no stale step | Failure C2 | At step 3: 1280 → 700, a scroll to one turn while narrow, → 1280; then at three turns, 1280×800 → 1280×600 | After widening, the current step is the one the new position gives by the spec's rule, computed independently of the page's script, and not the step before narrowing (so a page that does not follow after crossing 760px fails); after the height change, literally the fifth step (1440px is four turns of 360px). Amended after the post-implementation check (F3) and reviewed | As M1 | As M1 |
| M7 | Browser: without scripts, the stacked steps at every width | Failure C7 (derived, written back to the spec) | 1280×800 with JavaScript disabled | The showcase is not displayed; the six stacked steps are, each with its screenshot | As M1 | As M1 |
| M8 | Browser: the layout across widths and the appearances (regression) | landing-page::QR-001/AC-01, REQ-006, Failure D1 | 400, 900, 1280 and 1440px, both languages, light and dark | No sideways scroll (the root's scroll width within its client width); the hero's side gutters; the showcase's title and text colours resolve to the palette's text tokens in each appearance | As M1 | As M1 |
| E1 | The shipped screenshots are the confirmed prototype's | landing-page::REQ-005/AC-01, AC-02; Failure E2 | `site/public/shots/` against `docs/prototypes/landing-page/shots/` | Byte-identical, file by file (14 files), with each file's size from its PNG header; command and output kept | The approved and the confirmed sets | None |

### Dimension 1: Coverage

Against the spec's failure modes in the scope of #279 (Sequence C and E2), one row each:

| Failure item | Covered by |
|---|---|
| C1 a fast scroll or a jump | M2 |
| C2 resizing, height changes | M6 |
| C3 a short window | M1 (1280×560) |
| C4 screenshots not yet loaded | B6 (declared sizes) |
| C5 a language switch while pinned | M5 |
| C6 a screen reader meets the current step only | M3 (visibility of the others) |
| C7 without scripts (derived during this review; written back to the spec with the implementation) | M7 |
| E2 what the screenshots show | E1 |

The regressions the increment touches (US-001/AC-01, REQ-003, REQ-006, QR-001/AC-01, CON-002) stay with the
existing built-site tests and M8. The download states (REQ-001, REQ-002, Failures A1–A8) are not affected this
round (checklist header) and keep their tests unchanged.

Gaps stated in the test file's header: the scroll behaviour and the layout are browser Evidence (M1–M8), not
tests, by the seam the owner chose for this page. Fixture shape: no test reads external data; B5 reads the
repository's real READMEs, the source the requirement names.

### Dimension 2: Case design

Every row reads the product through its public surface: the served HTML (B1–B7) or the rendered page in a
browser with real input (M1–M8: scrolling by `scrollTo` and a real wheel event, a real click on the language
link, a real resize). No module of the project is mocked, no internal state is written, no call count is
asserted. M2–M6 drive real scrolling rather than calling the features script, so a script that is never wired
up fails them. No finding.

### Dimension 3: False greens (by design)

- **Always-true assertions**: B6's count is exact (fifteen), not a bound; B2's flags are a full list; M2
  covers both sides of every step boundary (±10% of a turn), so an off-by-one or a floor in place of the
  rounding fails. No finding.
- **Tautology**: B1–B4 compare with literals taken from the spec and the confirmed prototype, not with the
  site's dictionary. B5's expectation comes from the README files, which the site does not read. M2's expected
  steps are literals for positions chosen in units of a turn. B7 does compare the page with the dictionary,
  which is its job (a string missing from the page), not copy correctness. No finding.
- **Stale path**: the rows that change (B1, B3, B6) replace assertions on the clickable list (`.fs-item`, the
  frame `.fs-panel`), which this change removes; no test may keep asserting on them. No finding.
- Mutation testing: per the project's capabilities, `mutation-testing` is not enabled, so it is skipped; when
  each test would turn red is answered row by row in the post-implementation check.
- Browser assertions (review-code `false-greens.md`): M1–M8 assert geometry and computed values read after the
  0.3s transition (form five), compare positions rather than existence (form one), and use real input (form
  two). M5 and M7 each name the fault they would catch. The measurement script's own sanity is checked by
  asserting its sets are non-empty (six texts, six screenshots) before any per-item check.

### Dimension 4: Resource reuse

The site build is the only expensive resource of the tests: built once per `vitest run` by the global setup
and read by every built-site test, as before; B5's README reads are small files. The measurement builds once
and opens a fresh browser context per case. Nothing is rebuilt per case. No finding.

## Post-implementation check

2026-10-21. Implementation version: 7af1220 (range 80f2968..7af1220). Run by an independent sub-agent that did not
inherit the implementing session. Scope: every row of the Test design table above: B1–B7 in
`site/test/built-site.test.ts`, M1–M8 in [measure.mjs](evidence/ticket-279/measure.mjs), E1 in
[shots-check.txt](evidence/ticket-279/shots-check.txt). Code, tests and the data they read stayed as in 7af1220 for
the whole review (`git diff --quiet 7af1220 -- site/src site/test site/public site/vitest.config.ts
site/astro.config.mjs site/package.json README.md README.en.md`, exit 0); only documents were edited alongside it.

**Runtime evidence.** The full run is [gateway-7af1220.txt](evidence/ticket-279/gateway-7af1220.txt): HEAD 7af1220,
an empty status, every command with its full output and its exit code, `VERIFY_EXIT=0`; `pnpm lint` and `pnpm e2e`
ran, as the capabilities `lint` and `e2e-suite` require. It meets `/implement`'s requirements for the log: no
finding. My own runs, limited to the tests this change wrote or changed:

| Command | Exit | Result |
|---|---|---|
| `pnpm --dir site exec vitest run test/built-site.test.ts --reporter=verbose`, at 7af1220 | 0 | 34 of 34 passed, none skipped; 2.12s wall clock, the build included |
| A byte-identical copy of `measure.mjs` (`cmp`), with `SITE_URL` pointing at a build of the site in a scratch directory served by `astro preview` on port 4499; its output kept outside the repository | 0 | 230 of 230 passed; all 230 values identical to the committed `results.json` |
| `git ls-tree 7af1220` of `site/public/shots/` and `docs/prototypes/landing-page/shots/`, compared blob by blob | — | 14 files each, every blob identical (E1) |

### The written tests against the Test design table

| Row | Written at | Against the row |
|---|---|---|
| B1 | built-site.test.ts:137 | As designed |
| B2 | :159 | As designed |
| B3 | :146 | As designed; it also checks the stacked steps' titles |
| B4 | :176 | One assertion more than the row: the Chinese search step contains the prototype's words for searching every project's sessions (:185). Reviewed as a design change: the expectation is the confirmed prototype's (prototype-landing.html:278), not the dictionary's; no further finding. The row needs amending (F5) |
| B5 | :202–229 | As designed; the design itself is too weak (F1) |
| B6 | :240 | As designed |
| B7 | :288 | Unchanged; its data grew with the new copy |
| M1 | measure.mjs:63–86 | As designed; it also reads "03 / 06" two turns in |
| M2 | :88–118 | As designed |
| M3 | :120–155 | Reads the transition's duration but not its property (F2) |
| M4 | :157–169 | As designed |
| M5 | :171–196 | As designed, plus a control (session storage blocked) that shows the check can fail |
| M6 | :198–222 | No literal expectation, and the narrow-and-back case cannot catch a stale step (F3) |
| M7 | :224–232 | As designed |
| M8 | :234–258 | As designed |
| E1 | shots-check.txt | The result holds at 7af1220; the record has defects (F7) |

Fixtures and resources match the rows: the built-site tests read the shared build through `inject('builtSite')`, B5
reads the two root READMEs, and the measurement launches one browser and opens one context per case. The test file's
header states the browser gap and the condition under which it would become tests; its "Failures C1–C7" includes C4,
which B6 covers in that file (F8).

### Dimension 1: Coverage

| Spec item | Covered by | Conclusion |
|---|---|---|
| landing-page::US-003/AC-01, AC-02 | B1, B3, B4 | Covered |
| landing-page::REQ-004/AC-01, Failure C3 | B2, M1 | Covered |
| landing-page::REQ-004/AC-05, Failure C6 | M3 | Covered, except that the fade happens in place (F2) |
| landing-page::REQ-004/AC-06 | M4 | Covered |
| landing-page::REQ-004/AC-07, Failure C5 | M5 | Covered inside the pinned showcase; the rest of the switch is not measured on this code (F4) |
| landing-page::REQ-004/AC-08, Failure C1 | M2 | Covered |
| Failure C2 | M6 | The height change is covered; crossing 760px never makes the step stale (F3) |
| Failure C4, landing-page::REQ-005/AC-03 | B6 | Covered |
| Failure C7 | M7 | Covered |
| landing-page::REQ-005/AC-01, AC-02, Failure E2 | E1, B6 | Covered |
| landing-page::REQ-007 | B5 | The heading is covered; "word for word" is not proven (F1) |

Regression points this change touches: the features script (M1–M7); the language switch, whose `lookedAt()` and
`anchors()` were rewritten for every position (F4); the hero copy (B5, B7); the image count (B6). Fixture shape: no
test reads data produced elsewhere; B5 reads the real READMEs the requirement names, and the measurement aborts the
download's two reads. No finding beyond F1–F4.

### Dimension 2: Case design

No module of the project is mocked, spied on or called: the test file imports only Node, JSDOM, Vitest and the
dictionary its older tests use, and the measurement imports only Node and Playwright and never calls the page's
scripts (`rg` over both files). The measurement drives real input: scrolling that the browser dispatches, a real
wheel, a real click, real viewport changes. M2, M3 and M5 take the current step from the `on` class, and M3 asserts
its visible effect (the other steps compute `visibility: hidden`; the point at the stage's centre hits the current
screenshot). No finding.

### Dimension 3: False greens

Per the project's capabilities, `mutation-testing` is not enabled; this item is skipped. When each test turns red,
answered against the code and the source of its expectation:

| Row | Turns red when | Stays green when |
|---|---|---|
| B1 | either place loses, reorders or mislabels a screenshot; a selector matches nothing (six literals are expected) | — |
| B2 | a step other than the first is served current; a count label is not "0n / 06" | — |
| B3 | an English title differs or is missing in either place | — |
| B4 | there are not six bodies; the English sessions body does not end with the phrase; the English search body is not the prototype's sentence; a Chinese phrase is missing; a body contains ⌘, ⇧, Cmd, Ctrl or Shift | a shortcut is spelt out in words outside that list ("Command-F"); the app's own (⌘⇧F, or Cmd or Command with Shift and F) is caught. No finding |
| B5, heading | the heading is not the README paragraph's bold opening without its full stop; the page's paragraph is in no README paragraph | — |
| B5, paragraph | the page's paragraph is in no README paragraph, or is 80 characters or fewer | the README's summary grows or changes at either end while the page keeps its text; the page's paragraph loses words at either end (F1) |
| B6 | the count is not 15; a size is missing; a declared aspect differs from the PNG's | — |
| M1 | the showcase is not pinned at 58px 2.5 and 5 turns in (at 0 turns that check holds even without pinning); anything but the two columns in it; the column not narrower than half the screenshot; the screenshot under the header or past the window's bottom | — |
| M2 | any position gives another step (a floor, an off-by-one or another turn length all fail at ±0.1 turn); the wheel is captured | — |
| M3 | the count, the title or the stage moves between settled steps; another step is not hidden; a hidden screenshot takes the pointer (steps 1–5: at the last the topmost screenshot is the current one anyway); no fade, or a fade under reduced motion | the turn slides (a transform) and settles in the same place within 0.3s (F2) |
| M4 | the showcase shows; fewer steps; a screenshot hidden; a gap under 43.5px | — |
| M5 | the step or the block's place is lost; the control shows that the restoring is what keeps them | — |
| M6, height | the step does not follow 800 → 600 (4 expected, and `e2 !== 3`) | — |
| M6, narrow and back | — | the page never re-syncs after crossing 760px: the position, and so the expectation, is unchanged (results: c1 = e1 = 3) (F3) |
| M7 | without scripts the showcase shows, or the stacked steps or a screenshot hide | — |
| M8 | a sideways scroll; a gutter under 24px; a colour other than the app's; the layout not switching at 760px | — |
| E1 | a shipped screenshot differs from the confirmed set | — |

Browser and command checks (review-code `false-greens.md`): values are read after the 0.3s transition, with frames
before and after the wait (form five); geometry and computed styles, not existence (form one); real input (form two);
nothing on `html` or `body` clips overflow (`overflow: hidden` only on `.lang` and `.shot`), so M8's root scroll width
can exceed its client width (form eight); the measurement exits non-zero on any failure, and my run took that exit
code directly (form six). Two evidence records do not tie their result to the version: `results.json` names no
version (F6), and shots-check.txt's recorded command cannot produce its recorded lines (F7). My runs above confirm both
results on 7af1220.

### Dimension 4: Resource reuse

- The site build: 0.45s for a build of 7af1220's site into a scratch directory, and 2.12s for the whole one-file test
  run with its build. Under the one-second threshold, so not an expensive resource; the global setup builds it once
  per `vitest run` in any case. The full run's log shows no build output (the setup builds at `logLevel: 'warn'`), so
  no count can be read from it. The design's "several seconds" is corrected here (F5).
- The measurement's browser: launched once per run (my run printed its single `browser:` line once); one build, one
  preview server.
- B5's README reads: two small files, once per test file.

No finding.

### Findings

| # | Dimension | Where | Finding | Suggested handling |
|---|---|---|---|---|
| F1 | 3 (with 1) | built-site.test.ts:211–212, 226–229; row B5; landing-page::REQ-007; the checklist's REQ-007 row | The paragraph check proves containment, not equality: the README paragraph that includes the page's paragraph, which has more than 80 characters. A README summary extended later (a clause for a new feature) while the page keeps the old text stays green, and so does a page paragraph cut at either end: the drift REQ-007 exists to catch. Part of the cause is in the spec: the README's opening paragraph is its bold line, then the platform sentence ("A macOS app." and its Chinese counterpart), then the page's text, and REQ-007 does not say that the platform sentence is left out | Now, in this ticket: say in REQ-007 that the summary is the opening paragraph after its bold line and its platform sentence; assert that the README's opening paragraph equals the bold line, the platform sentence and the page's paragraph joined by spaces; amend row B5 and the checklist's verification text |
| F2 | 3 (with 1) | measure.mjs:135, 148; row M3 | M3 reads `transitionDuration` once the turn has settled; the row asks for "0.3s on opacity". A slide (a 0.3s transform ending where it started), the form the owner dropped because the screenshot jumped (spec Further Notes, 2026-10-21), passes | Now: assert `transitionProperty` (`opacity` on the current text and screenshot, `opacity, visibility` on the others), or sample the rects mid-turn; re-run and keep the results |
| F3 | 1 (with 3) | measure.mjs:208–214, 220; row M6; Failure C2 | Crossing 760px must leave no stale step, but the narrow-and-back case resizes at a fixed position, so the step expected afterwards is the step before (c1 = e1 = 3 in both languages): a page that never re-synced after widening passes. The row's comparison with a literal expectation is missing; only `e2 !== 3` is there | Now: at 700px scroll to a position that gives another step on the wide layout (past the showcase, or one turn in), widen, and compare with that literal; compare the height case with the literal 4 |
| F4 | 1 | site/src/scripts/language-switch.ts:29–52; measure.mjs:171–196; the checklist's REQ-004/AC-07 row | This change rewrote `lookedAt()` and `anchors()` for every position, but M5 switches only inside the pinned showcase at 1280px. A switch at 400px from a stacked step (the `step:i` anchors) and a wide switch outside the features section are not measured on this code; #237 measured the 400px case (ticket-237/measure.mjs:390–397) on the code this change replaced. The checklist's row reads "also while pinned" | Now: add both cases to measure.mjs with M5's ±1px check |
| F5 | Consistency | The Test design table (B4; the resource paragraph) | Row B4 lacks the Chinese search-step assertion the test carries (reviewed above, no further finding); "the site build (several seconds)" measures 0.45s | Amend the rows together with F1–F3 |
| F6 | 3 | results.json; the evidence README | Neither names the version measured; results.json was written at 23:27, before 7af1220 was committed at 23:28:10. My run on 7af1220 reproduced all 230 values | When re-running for F2–F4, write HEAD and the uncommitted files into results.json, as the gateway log does |
| F7 | 3 | shots-check.txt; row E1 | The recorded command (`cmp …; sips …`) prints nothing for identical files and computes no hash, so it cannot have produced the recorded lines; it ran at 80f2968 with the shots uncommitted, and the row says the sizes come from the PNG header. My blob comparison at 7af1220 confirms the result | Low priority, in this ticket: record the command actually run, or regenerate at the final commit with a command that prints its own verdicts |
| F8 | 1 | built-site.test.ts:6–7 | The header says Failures C1–C7 are not covered in the file, but C4 is (B6) | Low priority: "C1–C3 and C5–C7" |
| F9 | Document sync | checklist.md; the evidence directory | Failure C7 (in the spec, measured by M7) is missing from the checklist's coverage row "landing-page Failures C1–C6, E2" and from its #279 reverse-trace row. gateway-7af1220.txt and prototype-vs-site.txt are ignored (`.gitignore:4`, `docs/.workings/`) and untracked, while the evidence README now links both | Now, with step 8: add C7 to both rows; `git add -f` the two files so the evidence stays with the ticket |

### Document sync

The findings change what these documents may state; they go back to the implementing session for
[ticket-279-doc-sync.md](ticket-279-doc-sync.md): landing-page::REQ-007 in the spec (F1); checklist.md's #279 rows for
REQ-007, REQ-004/AC-07 and the Failures (F1, F4, F9), and its current-verification row, which still reads "Not run
yet"; the Test design table (F1, F2, F3, F5); results.json and the evidence README (F2, F3, F4, F6); shots-check.txt
(F7); the test file's header (F8). Not checked by this review: docs/features/landing-page.md, final-regression.md and
the code review record, which the implementing session was editing during it. A fix that changes a test's executable
content, the measurement included, needs an incremental check.

### Handling of the findings (implementing session, 2026-10-21)

| # | Handling |
|---|---|
| F1 | Fixed. REQ-007 now says what the summary is (the rest of the README's opening paragraph after its line and the sentence that calls Agentshed a macOS app); B5 asserts the opening paragraph equals the bold line, that sentence and the page's paragraph, exactly. Shown to fail when the English README's summary grows by a sentence, the README restored byte for byte ([readme-check-plant.txt](evidence/ticket-279/readme-check-plant.txt)). Row B5 and the checklist's REQ-007 row amended |
| F2 | Fixed. M3 samples each turn 100ms in, with the incoming text and screenshot between 0 and 1 opacity, and requires them already where they end; it asserts that only opacity (and visibility, for the hidden) is animated and that nothing is transformed. Row M3 amended |
| F3 | Fixed. M6 scrolls to one turn while narrow, then widens, and requires the step the new position gives and not the step before; the height case requires the literal fifth step. Row M6 amended |
| F4 | Fixed. M5 adds a switch at 400px with the third stacked step across the middle and at 1280px with the install section across it, each within 1px. Row M5 and the checklist's AC-07 row amended |
| F5 | Fixed: rows B4 and the resources paragraph amended |
| F6 | Fixed. The measurement writes the commit and every uncommitted file's hash into results.json, and the browser's version; rerun |
| F7 | Fixed. `shots-check.mjs` compares the two folders byte for byte, reads each size from the PNG header, hashes each file and writes `shots-check.txt` headed by the version |
| F8 | Fixed: the test file's header names C1–C3 and C5–C7 |
| F9 | Fixed: C7 in the checklist's two rows; every file of the evidence folder tracked |

The fixes change the built-site test and the measurement's executable content, so an incremental check follows on
the fix commit, with the targeted verification log of the fixes.

## Post-implementation check, incremental: the fixes (7af1220..823a40e)

2026-10-22. Implementation version: 823a40e (fix range 7af1220..823a40e). Run by the same independent sub-agent as the
check above, which did not inherit the implementing session. Every dimension's conclusion outside the scope below
carries over from the post-implementation check above (2026-10-21, on 7af1220).

**Scope, by the incremental rule.**

- Tests changed in the range (`git diff --name-only 7af1220 823a40e`): `site/test/built-site.test.ts` (B5 rewritten,
  header), [measure.mjs](evidence/ticket-279/measure.mjs) (M3, M5, M6, the version it records) and the new
  [shots-check.mjs](evidence/ticket-279/shots-check.mjs) (E1).
- Tests that depend on test helper code changed in the range: none. `git diff --name-only 7af1220 823a40e --
  site/test/build-site.ts site/test/fixtures site/vitest.config.ts` lists nothing. An `rg -n -uu` over all 103 tracked
  test files (`git ls-files -- '*.test.*' '*.spec.*' 'site/test/*' 'e2e/*' 'scripts/*.test.mjs' 'build/*.test.cjs'`),
  searching for the names of the files changed in the range, finds only comments about #238's evidence, fixtures that
  tests write into temporary directories, seed strings in `check-lang.test.mjs`, and B5's own reads of the root
  READMEs, which are unchanged in the range.
- Rows of the Test design table changed in the range: B4, B5, M3, M5, M6 and the resources paragraph. E1's row is
  unchanged, but its check (shots-check.mjs) is new.

**Runtime evidence.** The fixes' targeted log is [targeted-fixes.txt](evidence/ticket-279/targeted-fixes.txt). It
holds HEAD 7af1220 and 19 uncommitted files, each with its `git hash-object`, then each command with its full output
and exit code, and `TARGETED_EXIT=0`. Against the fix range: the 19 files are exactly those the range changes, apart
from the log itself. 18 hashes equal the blobs in 823a40e. The 19th is `results.json`, which the logged measurement
rewrites as its last step; the committed `results.json` records the same HEAD and the same 19 entries, so log and
results describe one run on 823a40e's tree. No finding on the log's form. Its scope lacks the E1 script's run (F10).
My own runs, limited to the objects above:

| Command | Exit | Result |
|---|---|---|
| `pnpm --dir site exec vitest run test/built-site.test.ts --reporter=verbose`, at 823a40e with a clean status | 0 | 32 of 32 passed, none skipped; B5 is now one exact-equality test per language, plus the English heading's literal |
| `git diff --quiet 7af1220 823a40e -- site/public/shots docs/prototypes/landing-page/shots` | 0 | Both folders unchanged in the range, so the blob-by-blob comparison above (14 of 14 identical at 7af1220) still holds |

### The changed tests against the changed rows

| Row | Written at | Against the row |
|---|---|---|
| B4 | built-site.test.ts:176 (unchanged) | The amended row now carries the Chinese search-step assertion: as designed |
| B5 | :202–227 | As designed: the opening paragraph is the first that neither starts with `#` nor links the other README, and must equal the bold heading with its full stop, the macOS sentence and the page's paragraph |
| M3 | measure.mjs:154–179 | As designed: a sample 100ms (plus two frames) into each turn requires the incoming opacity strictly between 0 and 1 and the count, title and stage already where they end; `transition-property` only `opacity` or `opacity, visibility`; `transform` none |
| M5 | :227–240 | As designed: the third stacked step at 400px and the install section at 1280px, each first placed at 40% of the window (checked), come back within 1px |
| M6 | :252–269 | As designed: a scroll while narrow, then the step the new position gives and not 3; the height case the literal index 4 |
| Resources paragraph | — | Matches the measured build (0.45s; 253ms in the targeted log) |
| E1 (row unchanged) | shots-check.mjs | Now as the row says: bytes compared, sizes from the PNG header, output kept with its version |

The test file's header names Failures C1–C3 and C5–C7: correct (F8 closed).

### Dimension 1: Coverage

The gaps F1–F4 are closed. landing-page::REQ-007 is now asserted word for word. The spec now says what the summary
is, and readme-check-plant.txt shows the English test failing when the README's summary grows by a sentence, with
the README restored (README.en.md is unchanged in the range). Failure C2's crossing of 760px now reaches a stale step:
before narrowing the step is 3, and after the scroll while narrow the position gives 6 (index 5). landing-page::
REQ-004/AC-07 is now measured away from the showcase, and AC-05's "in place" during the fade. No new gap; fixture
shapes are unchanged.

### Dimension 2: Case design

The changed code mocks, spies on and calls nothing of the project. B5 reads the READMEs, the requirement's own
source, from disk. The measurement's additions use browser-dispatched scrolling, real clicks and real viewport
changes, and read rects and computed styles. shots-check.mjs reads files. No finding.

### Dimension 3: False greens

Per the project's capabilities, `mutation-testing` is not enabled; this item is skipped. When each changed check
turns red:

| Check | Turns red when | Stays green when |
|---|---|---|
| B5 | the README's opening paragraph and the bold heading, macOS sentence and page paragraph differ in any character, in either language; the README's opening paragraph moves, or links the other README; the page's heading is empty | — (shown red by the plant, the failing test being the English B5) |
| M3, mid-turn | the incoming text or screenshot is not mid-fade 100ms in (no fade, or a read outside the fade: the sample checks its own timing); the count, title or stage stands elsewhere mid-fade than at the end (a slide by transform, position or animation) | — (recorded opacities 0.67–0.74, text and screenshot equal) |
| M3, animated | any transitioned property besides opacity and visibility; any deck element transformed when settled | — |
| M5, away from the showcase | the stacked step or the install section does not come back within 1px; the setup did not place it at 40% of the window | — |
| M6, narrow and back | the step after widening is not the position's, or the position's step is still 3 | — (a page that never re-synced shows 3) |
| M6, height | the step is not index 4, or the position under 600px does not give index 4 | — |
| shots-check.mjs | a file differs, or exists in one folder only | neither folder holds a PNG: "0 file(s) compared" exits 0 (F11; the recorded output says 14) |

Browser checks (review-code `false-greens.md`): the mid-turn sample asserts that it was read inside the fade (form
five), and the new M5 cases assert their own setup. For a new check, a red has been shown only for B5. The others are
answered above by reasoning, as mutation testing is not enabled. One observation, not a finding: in M6 the scroll
"to one turn" while narrow ends, after widening, at a position past the showcase (index 5, both languages), because
the browser moves the position when the stacked list disappears. The check computes its expectation from the actual
position and requires it to differ from 3, so it still discriminates.

### Dimension 4: Resource reuse

Counted from the targeted log: `pnpm --dir site build` once for the measurement (observable: "2 page(s) built in
253ms"), and one browser launch (its single `browser:` line). The built-site tests' global-setup build prints
nothing at `logLevel: 'warn'`; it runs once per `vitest run` and is under the one-second bar. The new M5 cases open
one context each. No finding.

### Findings

| # | Dimension | Where | Finding | Suggested handling |
|---|---|---|---|---|
| F10 | 3 (runtime evidence) | targeted-fixes.txt; shots-check.mjs | The new E1 script's run is not in the targeted log: no command line, no exit code. Its output file stands in, headed HEAD 7af1220 with no uncommitted files under the two folders. Both folders are unchanged in the range, so E1 holds at 823a40e | Low priority, in this ticket: the next time the evidence is regenerated, run shots-check.mjs inside a logged run so its exit code is kept. No further review needed, since the script would be unchanged |
| F11 | 3 | shots-check.mjs:17, 33–36 | With no PNG in either folder it reports "0 file(s) compared, 0 not identical" and exits 0. The recorded run compared 14, so the evidence stands | Do not change now: the script serves this ticket's evidence only, and its output states the count. If it is ever reused, assert that the count is the expected one. No other home needed |
| F12 | Document sync | evidence/ticket-279/README.md | Its file table does not list targeted-fixes.txt, the fixes' runtime evidence | Now, with the next evidence edit: add a row |

### Document sync

The incremental check changes no requirement or behaviour statement. The checklist's #279 rows for REQ-007,
REQ-004/AC-07 and the Failures now match the tests (F1, F4, F9 closed). Its current-verification row is still
pending in ticket-279-doc-sync.md, which says it is written once this check is done. F12 adds a row to the evidence
README. F10 and F11 change no document's statement.

### Handling of the incremental check's findings (implementing session, 2026-10-22)

| # | Handling |
|---|---|
| F10 | Done in the final logged run before delivery: the full gateway, then the site's build, the measurement and `shots-check.mjs`, each with its command, exit code and output, in one log |
| F11 | Left as it is, as the check suggests: the recorded run compared fourteen files, and the script is this ticket's evidence, not a reusable gate |
| F12 | Done: the evidence README lists `targeted-fixes.txt` |

No test's executable content changed in this handling, so no further incremental check.
