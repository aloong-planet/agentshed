# Code review — ticket #237

Ticket: [#237 The landing page in Chinese and English](https://github.com/aloong-planet/agentshed/issues/237)
· feature `macos-release-line` · specs [landing-page](../../specs/landing-page.md),
[mac-distribution](../../specs/mac-distribution.md)

- Date: 2026-10-18
- Version: branch `feat/landing-page` on 26b9216, uncommitted working tree after `pnpm verify` exited 0;
  the comment corrections below were made after that run and are re-verified with the final gateway
- Scope: everything the ticket changes — `site/` (new: Astro project, components, scripts, stylesheet,
  dictionary, assets, tests, README), the root wiring (`package.json` `test:site` and `verify`,
  `.github/workflows/ci.yml`, `.gitignore`, `scripts/check-lang.mjs`), the landing prototype's hero icon
  (revised and confirmed 2026-10-18), and the landing spec's REQ-004/AC-04

## Underlying premises

Each fact the change rests on, and how it was established:

| Premise | How established |
|---|---|
| Astro 7's `build({ root, outDir })` writes the whole site into a directory outside `site/` | The built-site check runs on it; the output lists exactly the two pages, the CSS, the icons and the shots |
| The build minifies colours (`rgba()` to hex), so a palette check cannot compare the built CSS with the app's source | Read in the served CSS: `--icon-shadow:0 18px 25px #37352f2e` |
| Root `pnpm lint` needs the site's packages installed (hence the CI step before lint) | With `site/node_modules` moved out of the repository, linting `site/` fails with 121 type-aware errors; with it in place, 0. A first attempt renamed the folder inside the repository, which took it out of the ignore rules and linted vendored code; that run was discarded |
| The new `.astro/` ignore rule ignores only Astro's generated directory | `git check-ignore -v`: `site/.astro/types.d.ts` ignored by `.gitignore:21`; `site/src/components/Hero.astro` not ignored |
| A key missing from one language fails `astro check` (claimed in `ui.ts` and `ui.test.ts`) | Removing the English `footer.copyright` gave TS2741 and exit 1; file restored and compared |
| The lint reads the site's files | `eslint --format json site`: 12 files, 0 problems (`.astro` files are not among them: no Astro parser is configured; `astro check` type-checks them) |
| The working-language gate reads the site | Before its rules existed it reported 36 lines in `site/`; with them, a Chinese comment in the dictionary and Chinese in a component each go red |
| Causal comments in the new code | Every comment in `site/` enumerated (141 comment lines) and each causal one checked. Four were wrong or unproven and are rewritten: the palette header credited "the built-site check" (it is a unit test); the image-size comment and the phones comment told the prototype's history as the site's (now the site's reason, and "measured on the prototype"); the script-order comment claimed restoring needs the features section first (not shown; now it only states the order); the focus-ring comment claimed an outside ring would lie over the next step (the steps are far apart; now it states the rule). The CI comment's reason was confirmed by the lint experiment above and made exact |

Conclusion: four comment findings, fixed; no other premise failed.

## Runnability

- The current step enters as served (step 0), by scrolling (nearest to the frame's middle), by a click or
  Enter (scroll, then the scroll decides), by a resize, and by a restore after a language switch (set, then
  recomputed). Every path is measured (`evidence/ticket-237/README.md`: REQ-004, Failures C1 and C2).
  Below 760px the computation stops and the step keeps its class with no visual effect; widening
  recomputes it.
- The language note: written on a plain primary click only (a modified click opening another tab writes
  nothing), read and removed on the next load, applied only by the page it names and only within 10
  seconds. Storage blocked or malformed: the read throws inside `try` and the page opens at its top, as a
  plain link would (measured: `ac07-control.txt`). Fault escape surface: self only; the link always
  switches.
- The restore runs before the screenshots load; it is right only because every image's space is held,
  which is measured (REQ-005/AC-03, Failure C4).
- The build in the test setup: a failed build fails the run; its temporary directory is removed on
  teardown (a failed build leaves one behind: self only).
- Against the confirmed prototype, side by side in the list state: identical section heights at 1280 and
  400px to 0.01px (`evidence/ticket-237/prototype-geometry.txt`), and identical click offsets at four window
  sizes (`ac04-prototype-vs-site.txt`).
- Found by measurement, decided by the owner: the first and last feature steps cannot be scrolled level
  with the frame's middle, because the frame stops at the section's start and end (41.3px at 900px tall;
  the prototype the same). AC-04 is amended to say so (owner, 2026-10-18).
- Found by rendering, decided by the owner: the real icon's transparent margin showed as a light tile under
  the prototype's box shadow. The prototype was revised to a shadow on the icon's outline and confirmed
  (2026-10-18), then implemented.

Conclusion: no defect left; the two behaviour findings are settled by the owner's decisions above.

## Security

The page reads nothing at run time in this ticket (the reads are #238's). No HTML is built from strings: the
templates interpolate the dictionary as text (no `set:html`), and the scripts use no `innerHTML` or similar;
they only toggle classes, read geometry and scroll (search of `site/src`: no match).
Session storage holds the page's own note, validated by use (an unknown anchor or another page's note is
ignored). Every GitHub link opens with `target="_blank"` and `rel="noopener"` (built-site check). No
credential or token anywhere in the site or the CI change. The screenshots show the owner's real data by
the owner's decision (Failure E2).

Conclusion: no finding.

## Consistency

- Regression: the change adds to the gateway and CI, and touches no app source. `pnpm verify` exit 0 (830
  unit tests, the asset's tests, the site's 35, the four gates, 135 e2e, smoke). The required CI check
  `typecheck + unit tests + shared-piece consistency` keeps its name and gains the site's steps, so the
  ruleset needs no change.
- Conventions: English comments and copy outside the dictionary (ADR-0017); icons as inline SVG from one
  module (ADR-0018's rule, in the site's own module); light and dark each declared (CONTEXT invariant);
  the site's dictionary is its own, outside ADR-0013 (landing-page::CON-002); class names: 39 in use, each
  defined in the stylesheet and each defined one used, no inline styles.
- Smells checked against the baseline list, on the new code:
  - Speculative generality: `DownloadView` carries `newTab` and a list of buttons though the list state
    has one new-tab button. Answered: REQ-002/AC-05's rule (GitHub in a new tab, the R2 download in place)
    belongs to the view, and #238's states render through the same components. Kept.
  - Duplicated code: the hero and the download row render a download link the same way (see the
    refactoring list); `leaves()` appears in two test files (kept: six lines, and each test file stays
    self-contained).
  - No other baseline smell found.

Conclusion: no regression; one refactoring item for the owner.

## Refactoring list (decided by the owner on 2026-10-18: as suggested)

| Item | Reason | Impact | Handling |
|---|---|---|---|
| One component for a download link, used by the hero and the download row | Duplicated code (the `newTab` → `target`/`rel` mapping in two places) | Self only: two places today | Left to #238, which adds the other states' buttons and sees the whole set; handed over in [a comment on #238](https://github.com/aloong-planet/agentshed/issues/238#issuecomment-6251219854) |

## Findings outside this ticket's change (homes decided by the owner on 2026-10-18: as suggested)

| Finding | Impact | Home |
|---|---|---|
| The landing prototype's dark `--warn-bg`/`--warn-fg` (`#3a2516`/`#f6b48a`) differ from the app's purple dark values (`#3c2417`/`#f0a884`); the prototype says it uses the app's palette | The test state's pill and note (#238). The site's palette test will hold the site to the app's values when #238 adds the tokens, so the prototype would disagree with the page | #238: a Pending row in [ticket-238-doc-sync.md](ticket-238-doc-sync.md) (before its UI admission check), and [a comment on #238](https://github.com/aloong-planet/agentshed/issues/238#issuecomment-6251219854) |
| CI's checks job does not run `pnpm test:scripts`, the packaging asset's tests, which `pnpm verify` runs | mac-distribution::CON-001 asks for them in the gateway, which holds; CI just does not repeat them, so a change that breaks them passes CI | #234: its branch `feat/release-workflow` (pull request not opened yet) already adds `pnpm test:scripts` to the checks job, as that session confirmed; a separate change would only duplicate it, so none was made |
| `capabilities.toml` declares the app's dictionary and palette (`i18n.source`, `theming.source`) and nothing for the site's | A skill locating the "i18n dictionary" anchor from the declaration would point at the app's for site work | Fixed in this change. The registry already allows `source` to be an array of paths, so no skill change is needed (the earlier suggestion to ask skillshed rested on not having read that): `i18n.source` adds `site/src/i18n/`, `theming.source` adds `site/src/styles/global.css`, and both add `pnpm test:site` to `enforced-by` (read back with a TOML parser; every path exists) |
| `.astro` files are outside the lint | Their TypeScript is type-checked by `astro check`; lint rules do not reach them | No action: stated in `site/README.md`; `astro check` covers their TypeScript |
