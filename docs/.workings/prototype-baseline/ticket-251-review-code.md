# Code review — #251

Ticket: [#251](https://github.com/aloong-planet/agentshed/issues/251) · work directory `prototype-baseline` ·
reviewed 2026-10-18 on branch `chore/prototype-baseline`, commits 6a56beb..2027ffb on 26b9216, plus the two
fixes below (uncommitted at review time, committed with this record). Scope: every change of the branch —
`scripts/check-shared-ui.mjs`, `package.json` (`check:ui`), the deleted generators, the shared prototype
pieces, the eleven converted pages, ADR-0033. The landing page is not in this round (it waits for the
landing-page PR).

## Underlying premises

No finding. Premises the change rests on, each measured rather than read:
- The page's navigation helper follows every `data-goto` now that the rail and the project column do not
  navigate on their own: 45 entries clicked opened alone, every one landed on its target; none points at
  its own page.
- The dock script refits the bar when the startup piece replaces its placeholder after load: the dock
  observes mutations; the bars render at their content width in the screenshots.
- Fixed overlays moved inside the app window box (`overflow:hidden`) are not clipped: the settings language
  layer, the toast, the Agents drawer and the detail reader each hit-test their own centre; the update
  tooltip ignores the pointer, so instead its ancestors were checked for a fixed containing block (none)
  and its rect lies inside the viewport.
- The settled xAI colour equals the app's: `--p-xai` is #ad98d0 / #c9b3ec in both `_shared/theme.css` and
  the app's theme.
- Every copy entry moved to `_shared/copy.js` had the same value on each page it left (scripted comparison
  by the page agents, both languages; the four differing entries were unified by the owner's decision).
- The new causal comments (the app window box and the candidates page, the settings page's alignment)
  restate rules of the prototype skill whose mechanism was measured in its test runs.

## Runnability

One bug, fixed.
- `_shared/app-rail.js` relabelled every `.ri` in the rail on a language change. When its items became
  buttons the selector was widened from `a.ri`, so it also rewrote the title and accessible name of
  anything a page draws into the rail slot (the settings prototype's update button) to "undefined" — a
  same-layer escape, hidden today only because the settings page redraws the slot right after. Reproduced
  with a probe that puts a `.ri` into the project list's slot and changes the language from another tab:
  "undefined" before the fix, the slot's own label after. Now `.ri[data-rail]`. Same class: no other
  selector in the shared pieces or the pages addresses the rail's items by element (`a.ri`, `.rail a`,
  `data-rail-here`: no hit).
- The settings page's state paths, all exercised by the item 1 script: untouched load; reload with explicit
  and with Follow-system preferences; a gallery change while the page is closed and while it is open; the
  page's own explicit choice and its own Follow-system choice; reopening.
- Context groups of the demo bars (Agents: Codex memory on its tab, startup alone in the skeleton; detail:
  sessions group on its tab): shown and hidden with their notes, checked by click-through on every switch.
- No error or degradation path is added.

## Security

No finding: no new input, file or network surface. The navigation helper's `postMessage(..., '*')` is the
skill's unchanged asset; `check-shared-ui.mjs` only reads repository files.

## Consistency

No regression found beyond one accepted behaviour change, for the delivery notes: rail items are buttons
now, so a modified click no longer opens a prototype in a new tab.

Smells, judged: the navigation helper on ten pages is the skill's verbatim asset (one source, copied by
rule); the startup sentence in four pages' demo notes is scaffolding text written per page, not interface
copy.

Refactor list. The owner decided on 2026-10-18 to execute all three in this PR; the follow-up review below
covers the changes.

| Item | Reason | Reach | Outcome |
|---|---|---|---|
| A demo bar whose groups fit on one row grows to the viewport's width and covers the rail's bottom items at its default place: the session page (four groups on one row) at 1280px alone and in the gallery, the settings page at 1440px alone (rail Update and Settings) | The dock sized the bar to its widest row with only the viewport as the limit | self | Executed: the prototype skill's dock now wraps the rows at three quarters of the viewport (never narrower than the widest group); the project copy is re-copied from the master |
| Toasts placed to clear a demo bar: the settings page at 100px, the skills preview at 86px. Corrected on re-measurement: the skills preview has had no bar since 2027ffb, so nothing covered its toast; the earlier entry ("the dock bar covers its lower 16px") described the page before that commit | The offsets served the bar, not the design; the prototypes' existing toast sits at 18px (the install page) | self | Executed: both at 18px. On the settings page the toast now lies over the bar's last note line (z-index above the bar), never over a control |
| Comments on the skills and plugins previews present their dark drawer values as a correction of the app's | #250 item 4, which the owner settled on the light values in both modes | self | Executed: dark values equal light (shadow 0.12, mask 0.35), still declared in the dark block; comments state the same alpha in both modes |

## Follow-up review — the executed refactor list

Reviewed 2026-10-18 on b853c74 plus the follow-up, before it was committed as 7b52c8b, 70159e6 and 9ac06b6.
Scope: `docs/prototypes/demo-harness.js` (and
its master in the prototype skill, with the skill's file table), the toast rules of the settings page and the
skills preview, the drawer tokens and their comments on the skills and plugins previews.

### Underlying premises

No finding. Measured rather than read:
- The covering comes from the bar's width, not its position: before the change the session bar was 1206px
  wide at 1280px and 1017px in the gallery, the settings bar 1419px at 1440px; every other bar is 439–593px
  and covers nothing.
- Both toast offsets were set for a bar: the settings rule said so; the skills preview's 86px came with the
  page and its bottom bar at 14px in the same commit.
- The new comments state measured facts: the dock comment's corner claim (no rail item covered after the
  change, four viewport and context combinations), the previews' "same alpha in both modes" (token probe).

### Runnability

No finding.
- The cap never makes the bar narrower than its widest group: a synthetic bar with one 637px group gives a
  655px bar at 800px (three quarters would be 600px); at 500px and 640px the group overflows exactly as with
  the old script (a group wider than the viewport is the page's to split, by the markup convention).
- Paths into the width computation: load, every content mutation (context groups shown or hidden), resize,
  collapse and expand. Each calls the same fit, so the cap applies on all of them; a dragged bar keeps the
  capped width.
- No error or degradation path added.

### Security

No finding: no input, file or network surface.

### Consistency

- Pages whose bars were already narrower than the cap are unchanged to the pixel (bar rectangles identical
  before and after; 48 snapshots identical but for 2 antialiasing pixels).
- Smell judged: the new item scan repeats the row scan's skip condition (hidden, absolute, fixed). Exempt:
  two scans in one function scope that measure different things; a shared predicate would add a name for
  one line.
- Class-level checks, enumerated: toasts — all three in the prototypes (install 18px, skills preview, settings),
  two hit and fixed; covered rail items — every page with a bar, alone and in the gallery, at 1280 and 1440.
- New finding, not fixed (reported to the owner): the end padding of the scroll areas that had a bar when
  they were drawn — skills preview and plugins preview 100px (their bars are gone), session page 90px (still
  has one) — against 14–16px on the other pages. Each came with its page and bar in the same commit, but
  no comment says it serves the bar, so it is not proven a harness offset. Reach: blank space at the end of
  three lists; nothing hidden. Disposition: added to #250 (small prototype differences) as item 9 on
  2026-10-19, by the owner's decision, rather than changed
  here.

## Follow-up review — the landing page

Reviewed 2026-10-19 on 6341072 (the branch rebased onto 1b58a84, which merged the landing-page PR) plus the
landing page's conversion, committed as ffbaea0. Scope: `landing-page/prototype-landing.html` only.

### Underlying premises

No finding. Measured or read at the source:
- The removed light/dark switch simulated the visitor's system: the page's own header named its source as the
  visitor's `prefers-color-scheme`. #251's "Done when" and harness clause 5 forbid such a switch, so it goes
  rather than becoming a row of buttons; the gallery's unified settings stand in for the system.
- Ten of the twelve tokens the page hand-copied equal `_shared/theme.css` in both modes (token probe);
  `--warn-bg` and `--warn-fg` differ in dark. The page's own comment called them the shared purple palette.
- The `body` rule: the page draws a web page with no app window, so its body is the page's root.

### Runnability

No finding.
- First paint: the dimension script sets the mode attribute in the head, before the body renders; a stored dark
  value opens dark.
- Paths into the mode: stored value at load, a change in another tab (storage event), a change in the gallery
  around the page; each verified.
- The four download states, split over two groups, stay one choice: each option pressed alone, and the hero
  and download links follow it.
- The bar at 400, 760 and 1040px: every group inside the bar, the bar inside the viewport.

### Security

No finding: the page's links are unchanged.

### Consistency

- Visible change, for the owner: in dark, the test-version pill and note take the shared warning colours.
  Every other state is pixel-equal to the committed page outside the review note.
- Class-level check: hand-copied shared tokens. `check:ui` covers only pages that follow the mode or palette;
  all twelve UI pages now follow it (eleven declare it, the settings page sets it), link the shared theme and
  define none of the core tokens themselves (a search that finds six such definitions on the committed landing
  page finds none now).
- Judged, no change: the page's own zh/EN switch stays — it is the web page's design, not the app's language
  setting, and the page does not follow the gallery's language. The review note's 90px bottom margin clears the
  bar but belongs to a review note, not to the design.
