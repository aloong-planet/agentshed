# Reviewer notes: prototype-list.html

## Question

How the project list — the Projects dimension's column beside the rail, with no project selected — reads and
behaves (projects list):

- the rows of the union of every side's registry, sorted by activity: whether a bare side count behind the
  Bot glyph reads, even on a screen full of 「1」, with the sides named in the count's hover layer;
- whether the two floating layers over the scrolling list — the count's hover layer and the side dropdown —
  escape its clipping and answer when their anchor goes stale;
- how search, the side dropdown and the stale toggle with its counter share the column and its filter row in
  Chinese and English;
- how the dimension looks before this launch's first snapshot — the column's skeleton, and the scanning hint
  centred in the detail area where the pick-a-project guidance otherwise sits — and whether the content
  replaces it without a jump; and the detail area's title-row hint while a restored list is being scanned
  and after a scan fails.

## Structure basis

- The rail with Projects current follows the app shell prototype.
- The project column follows the app's project list: search matching name or path, the side dropdown, the
  stale toggle with the stale counter shown only while stale projects are filtered out, the path as a row's
  tooltip, and the Bot glyph before the side count. It is the same column, with the same mock projects, as on
  the project detail prototypes; a project that has its own prototype (Transfer, removed-experiment-2025)
  opens it on click, and any other project is only selected.
- The startup skeleton — the column's real structure with greyed static labels and placeholder rows of the
  real rows' geometry, and the scanning hint centred in the detail area in place of the pick-a-project
  guidance — follows a direction the owner confirmed.
- Colours come from the prototypes' shared theme; the page defines no app colour of its own.

## Demo scaffolding

- The floating demo bar at the bottom of the window (marked `data-demo-harness`) — not part of the design; do
  not implement. Its group 「启动」 has 骨架 / 扫描中 / 完成 / 失败; in the product the state follows whether
  the renderer has received this launch's first snapshot and how the scan ended, and the app has no such
  control, as the bar's first note line says. The bar's copy is in Chinese only.
- The bar's second note line, the filter row's width readout (the dropdown trigger's width and the row's
  content width against its available width, measured after every redraw of the column) — not part of the
  design; do not implement. It is a measurement for the reviewer; nothing in the product shows it.
