# Ticket #270 — task list

`check:ui` counts a shared asset named in a comment as the page's reference to it. Working record, not a requirement
authority: the requirement source is #270's body (no spec; no comments), in the work directory `prototype-baseline`,
where the prototype tickets without a spec keep their records; coverage units `270::*` in [checklist.md](checklist.md).
Branch `fix/check-ui-comment-refs`, in its own worktree, cut from `origin/main` at ef5e4cb (no commits ahead when cut).

## Facts found before deciding (2026-10-26)

- The shared-block check (`scripts/check-shared-ui.mjs`, `checkBlock`, part 1) searches each prototype page's raw source
  for four things: the block's declaration `data-shared-block="<id>"`, each of its assets (to require them on a page
  that declares it), the same assets on a page that does not (to flag a missing declaration), and its mount points
  (`id="…xaxis…"`). Other rules in the same file read the page with `stripComments` first (demo dimensions, the theme
  sheet, the rail and project column's ordering).
- Feedback loop (`plant.mjs`, kept as `evidence/ticket-270/plant.mjs`; run on ef5e4cb, `evidence/ticket-270/loop-before.txt`):
  - P1, the global search page without its `app-window.css` link (its header comment names the file): `check:ui`
    exits 0 and reports app-window "all 11 usage site(s) compliant" — the issue's symptom.
  - P2, the project list page without its `project-side.js` script (a script comment names the file): the shared
    block again reports compliant; the gate exits 1 only through the project column rule, whose messages say the
    script comes "before the column it draws" and that `manifest.js` and `icons.js` must come before it — misleading,
    since the script is gone. The issue's "goes unreported" is so for the shared-block check, not for the whole gate.
- Mentions inside comments today (a scan of the 17 prototype HTML files, raw count against the count after
  `stripComments`): block assets 19, on 11 pages (`app-window.css` on the eleven the issue lists, `project-side.js` on
  project-list and shell, and others); block declarations, mount-point ids, chart containers, the tab identity's
  script tags, icon links and titles: none. The other searches are exposed in the code, not yet in a page.
- The same defect elsewhere in the file (a raw-text search of a page counts a comment as markup):
  - the tab identity rule (`every prototype tab names its app`) searches the raw `<head>` for the `manifest.js` and
    `app-identity.js` script tags, an icon link and the title;
  - the chart container rule counts `class="…chart…"` and `data-shared-block=` in the raw page. It also compares the
    number of chart containers with the number of every declaration on the page, so a chart without its own
    declaration passes on any page with more declarations than charts: the Agents page's `skChart` container
    (`docs/prototypes/agents-page/prototype-agents.html:336`) has none and passes today. Its comment handling has no
    effect while that count stands.

## Decisions

| # | Decision | Answer and reason |
|---|---|---|
| D1 | Which searches stop reading comments | All four searches of the shared-block check (the issue's fix covers its asset references; the declaration and mount-point searches are the same check reading the same raw text) and the tab identity rule's `<head>` searches: one defect, in one file, each a few characters to change (the class-level rule of the code review). The chart container rule is left as it is: its comment handling is moot while it counts every declaration, and making it match each chart to its own declaration would turn the Agents page red on `skChart` — a separate defect and a change to a prototype page, reported to the owner with a recommendation |
| D3 | The post-implementation check's finding 2: a `//` comment after code on the same line still counted, since `stripComments` removes only whole-line `//` comments (the pages use the form on at least 37 lines; none names an asset today) | Fixed here: the owner's answer on 2026-10-26, "fix it too (recommended)" (in Chinese). Inside a page's inline `<script>`, every JS comment is removed by the TypeScript parser's comment ranges, so a `//` after code goes and a `//` inside a string, a template or a regular expression stays; HTML and CSS comments as before, each only where it stands (the incremental check's finding 3: one pass, HTML comments in the markup, CSS comments in style blocks). `stripComments` serves every rule that reads a page without comments, so all of them gain it |
| D2 | How the fix is held | A test of the gate's own command line on a copy of the prototypes (`scripts/check-shared-ui.test.mjs`), run by `pnpm check:ui` before the gate, as `check:lang` and `check:nul` run their tests; the issue's two mutations are cases of it |

## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Facts and the feedback loop | `evidence/ticket-270/loop-before.txt` | done |
| 2 | Records declared on #270 and its document sync checklist | `ticket-270-doc-sync.md`, the issue body | done: the issue body gained its records section on 2026-10-26 |
| 3 | Test design review | `ticket-270-review-tests.md`, Design review | done: no finding; an increment after the post-implementation check (rows A, B; new G, H) |
| 4 | Slice: the test red on the unfixed gate, then the fix, then green; the feedback loop again | the test's red run, the green run, `loop-after.txt` | done: six cases red on ef5e4cb's gate, all green after (`red-first.txt`, `green.txt`); the loop's two plants reported (`loop-after.txt`); targeted run `targeted.txt` |
| 5 | Code review | `ticket-270-review-code.md` | done: no finding; the class-level enumeration (decision D1); a second layer for D3's parser stripping |
| 6 | Full gateway | `evidence/ticket-270/gateway-*.txt` | d9b0208, e53f6d0, 020e082 and 8e9ddf4: each `VERIFY_EXIT=0` on its clean tree; the last, on the final code and test: 873 unit, 137 script, 107 site, `check:ui` 12 cases, 155 e2e, smoke OK |
| 7 | Independent post-implementation test check | `ticket-270-review-tests.md` | first round on ef5e4cb..30a2fee: findings 1 (A's and B's comments unpinned) and 2 (a `//` after code still counted), both handled (D3); incremental on 30a2fee..e53f6d0: finding 3 (the block and whole-line patterns still ran over scripts), handled; incremental on e53f6d0..020e082: finding 4 (the regular-expression shape undriven), handled by case K; incremental on 020e082..8e9ddf4: finding 5 (a record overstated what two evidence files hold), handled in the records only, so no further check is due |
| 8 | Source check, write-back (`checklist.md`; any statement of what `check:ui` runs), step 8 | `final-regression.md` | done: the source check below; the checklist's current verification; step 8, `final-regression.md` (new in this work directory) |
| 9 | PR; CI; stop for the owner | PR link | #313 opened; CI's runs on its head are the pull request's checks, linked in #270's comment after the merge |

Self-check of the findings' fix (2026-10-26), items 6 and 7: the new evidence can read otherwise — `red-first-2.txt`
(G red), `naive-h.txt` (H red), `pin-guard.txt` (the set-up assertion failing) each show the failing form, and
`green-2.txt` the passing one. Each keeps its commands and whole output. `red-first-2.txt` and `green-2.txt` record
their versions (HEAD and the hashes of the gate and the test); `naive-h.txt` and `pin-guard.txt` record none: they
write their scratch paths as placeholders, and show what differs from the committed files — the copy's change by
`diff` in `naive-h.txt`, the edited comment's `grep -c` in `pin-guard.txt` — so their versions follow from their
content and from the runs beside them (corrected after the third incremental check's finding 5). The records
follow: the design review's increment and Case design sentence, the test review's handling, the code review's second
layer, this list (D3), and the checklist's 270::1 and 270::R1 rows. No finding.

Self-check of finding 3's fix (2026-10-26), items 6 and 7: `red-first-3.txt` (I and J red) and `green-3.txt` (all
eleven green, the gate on main, the timing) each keep their commands and whole output, with the versions they ran on;
the first timing in `green-3.txt` ran under a high load and the interleaved one after it is the comparison used. The
records follow: the design review's increment (I, J) and its corrections for G, the test review's handling, the code
review's consistency note, D3's wording, and the checklist's 270::R1 row. No finding.

Self-check of finding 4's fix (2026-10-26), items 6 and 7: `green-4.txt` keeps its commands, its versions (HEAD
020e082, the gate unchanged from it, the test's hash) and its whole output. `scanner-k.txt` keeps its whole output and
its copy's change by `diff`, with no version line and its commands written with placeholders for the scratch paths;
its versions follow from that content (the gate's only difference is `stripJsComments`, the test said unchanged) and
from `green-4.txt`, written the same second (corrected after the third incremental check's finding 5). The records follow: the design
review's increment (K), the increment's Coverage sentences, the code review's self-check, the test review's handling,
this list, and the checklist's 270::R1 row. No finding.

## Source check before step 7 (2026-10-26, implementation 8e9ddf4, against #270's body)

| Line of the issue | Implementation | Conclusion |
|---|---|---|
| Acceptance: removing a page's real reference to any shared block's asset turns `pnpm check:ui` red, whether or not a comment on that page names the asset | the shared-block check reads the page through `stripComments`, which removes HTML comments, an inline script's JS comments (by the parser) and a style block's CSS comments; cases A, B, G | Met |
| Acceptance: the check stays green on main | `pnpm check:ui` exit 0 at 8e9ddf4 | Met |
| Suggested fix: strip comments before the shared-block check looks for asset references, as the rail rule does | done, for all four of its searches; `stripComments` itself improved (D3) | Met, wider (below) |
| Suggested proof: remove one page's `app-window.css` link and one page's `project-side.js` script, see red, restore | the feedback loop (`loop-before.txt`, `loop-after.txt`), and cases A and B | Met |

Scope beyond the issue's text: the tab identity rule's `<head>` searches and the shared-block check's other three
searches (D1, the class-level check of the same defect); `stripComments`' handling of a `//` after code and of what
must stay (D3, the owner's decision of 2026-10-26, and the test checks' findings 3 and 4 within it). Each is in the
checklist (270::1, 270::R1). Left out: the chart container rule's count (D1), reported to the owner. Deviations: none.
