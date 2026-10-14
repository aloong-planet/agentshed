# Evidence — ticket #231

Rendered results of the settings "Updates" section (/ui-design §7), taken 2026-10-14 from the built app of
branch `feat/settings-updates` (uncommitted working tree on dab4da4) with Playwright's Electron launcher and the
scripted update source; Playwright captures the page itself, so no Screen Recording permission is involved.

| File | State | What it shows |
|---|---|---|
| `ready-light.png` | an update ready, light, the pointer on "Install now" | the green "Version 0.2.0 is ready to install", "Install now" in its hover form, the rail's ready button at the bottom left |
| `ready-light-bottom.png` | the same, scrolled to the end | the footnote "…click the update button at the bottom left…" and that button in one picture |
| `failed-light.png` | a settings check failed, light | the line in the error colour, "Check now" available |
| `failed-dark-bottom.png` | the same, dark | the same in dark, and the footnote |
| `ready-dark.png` | an update ready, dark | the ok line and "Install now" in dark |
| `dev-run-light.png` | a development run | the switch and "Check now" unavailable, no line (the footnote is below the fold here) |

Computed values read at the same moments (`getComputedStyle`):

- "Install now" under the pointer: background `rgb(240, 235, 246)` = `--accent-soft`, border `rgb(138, 103, 171)` =
  `--accent` (light).
- "Check now" unavailable (development run): colour `rgb(120, 119, 116)` = `--text-2`, border `rgb(232, 234, 237)` =
  `--line`, cursor `default`.
- The switch's segments unavailable: opacity `0.55`, cursor `default`; the selected one on `--line`
  (`rgb(232, 234, 237)`).
- The line: ok `rgb(22, 101, 52)` = `--ok-fg` light; error `rgb(153, 27, 27)` = `--err-fg` light,
  `rgb(252, 165, 165)` = `--err-fg` dark.

Outside this change, not investigated: in the dark captures a light vertical strip shows at the settings
page's scroll bar. Dark was emulated through Playwright's colour-scheme option.

Hover over the unavailable controls (development run, `:hover` confirmed true at the time of reading):

- The switch's "Off": background `rgba(0, 0, 0, 0)`, colour `rgb(120, 119, 116)` = `--text-2` — the unavailable rule wins
  over `.seg-field button:not(.on):hover`.
- "Check now": background `rgb(247, 248, 249)` = `--bg`, border `rgb(232, 234, 237)` = `--line` — not the hover's
  `--accent-soft` / `--accent`.
- Control: an available segment of the mode switch under the pointer does light up (colour `rgb(55, 53, 47)` =
  `--text`, background `--bg`), so the hover was real.
