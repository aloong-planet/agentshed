# Reviewer notes: prototype-app-shell.html

## Question

What the app shell looks like (the app shell: the navigation rail and the frame every screen sits in): the
icon rail beside the two columns of the Projects dimension — the project column, and the main area under its
title bar — with the column in its startup skeleton before this launch's first snapshot (no usable saved list
and the first scan unfinished), and in its empty list once a snapshot holds no project.

## Structure basis

- The rail follows the app's navigation rail: Agents, Projects and Search at the top, Settings in the bottom
  group, with Projects current. Agents, Search and Settings open their own prototypes; Projects lands on this
  page, so clicking it does nothing.
- The project column is the one on the project list prototype: its startup skeleton, and its list showing
  「无匹配项目」 when a scan found no project.
- Colours come from the prototypes' shared theme; the page defines no app colour of its own.

## Demo scaffolding

- The floating demo bar at the bottom of the window (marked `data-demo-harness`) — not part of the design; do
  not implement. Its group 「扫描」 has 扫描态 / 就绪空态; in the product 扫描态 is the window before this
  launch's first snapshot (no usable saved list and the first scan unfinished), and 就绪空态 is a snapshot that
  holds no project. The app has no such control, as the bar's note line says.
- The text in the centre of the main area — 「扫描完成前不显示空列表,避免"没有项目"的误导」 in 扫描态, and
  「就绪空态:引导页占位」 with 「列表有数据时,这里显示「选择一个项目」」 in 就绪空态 — annotations for the
  reviewer, not part of the design; do not implement. They are in Chinese only, as the bar is.

## Invalidated conclusions

- The main area in 扫描态 — the scanning pill at the right of the title bar (a blinking dot and
  「正在扫描 Claude Code / Codex…」, a copy that also names only two of the sides) and the centre text — is not
  how the app shows the window before this launch's first snapshot. What holds instead: the 骨架 option of the agents page prototype and of
  the project list prototype, and the agents overview spec (A4–A4e) and the projects list spec (A10–A13). The
  rail, the two columns and the project column's skeleton are unaffected.
