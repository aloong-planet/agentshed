# #272 — the exits row against the session page prototype

Taken 2026-10-19 on the branch's working tree (from 5dfbf0d, the exits implemented, uncommitted), built.
Script: [measure.mjs](measure.mjs); raw output: [measure-output.json](measure-output.json).

How: the app opened on a copy of this machine's real userData files and its real agent data, a session opened
from the first hit for the keyword "e"; the session page prototype opened in this Mac's Chrome with its demo
bar's origin switched to global search. For the row and each of its two exits, the computed display, gap, font
size, colour, background, the four paddings, radius, white-space, bottom margin and alignment, at rest, plus the
colour and background hovered, and the icon's size and path data — in light and in dark. The app is switched to
dark through the emulated colour scheme, the prototype through its own setting's attribute (it does not follow
the system).

Result: 94 values compared, 0 differ. Light: the exits are text-2 grey (rgb(120, 119, 116)), the hover the
accent on accent-soft (rgb(138, 103, 171) on rgb(240, 235, 246)); dark: rgb(155, 154, 151), hover rgb(160, 132,
199) on rgb(44, 39, 51). Padding 2px 7px 2px 4px, gap 5px, radius 6px, 12px type; the row's gap 4px and its
bottom margin 7px. The back exit draws the left chevron, the way into the project the right one, both 12px.

A first run compared the prototype's dark against the app's and showed the prototype unchanged from its light
values: the prototype had been switched through the emulated colour scheme, which it does not follow. The
script now sets the prototype's own attribute; the app's values were the same in both runs.

Screenshots of the exits on the e2e fixture, light and dark: [light](global-search-exits-light.png),
[dark](global-search-exits-dark.png) (from the gateway's run).
