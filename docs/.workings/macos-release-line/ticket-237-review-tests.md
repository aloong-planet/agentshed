# Test review — ticket #237

Ticket: [#237 The landing page in Chinese and English](https://github.com/aloong-planet/agentshed/issues/237)
· feature `macos-release-line` · specs [landing-page](../../specs/landing-page.md),
[mac-distribution](../../specs/mac-distribution.md)

## Design review

- Date: 2026-10-18
- Version: implementation started from 26b9216 (`origin/main`), branch `feat/landing-page`; the `site/`
  scaffold (package, lockfile, Astro configuration, assets) uncommitted, no test written yet
- Scope: every test this ticket plans — the site's unit tests and the built-site check (the two seams the
  owner confirmed on 2026-10-13, landing-page Testing Decisions), plus the gate changes (the working-language
  rule for the site's dictionary, the CI steps)

### Test design table

Seams: **U** = a pure module of the site, under vitest; **B** = the built site: the HTML and CSS of one
fresh Astro build, read as files and parsed with jsdom and postcss. No case drives a browser: the scroll,
click and layout behaviour is Evidence by the owner's seam decision, measured separately (see Coverage).

| Case | Spec items | Seam | Input that reaches the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource and provision |
|---|---|---|---|---|---|---|
| U1 no blank copy | US-002/AC-02, CON-002 | U: the two dictionaries | every leaf string of both languages | each is non-blank after trimming; the rule itself (a blank value renders as nothing and no other check sees it) | the real dictionaries | none |
| U2 the list state's download view | US-001/AC-04, REQ-002/AC-04, REQ-002/AC-05 (list links) | U: the download view for the list state, per language | the list state, `zh` and `en` | hero and section buttons lead to `https://github.com/aloong-planet/agentshed/releases` (the spec's "GitHub's release list" and the repository's URL) in a new tab; one section button; the English labels equal the spec's text; no version-shaped text in any label | none | none |
| B1 two pages | CON-002, US-002/AC-01 | B | every `.html` file in the build output | exactly `index.html` with `lang="zh-CN"` and `en/index.html` with `lang="en"`; the spec ("Chinese at `/`, English at `/en`", "Chinese and English only") | the real build | the build, once per test process |
| B2 the served list state | REQ-001/AC-04, REQ-002/AC-04, US-001/AC-04, US-001/AC-01 (platform line) | B | the raw served HTML of both pages (no script runs) | the hero button's text, target and link; the platform line beneath it; no pill; the download section's line and its one button; the English texts from the spec, the Chinese from the dictionary (mapping only — copy fidelity is the evidence row below) | the real build | shared build |
| B3 header, sections, footer | REQ-003, US-002/AC-01, Failures B1, B2 | B | both pages | brand icon and name; navigation labels in order (English from the spec) and their targets, every `#…` target an element of the page; the toggle is the header's last group, the current language marked `aria-current="page"`, the other linking to the other page; sections in the order hero, features, install, download; the features title and subtitle (spec); footer links and the copyright line (spec) | the real build | shared build |
| B4 hero content | US-001/AC-01 | B | both pages | the icon, the title, a paragraph, the button and the whole-window screenshot `hero-<language>.png` inside the hero | the real build | shared build |
| B5 four feature steps | US-003/AC-01, US-002/AC-02 (shots) | B | both pages | four steps in the spec's order with the English titles from the spec; each step's own screenshot and the frame's stack name the same four views in the same order, all of that page's language; as served exactly the first of the frame's screenshots is shown | the real build | shared build |
| B6 three install steps | US-004/AC-01 | B | both pages | three steps; the English steps carry the spec's content (DMG for Apple Silicon; drag into Applications; Apple's check, Open, the update button at the bottom left) | the real build | shared build |
| B7 every screenshot's space is held | REQ-005/AC-03, Failure C4 | B | every `<img>` of both pages | each declares `width` and `height`, its source exists in the build output, and the declared ratio equals the file's own pixel ratio (read from the PNG header); the spec (space held before load) | the real build and its PNGs | shared build |
| B8 copy complete, two languages, non-exhaustive wording | REQ-006, CON-002, US-002/AC-02 | B | page text plus attribute values of both pages | every leaf of a language's dictionary is on that language's page (completeness of rendering; source the dictionary, which is what this property is about); the English page carries no Han character except the toggle's name for Chinese, written in Chinese; every mention of an agent side sits in the non-exhaustive phrase, "Grok" nowhere (REQ-006 and the CONTEXT invariant) | the real build | shared build |
| B9 every GitHub link opens in a new tab | REQ-002/AC-05 (list links), Failure B2 | B | every `a[href]` on github.com in both pages | `target="_blank"` and `rel` containing `noopener`; the spec | the real build | shared build |
| U3 the palette (was B10; moved in the TDD loop, see below) | REQ-006, Failure D1 | U: the site's stylesheet, parsed with postcss | the stylesheet's top-level `:root` and its `prefers-color-scheme: dark` `:root` | every token declared in the light block and again in the dark block; each token the app also has equals the app's purple value in `src/renderer/src/theme.css`, light and dark (an independent file); a token the app does not have is one of the named site-only tokens (five since the hero icon's outline shadow, confirmed 2026-10-18) | the site's real stylesheet and the app's real stylesheet | none |
| G1 the working-language rule for the site's dictionary | — (ADR-0017 gate) | `pnpm check:lang` | a Chinese comment added to the site's dictionary; Chinese values unchanged | red naming the file and line with the rule's reason; green again when removed, while the dictionary's values stay permitted | mutation of the real file | none |
| G2 the CI job runs the site's tests | Technical prerequisite | CI `checks` job (a required check) | a deliberately broken built-site expectation pushed to the pull request | the job turns red at the site step, then green after the restore | the real workflow | CI run |

Increment in the TDD loop (re-reviewed before writing it): B10 became U3. The build minifies the CSS, which
rewrites colour values (`#ffffff` to `#fff`, `rgba()` to hex), so comparing the built CSS with the app's
source would need a colour normaliser of its own — a second implementation to trust. The source stylesheet
is what the build minifies losslessly; that the built page renders both appearances is measured in the
browser (D1). Dimension 1: still covered; dimension 2: no coupling; dimension 3: expected values from the
app's file, not the site's; dimension 4: no expensive resource.

Copy fidelity to the confirmed prototype (both languages) is evidence, not a test: the prototype's copy table is
read in a browser and compared with the site's dictionaries, and the comparison is kept with the measurement
record. A test reading `docs/prototypes/` would tie the site to a throwaway page.

### Coverage

Each failure item in the spec this ticket owns, and what covers it:

| Item | Covered by |
|---|---|
| A-series | #238 (the reads); the served list state, which A1 lands on as well, is B2 |
| B1 direct visit to `/en`, toggle | B1, B3; Evidence: browser |
| B2 GitHub in a new tab, section links in the page | B3, B9; Evidence: browser |
| C1 fast scroll or jump | Evidence: browser (the frame shows the nearest step after a jump down and back) |
| C2 resizing across 760px | Evidence: browser (resize wide → narrow → wide, current step recomputed) |
| C3 short window | Evidence: browser (a short viewport; the step's text body stays visible) |
| C4 shots not yet loaded | B7; Evidence: browser (layout before images load) |
| D1 light and dark | B10; Evidence: browser in both appearances |
| E1 | #238 |
| E2 | Background |

Gaps, with the condition to close them, to be stated in the built-site check's file header: REQ-004 (all
seven ACs), QR-001/AC-01 and the visual parts of REQ-003, REQ-006 and D1 are not tested here; they are
measured in a browser against the built site and the record is kept (`evidence/ticket-237/`). They would
become tests only with a browser seam in the site's tests, which the owner did not choose.

Conclusion: no missing item after the table above. Fixtures: the site reads no external data in this ticket
(the reads are #238's), so no fixture can share the spec's assumptions about outside data; every check reads
the real build output.

### Case design

- Every case asserts an observable property of the shipped files: text, attributes, links, declared sizes,
  declarations. None reads an internal variable of a module.
- Implementation-coupling flags: no `vi.mock` or `vi.spyOn` planned; no call counts; no private state; no
  state set up by a path the build cannot produce. B8 compares the page with the dictionary, which reads as
  a tautology but is not one: the property is "every string reaches the page", and the dictionary is the
  only list of the strings; copy correctness is asserted against the spec in B2, B3, B5 and B6 and against
  the prototype in the evidence.
- B2's Chinese expectations take the dictionary's values, so they only show the right key is rendered. The
  Chinese copy's correctness is the prototype comparison.

Conclusion: no finding.

### False greens (judged from the design)

- Always-true assertions: B7 and B9 iterate over collections; each first asserts the collection is non-empty
  (B7 counts the images it expects: one hero, four steps, four frame shots, plus the icons). B8's "no Han
  except the toggle's name" is checked to fire by running it once with Han in the English page (planned mutation).
- Tautology: B10's expected values come from the app's stylesheet, not from the site's; U2's English labels
  from the spec, not from the dictionary. B8 noted above.
- Old paths: none — every asserted object is created by this ticket.
- After implementation: every case not red first on its own assertion gets a mutation that reaches the code
  under test, with an independent sign that it reached (the rebuilt page's text).

Conclusion: no finding.

### Resource reuse

| Expensive resource | Loaded or built how often | Provided by |
|---|---|---|
| The Astro build of the site (seconds; measured after it exists) | once per test process | vitest `globalSetup`, building into a new temporary directory and handing its path to the tests; the tests only read it, so no copy is needed |
| jsdom documents of the two pages | once per test file | `beforeAll` in the built-site check |

Prior art in this repository: `e2e/global-setup.ts` does its one-off preparation once per Playwright run. The
build is done in the setup rather than by a `build && test` script so that a bare `vitest run` can never
read a stale or missing `dist/` (the e2e lesson: a run against an old build looks like a change that did not
take). The build is the thing under test for the B cases, so they must use it; nothing re-runs it per case.

Conclusion: no finding.

## Post-implementation check

- Date: 2026-10-18
- Version: branch `feat/landing-page` on 26b9216, uncommitted working tree, after `pnpm verify` exited 0 and
  after the code review's comment corrections
- Scope: `site/src/download.test.ts` (5), `site/src/i18n/ui.test.ts` (2), `site/src/styles/palette.test.ts`
  (3), `site/test/built-site.test.ts` (25), with `site/test/build-site.ts`; the working-language rules; the
  browser measurement script, as a verification in its own right

### Coverage

The tests as written against the test design table, case by case:

| Case | As designed? |
|---|---|
| U1, U2 | Yes |
| U3 | Yes, as moved from B10 in the loop (recorded above) |
| B1–B9 | Yes. B3 expects the toggle's two labels as the prototype's literals, not the dictionary's constant, which would have been the same value read twice. B7 expects 11 images per page, B9 5 GitHub links per page |
| G1 | Yes (both directions, `evidence/ticket-237/check-lang-mutations.txt`) |
| G2 | Not run yet: it needs the pull request (CI runs on pull requests) |

The built-site check's file header states the gaps and their condition: REQ-004, QR-001 and the visual
parts of REQ-006 and D1 are measured in a browser (`evidence/ticket-237/`), not tested. Every one of them
was measured, 216 measurements passing.

Conclusion: the tests match the table; G2 waits for the pull request.

### Case design

No module mocks, spies, call counts or internal state; every case reads the built files, a pure function's
result or a stylesheet. One deviation from the TDD loop, stated plainly: the hero, features, install and
download markup landed in one step, so B2 and B4–B9 were written after their code; each was then shown
able to fail by mutation (below), instead of red-first.

Conclusion: no finding.

### False greens

- Red first, and red for the reason the case exists: U2 (the list view empty: the behaviour missing), B1
  (no `lang`), B3 (no header, navigation or sections), U3's site-only list (the new `--icon-shadow` token
  unnamed).
- Written after their code, each mutated so that it reached the code under test, with the mutated value in
  the failure as the sign it reached, the failing cases matching the mutation, and every file restored
  byte for byte (all site sources hashed before and after each batch:
  `evidence/ticket-237/mutations-site-tests.txt`): 29 mutations over three batches, M1–M29, each turning
  exactly the expected cases red; a control edit (M20) left all 35 green. They cover the list state's links,
  target, pill, version, line and English labels; the hero's shot, title and platform line; the steps'
  order, initial state and English titles; the install step text; declared sizes and ratios; `rel`; copy
  completeness; Han on the English page; the agent wording (both checks); the toggle's link and current
  marker; the navigation's targets and labels; the section order; the footer; the palette's value, dark
  declaration and stray token; a third page.
- The browser measurements, judged by the same question (when would each go red): the sideways-scroll
  check catches a 2000px element; the AC-07 check fails with session storage blocked
  (`ac07-control.txt`); "only one screenshot visible" is measured beside a mid-switch reading where two are
  partly visible; hover and non-hover colours, normal and reduced motion, are each measured in the same
  run; the screenshots in the held-space check are confirmed not yet loaded. Two measurement errors in its
  first run (the frame's sticky position taken from a sample past the section's end; a Node-side
  `location`) were errors of the measurement and were fixed there; the implementation was not changed to
  fit them.
- A scope trap met and caught during review: the first "lint without the site's packages" run renamed the
  folder inside the repository, which took it out of the ignore rules; its result was discarded and the
  experiment redone with the folder outside the repository.

Conclusion: no false green left.

### Resource reuse

One full `pnpm --dir site test` run, watched from outside: exactly one build directory appeared, and none
remained afterwards — the site is built once per test process, by the global setup, and cleaned up on
teardown. The two pages are parsed once, in the one file's `beforeAll`.

Conclusion: matches the table.
