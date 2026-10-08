# Inline global trend span — prototype revision

Status: revised prototype confirmed; specification updated, production implementation pending. The application implementation and PR still contain the previously confirmed dropdown; this record does not claim implementation completion.

## Requested behavior

- Replace the dropdown with inline `30 · 60 · 90` choices and highlight the selected number.
- Share one selection across every Token daily bar chart, including the global Agents page and all project details.
- Persist the choice and restore it on the next app launch. Default to 30 when no valid preference exists.
- Keep the existing prototype layouts.
- The fourth summary card follows the selected span: both its label and total change to the last 30, 60, or 90 days. When that card is active, its side/model breakdown and chart range follow the new span too.

## Prototype evidence

- Updated all three shared chart mounts: Agents, project detail, and startup skeleton.
- Selecting 60 in project detail rendered 60 bars and a purple selected number; reloading retained 60.
- Opening Agents inherited 60. Selecting 90 there rendered 90 bars and updated the already-open project detail to 90 without reloading.
- Startup skeleton inherited 90 with disabled choices and 90 placeholders; switching to loaded retained 90 with 90 data bars.
- Inspected screenshots for the project detail and loaded skeleton layouts.
- The prototype-only shared UI gate and `git diff --check` passed.

The prototype uses a dedicated browser-storage key, isolated from application preferences. The confirmed implementation must use the existing app preference store instead. The revised specification is written. Production code, tests, reviews and feature documentation remain pending implementation; prototype confirmation has been received.

## Linked summary card revision

- Daily mock history is normalized to the existing 30-day totals; the changing summary card sums that same history for the chosen span. Model amounts use mock shares of the matching side total.
- Browser checks: project card shows 13.3M / 26.0M / 39.2M for 30 / 60 / 90 days; global card shows 4.04B for 60 and 5.85B for 90 days. These are prototype values, not live usage measurements.
- Selecting the project summary card and then changing the span updates its model heading and side amounts. Reloading at 60 restores the 60-day chart and card; another open page synchronizes its card without a reload.
- Startup skeleton shows the saved 60-day label; loaded state shows 4.04B. Russian labels were also checked in the rendered skeleton page.
- This revision was confirmed before the user requested the specification update; production work remains pending.
