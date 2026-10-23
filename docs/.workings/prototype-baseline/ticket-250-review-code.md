# Code review — #250

Ticket: [#250](https://github.com/aloong-planet/agentshed/issues/250) · work directory `prototype-baseline` ·
reviewed 2026-10-23 on branch `docs/prototype-fixes-250-226`, commit dbd90fc on 1349d76, plus the review fixes
below (uncommitted at review time, committed with this record). Scope: #250's changes in that commit — the
install page's picker, the stale-note page's title tag, the Agents page's mask and model-bar rule, the session
page's turn drawing and orphan count, the detail page's header and model-bar rule, the list areas of the Skills
and Plugins previews and the session page. #226's changes in the same commit are reviewed in
[ticket-226-review-code.md](ticket-226-review-code.md).

## Underlying premises

No finding. Premises the change rests on, each measured or read at the source:
- Items 1–3 take the values the owner's comment on #250 settles; the prototypes do not compare themselves
  with the app, so the app's current values are not a premise. Computed styles after the change: picker
  `0px 6px 22px 0px`, title tag 9.5px / `0 4px` / 3px / 0.8, mask `rgba(0, 0, 0, 0.35)`, alone and in the
  gallery.
- Item 5: a redraw rebuilds every turn box (`render()` rewrites the list's markup). Reproduced on the base page
  with a probe: a failed turn showed its error, then its full content after a sort, collapse all + expand all,
  and a language change made in another tab through the gallery; a fetch in progress showed the content at
  once when redrawn.
- Item 8: model rows take their class only from the model mocks (`anthropic`, `openai`, `xai`), never from the
  side lists (`c`, `x`, `g`), which are written only into badges. So `.m.x` matched nothing; the model bars'
  computed colours are identical before and after on both pages.
- The new comments state the mechanism the probe measured: the box a fetch started in is replaced by a
  redraw, so the fetch writes into the box as it is when it ends.

## Runnability

No finding.
- Paths into and out of a turn's fetch state (`fetchingTurns`): set on expanding a turn not yet fetched
  (fetching, or rebuilding when the index is stale); removed when the fetch succeeds (the turn joins `loaded`);
  set to failed when it fails; cleared with everything else when another session is chosen. Expanding a
  failed turn again starts a new fetch, so retry works. Collapsing keeps the state; it is drawn only while
  the turn is open.
- A fetch that ends after the session was switched writes nothing (the key no longer matches the session or
  the turn is no longer open). Its bookkeeping lands in `loaded`, as before the change.
- Probe after the fix, 16 checks, all pass: the error survives each redraw; retry after the failure shows the
  content; a fetched turn keeps its content; switching session clears expansions; a redraw during each of the
  three fetch kinds shows the in-progress line and the outcome then lands in the redrawn box. On the base page
  7 of them fail (the three redraws, and four of the six in-flight checks).
- Error paths: the failed state touches only its own turn (self).

## Security

No finding: no input, file or network surface; the strings written into the turn box are the page's own copy.

## Consistency

- Regression check: a turn fetched with the index ready behaves as before (content at once on re-expanding;
  a stale index rebuilds only on the first fetch).
- Smell judged: the three fetch branches repeat "set the state, draw the body, settle after a delay". Exempt:
  they mirror the page's three demo states, each with its own comment and delay; a helper would hide which
  state each branch plays.
- Class-level checks, enumerated:
  - A header's demo note that disagrees with its bar (item 7's class): every page with a demo bar (nine)
    checked against its bar's groups. Two more hit and fixed here: the Agents page said the bar carries three
    groups where it carries four, and the global-search page left out its search-request group. The other
    seven list every group (the landing page names its two groups as one four-way choice split in two).
  - A hand-written count that disagrees with its list (item 6's class): the three mock sessions with a
    question count, all now equal to their lists (42, 18, 26).
  - A model-bar rule keyed on a class no row carries (item 8's class): the only `.m.<class>` rules left are
    the shared trend chart's four provider classes, each produced by the shared provider table.
  - A delayed write into an element a redraw can replace (item 5's class): every `setTimeout` in the
    prototypes enumerated; the others hide toasts or feedback elements that are never redrawn, or redraw
    from state.
  - Bottom padding kept for a demo bar (item 9's class): every page's list area — all other pages pad 14–16px.

- Judged against the app (a fact for the owner's decision, not a comparison the prototypes depend on): the
  app draws the session page and the detail and Agents tabs inside one pane body padded `16px 22px`, and four of
  the other prototype pages pad 16px at the top, while the Skills and Plugins previews pad 18px and the session
  page 14px. Item 9 as first done made those three 18 / 18 / 14px at both ends. Put to the owner, who settled
  16px at top and bottom on all three (the sides unchanged).
- Judged, no change: in the gallery the global-search page logs a console message, "Blocked autofocusing on a
  <input> element in a cross-origin subframe". It comes from the search box's `autofocus` inside the gallery's
  `file://` frame, which Chrome treats as cross-origin; the page has it on the base commit too, opened alone it
  focuses, and it is not a script error. This round touched only that page's header comment.

Review fixes, executed: the two header notes above, and item 9's values.

Refactor list: none for #250.
