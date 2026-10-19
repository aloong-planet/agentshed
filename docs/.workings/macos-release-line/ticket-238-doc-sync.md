# Document sync checklist — #238

Ticket: [#238 The landing page offers the release that exists](https://github.com/aloong-planet/agentshed/issues/238) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write back where the implementation departed from or added to the spec, in the same change | [landing-page spec](../../specs/landing-page.md) | Done: Implementation Decisions (the pointer read, the GitHub read and what counts as a release, both reads' time limit and no preflight, applying a state in place and keeping the visitor's place, the warning pair and the GitHub button in the palette); Failure A7 (what the visitor sees does not move when the hero's download block is above their view); Testing Decisions (the reads and the applied state, beside the owner's two seams); Further Notes (the owner's confirmation of the prototype's dark warning colours, 2026-10-19) |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done: the #238 row (2026-10-19), from the gateway on the final tree, the mutation runs, the browser measurement and the real-network check; the live parts stay with #239 there |
| Record the merge and the pull request's CI run in the checklist's #238 row, once the change is on main | [checklist](checklist.md) | Waiting: the merge of this ticket's pull request (#262), by the owner's confirmation; then the session that delivered #238 records the merge commit and the pull request's CI runs (39195787984, 39195787916 on 8d43f9b, both green) in a records change, as #237's were (#261) |
| Before the UI admission check for the test state: set the landing prototype's dark `--warn-bg`/`--warn-fg` (`#3a2516`/`#f6b48a`) to the app's purple dark values (`#3c2417`/`#f0a884`). The page must use the app's palette (landing-page::REQ-006), and the site's palette test holds every shared token to the app's value, so the prototype would otherwise disagree with the page. Found in #237's code review; the owner chose to fix it here (2026-10-18) | [landing prototype](../../prototypes/landing-page/prototype-landing.html) | Done: the two values changed, the owner confirmed the revised prototype on 2026-10-19 (recorded in the spec's Further Notes); the page's pill and note measured in exactly those colours, light and dark |
| The site's README: where the reads, the state and the download script live, and the tests that apply the states | [site README](../../../site/README.md) | Done: `releases.ts`, `download.ts` (the four states), the download script and its applying module, the two new test files and the fixtures (found in the scope re-check below) |
| mac-distribution Failure C1 said visitors are served from GitHub while a formal release's mirroring has failed; with a previous pointer the page offers that release from R2 | [mac-distribution spec](../../specs/mac-distribution.md) | Done: C1 now says the page offers the previous release from R2, or, for the first formal release, the new one from GitHub (landing-page Failure A3) (found in the scope re-check below) |
| Tick the issue's acceptance items this ticket's evidence supports, once the change is on main | [#238](https://github.com/aloong-planet/agentshed/issues/238) | Waiting: the merge of this ticket's pull request (#262), by the owner's confirmation; then the session that delivered #238 ticks the three process items and the product items, and leaves REQ-001/AC-05's live evidence to #239 with that note |

Pre-delivery scope re-check (2026-10-19, on 690ad2d with the uncommitted change):

- **The facts this ticket changed**: the page reads the R2 pointer and, when it offers nothing, GitHub's releases,
  and shows one of four download states in place of the list it is served with; how a release counts (published,
  the tag's form, the DMG uploaded); the state copy in both languages; the warning pair and the GitHub button in
  the stylesheet; the prototype's dark warning colours; keeping the visitor's place when a state lands.
- **The search**: the whole repository with `rg --hidden` (excluded: `node_modules`, `.git`, `site/dist`, and the
  working records, which were read as rows of this checklist and the coverage checklist), for
  "agentshed.aloongplanet.com", "landing page", "landing-page", "latest.json" and "list state": 45 files; every
  file outside `site/` and this ticket's own new files read at its hits. The six READMEs, which use six languages,
  searched in each for a website (\u843d\u5730\u9875/\u5b98\u7f51/\u7f51\u7ad9/\u4e3b\u9875/\u4e0b\u8f7d\u9875; \u30e9\u30f3\u30c7\u30a3\u30f3\u30b0/\u30a6\u30a7\u30d6\u30b5\u30a4\u30c8/\u30b5\u30a4\u30c8/\u30dbー\u30e0\u30daー\u30b8; página de/sitio
  web/web oficial; page d'accueil/site web/site officiel; \u0441\u0430\u0439\u0442/\u043b\u0435\u043d\u0434\u0438\u043d\u0433/\u0441\u0442\u0440\u0430\u043d\u0438\u0446; website/landing/homepage/web page):
  none; the control word "Agentshed" found in all six.
- **Found beyond the planned rows**: the site README's map of the source and its test section (row added, done);
  mac-distribution's Failure C1 (row added, done).
- **The remaining hits hold**: ADR-0031's landing decision (formal from R2, otherwise the GitHub pre-release
  labelled a test version: the spec's REQ-001 refines it with two fallbacks, it does not contradict it); the R2
  runbook's CORS, pointer and partial-mirror statements; mac-distribution's REQ-004/AC-03 and pointer shape; the
  mirror script's statement of the pointer's contract; the specs index row; the ADR index row; the prototype
  registry's "four download states"; the signing runbook's and electron-builder's minimum-macOS lines.
- **Pending notes in scope**: the landing-page spec's (the page live), mac-distribution's two (a notarized
  release downloadable; the ZIP), app-update's (two releases): none falls due with this ticket.

Step 8 (`/features-catalog`) skipped by its two questions:

- **No sentence in `docs/features/` becomes untrue, and none is missing.** No feature statement describes the
  website, and the landing page's feature entry is written when the page goes live (the spec header's Pending
  note, and the specs index row).
- **The search**: the catalogue's languages counted first (15 files: 43062 Latin and 7 Han characters, the Han
  in `i18n.md` only), then `rg -n -i "landing|website|web site|home ?page|download page|agentshed\.aloongplanet|
  dl\.agentshed|latest\.json|test version|pre-release|prerelease|beta" docs/features` → the app's default page
  ("the default landing page": Agents overview) and the app's update channel ("a test version (pre-release)"),
  neither about the website; `rg -n "\u843d\u5730\u9875|\u5b98\u7f51|\u4e3b\u9875|\u4e0b\u8f7d\u9875|\u6d4b\u8bd5\u7248|\u9884\u53d1\u5e03|\u6b63\u5f0f\u7248" docs/features` → no output (exit 1).
- **Its control**: "update" in six of those files, 25 times in `app-update.md`. So the search did read them.
