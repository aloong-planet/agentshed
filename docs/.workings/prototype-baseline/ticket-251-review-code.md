# Code review — #251

Ticket: [#251](https://github.com/aloong-planet/agentshed/issues/251) · work directory `prototype-baseline` ·
reviewed 2026-10-18 on branch `chore/prototype-baseline`, commits 75187a7..03cbaa7 on 26b9216, plus the two
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

Refactor list (not executed; for the owner):

| Item | Reason | Reach | Suggestion |
|---|---|---|---|
| The session page's bar, four notes wide, covers the rail's Settings item inside the gallery at 1280px | The old bar covered it too; the bar can be dragged or collapsed | self | Not now |
| The skills preview's toast sits at the old bar's height and the taller dock bar covers its lower 16px | Positioned for the old one-row bar | self | Not now |
| Comments on the skills and plugins previews still compare their dark drawer values with the app | They belong to #250 item 4, which the owner settled on the app's values | self | With #250 |
