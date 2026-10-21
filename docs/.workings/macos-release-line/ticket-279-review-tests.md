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

Expensive resources: **the site build** (several seconds), built once per test run by the existing global
setup (`site/test/build-site.ts`) and shared read-only by every built-site test; **the browser and the served
build** of the measurement, one build and one browser per measurement run, each page a fresh context.

| # | Test (built-site check unless marked) | Spec units | Input that reaches the branch | Assertion and where the expectation comes from | Fixture shape | Resource |
|---|---|---|---|---|---|---|
| B1 | Six feature steps in order, each with its own screenshot (changes "four feature steps") | landing-page::US-003/AC-01 | The served pages in both languages | The showcase's screenshots and the stacked steps' screenshots are `overview, project, memory, tokens, session, search` in that order, as `/shots/<view>-<locale>.png`: a literal list, from the spec's order | The product's own build; no external data | The shared build |
| B2 | As served, the first step is the current one, and the count reads "01 / 06" to "06 / 06" | landing-page::REQ-004/AC-01 | The served pages, before any script | The `.on` flags of the six texts and the six screenshots are `[true, false × 5]`; the count labels are the six literal strings, the format the spec gives ("03 / 06") | As B1 | The shared build |
| B3 | The English feature titles are the spec's six (changes "the spec's four") | landing-page::US-003/AC-01 | The English page | A literal list of six titles, from the confirmed prototype's copy | As B1 | The shared build |
| B4 | The sessions step speaks of searching within the project, the search step of searching across projects, and no step names a shortcut | landing-page::US-003/AC-02 | Both pages | English: the sessions step's text ends with "or search within the project." and the search step's text is the confirmed prototype's sentence, literal; Chinese: the sessions step's text contains the prototype's words for "search within the project"; no step's text in either language contains a shortcut glyph or key name (⌘, ⇧, Cmd, Ctrl, Shift) | As B1 | The shared build |
| B5 | The hero's heading and paragraph are the README's opening line and summary | landing-page::REQ-007 | Both pages, and `README.md` / `README.en.md` at the repository root | The README paragraph (split at blank lines, line breaks read as spaces) that contains the page's paragraph word for word exists, and starts with the page's heading and the language's full stop in bold. Revised while writing it, reviewed again: the first draft took the README's first bold phrase, which is the language line's current language, so the opening paragraph is now found by the summary it holds. The expectation comes from the README files, independent of the site's dictionary; the English heading is also checked against the spec's literal "Your coding agents, in full view" | The repository's real READMEs | The shared build; two small files read once |
| B6 | Every image declares its size, and the count of images is fifteen (changes eleven) | landing-page::REQ-005/AC-03 | Both pages | Fifteen images: the brand, the hero icon, the hero window, six in the showcase, six in the stacked steps — counted from the spec's six steps shown in two places; each declared aspect equal to the PNG's own | The shipped PNGs, read for their header | The shared build |
| B7 | Every string of the copy is on its page (unchanged; its data grows by the two new steps and the new hero copy) | landing-page::US-002/AC-02 | Both pages | Each dictionary string found in the page's text or attributes | As B1 | The shared build |
| M1 | Browser: the showcase pins under the header, a narrow text column and a large screenshot, whole under the header in a short window; nothing but the text and the screenshot in it | landing-page::REQ-004/AC-01; Failure C3 | 1280×800 and 1280×560, both languages, scrolled into the showcase | The pinned block's top equals the header's bottom (58px) at several scroll positions inside the showcase; the text column narrower than half the screenshot's width; the screenshot's rect inside the viewport below the header at both heights; the pin's children are exactly the text column and the screenshot stage | The fresh build | One build, one browser |
| M2 | Browser: natural scrolling turns the steps | landing-page::REQ-004/AC-08; Failure C1 | Scroll positions before the showcase, at its pin point plus k × 60% of the window (k = 0…5) ± 10% of a turn, and past it; a jump from the download section back | Current step = the literal expected k at each position, 0 before and 5 after; after a jump the step matches the position. The wheel: a real wheel event through Playwright moves `scrollY` by its delta (a captured wheel would not) | As M1 | As M1 |
| M3 | Browser: a turn cross-fades in place | landing-page::REQ-004/AC-05; Failure C6 | Turning from each step to the next, read after the 0.3s transition | Every step's count and title sit at the same rect top before and after the turn; the screenshot stage's rect unchanged; the transition is 0.3s on opacity, and 0s under reduced motion (emulated); the five other texts and screenshots compute `visibility: hidden`; the element at the stage's centre belongs to the current screenshot | As M1 | As M1 |
| M4 | Browser: phones get the stacked steps | landing-page::REQ-004/AC-06 | 400×800, both languages | The showcase is not displayed; six stacked steps, each with its screenshot, and a gap of at least 44px between one step's screenshot and the next step's title | As M1 | As M1 |
| M5 | Browser: switching language keeps the step | landing-page::REQ-004/AC-07; Failure C5 | At each of the six steps, a real click on the other language's link | On the other page the same step is current and the showcase's block sits at the same distance from the top (±1px). It would fail if the pinned block marked the place: every step would come back as the first | As M1 | As M1 |
| M6 | Browser: resizing leaves no stale step | Failure C2 | At step 3: 1280 → 700 → 1280 wide; then 1280×800 → 1280×600 at a fixed scroll position | After each resize the current step equals the one the scroll position gives under the new height (computed from the measured showcase geometry, then compared with the literal expectation for that position) | As M1 | As M1 |
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
