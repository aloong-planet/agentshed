# Code review — #226

Ticket: [#226](https://github.com/aloong-planet/agentshed/issues/226) · work directory `prototype-baseline` ·
reviewed 2026-10-23 on branch `docs/prototype-fixes-250-226`, commit dbd90fc on 1349d76, plus the change the
owner approved from this review (uncommitted at review time, committed with this record). Scope: the three
logic pages (`project-list/visibility`, `skill-install/install-flow`, `token-stats/scan-cache`), their
`index.html` and, from this review, their `logic.js`. #250's changes in the same commit are reviewed in
[ticket-250-review-code.md](ticket-250-review-code.md).

## Underlying premises

No finding. Measured or read at the source:
- The template's current English wording was read from the prototype skill's `logic-page-template.html` (the
  canonical copy); each rewritten string uses its wording, or, where a page had diverged from it, a
  translation of the page's own text in the template's terms.
- The scan-cache hint says the pipeline diagram takes no part in the highlighting. It holds: highlighting
  matches node text against the status names (idle, scanning, writing, quit), and no pipeline node carries
  one of them.
- After the change every Chinese line left in the three pages is prototype content: the page title (the
  `<title>` and the heading), the question, the state field labels, the entry and event group labels and
  button labels, and two page-specific field renderings (install-flow's operation field, scan-cache's
  cold/warm entry note). The `<title>` keeps the Chinese "Prototype — " prefix every prototype page uses.

## Runnability

No finding. Each page driven alone and in the gallery: diagrams render as SVG (1, 1, 2), the empty-state
receipt, an entry button, the current state highlighted, an unreachable event's tooltip, stress mode lifting
it with the forced prefix, forcing it (the rejection receipt in red), a legal event's receipt, reset, and the
reset-view button restoring the fit after a pan; no page or console error.

## Security

No finding: text only.

## Consistency

- Class-level check: a filled-in copy of a prototype skill template that still carries the template's chrome
  in Chinese. The copies in the project, enumerated: the three logic pages (from `logic-page-template.html`),
  their three `logic.js` (from `logic-template.js`), their `model.mmd.js` (written by `sync-mmd.mjs`), and the
  gallery and demo scripts (byte-equal to their masters since #251). One more hit: each `logic.js` wrote the
  rejection as "<event> ignored: <why>" with the Chinese word for "ignored", stripped that prefix with a regex
  of the same word, and rejected an unknown event in Chinese. The rejection shows in the receipt bar and, with
  the prefix stripped, in the tooltips — the same bar whose other receipts this ticket made English. The
  `model.mmd.js` files carry only the diagrams' Chinese titles, which are content.
- The owner chose on 2026-10-23 to fix it in this PR: the prefix and its regex take the template's
  `ignored: `, the unknown event takes `unknown event`. The reasons each page wrote for itself stay Chinese
  (content). Checked by the driving probe: tooltips show the reason without the prefix; a forced illegal event
  reads "⚠ <event> ignored: <reason>". A mutation of one page's regex alone (prefix and regex no longer
  paired), run on a copy of `docs/prototypes`, turns that page's tooltip check red alone and in the gallery,
  and no other page's. The copy lacked `build/icon.png`, which the pages load from outside the directory, so
  every page's console check also failed on the missing icon; the runs on the full tree do not show it.
