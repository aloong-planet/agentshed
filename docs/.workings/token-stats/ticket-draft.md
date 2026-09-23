# Ticket 01 — Persist a global Token span and link its summary total

**Status:** Published — ready-for-agent.
**Issue:** [#186](https://github.com/zhoulf1006/agentshed/issues/186).
**Tracker:** GitHub issues on this repository; label `ready-for-agent`.
**Blocked by:** None — no other implementation ticket is required.

## What to build

Deliver the confirmed inline `30 · 60 · 90` choice across global and project Token charts,
remember it across navigation and full restart, and update the existing fourth summary card's
label and amount to the same span. When that card is active, its side/model/composition figures
move together. Include the startup layout, all supported languages/appearances, failure paths,
regression checks and current feature documentation in this same delivery.

One vertical slice is sufficient: the renderer already plots 30/60/90 days, and the existing usage
aggregation and app preference paths provide the remaining seams. This is one domain preference,
one shared control and one derived window, not a parser or archive redesign. Its two page mounts
and linked summary cannot ship separately without contradicting the same-screen behavior.
No separate closeout ticket: this ticket owns the entire increment and its step-8 closeout.

## Requirement sources

- [token-stats](../../specs/token-stats.md) — tracker path `docs/specs/token-stats.md`.
- [agents-overview](../../specs/agents-overview.md) — tracker path `docs/specs/agents-overview.md`.
- Reference commit: `4714c4f0fb15866f34b1f61f7736464213ed2c2f`, plus the current uncommitted
  token spec and approved prototype revisions. The quotes below are exact text with whitespace
  normalized. The commit alone does not contain the approved revision. Before a fresh-session
  implementation, make that revision available in its checkout and record its actual commit when
  one exists; do not silently implement the older dropdown contract. No fabricated commit reference.
- No source parent issue was supplied. Do not modify or close a parent issue.

## Acceptance criteria

Every item below is **not yet verified** for this revised behavior. The old dropdown gateway
result and browser prototype checks do not establish production acceptance.

- [ ] **token-stats::REQ-002/AC-01** (Implementation and end-to-end acceptance)

  > The heading presents exactly `30 · 60 · 90` inline, with each number independently clickable and the selected number highlighted using the theme accent and stronger weight. Small CSS-controlled gaps separate the numbers and dots; literal spacing characters do not determine layout. The dots are separators, not controls. There is no dropdown.

  **Test:** Electron, both chart entries: click each numeric choice and use keyboard activation; assert selected state, computed accent/weight and independent hit areas. Evidence: light/dark rendered screenshots of the confirmed spacing.

- [ ] **token-stats::REQ-002/AC-02** (Implementation and end-to-end acceptance)

  > Selecting N draws N consecutive local calendar dates in ascending order, ending on the shared current display day, including across month/year and daylight-saving boundaries. Older rows and future rows are excluded; absent dates remain zero with no segments.

  **Test:** Public trend and usage seams: literal start/end dates for 30/60/90 including DST, month/year transitions, outside/future and missing dates; Electron asserts exact bar counts and endpoints after each click.

- [ ] **token-stats::REQ-002/AC-03** (Implementation and end-to-end acceptance)

  > Expanding the span exposes existing historical daily values, including archived values and their existing hatching. Combined/provider segmentation, single-side counting, daily tooltips, and window-relative height scaling retain D2–D5 and ADR-0008 semantics.

  **Test:** Seed different older, archived and recent daily values; expand both chart entries, inspect tooltip totals, provider segments, hatching and side-only values against the fixture.

- [ ] **token-stats::REQ-002/AC-04** (Implementation and end-to-end acceptance)

  > Changing the span preserves the selected totals-card identity and the chart's side filter. Selecting a totals card or side does not reset the span. All-history, today and 7-day totals and their selected breakdowns are unaffected by a span-only change; the fourth card follows token-stats::REQ-002/AC-08 and token-stats::REQ-002/AC-09. The side filter applies only to bars, never to the totals cards. Dates outside the selected totals window are dimmed without removing bars; all history dims none.

  **Test:** Electron: for every card identity and side mode, switch span and back; assert unchanged other-card amounts/active identity, unchanged side mode, correct dimmed bars, and all-side totals above side-filtered bars.

- [ ] **token-stats::REQ-002/AC-05** (Implementation and end-to-end acceptance)

  > There is one global span for all Token daily charts. Changing it on either entry updates the other entry and every project when displayed, including already-mounted views. Switching pages, projects or tabs and receiving a new snapshot preserve that choice; there are no per-project or per-page overrides.

  **Test:** Electron: choose 60 globally, visit project A then B, switch tabs, return global, then choose 90 in detail and refresh data; every entry retains the one current value.

- [ ] **token-stats::REQ-002/AC-06** (Implementation and end-to-end acceptance)

  > All spans fit the chart width with daily bars; 60/90-day bars use tighter gaps. The date axis retains D6–D9/ADR-0009 semantics: data days only, correct month context, no overlapping or out-of-container labels. The inline choices and linked card remain usable at the minimum supported window width, in all themes, both appearances and every UI language. Copy and accessible names are localized; keyboard focus and the selected value are exposed through the existing accessible-control conventions.

  **Test:** Electron geometry/computed-style and keyboard checks on both entries at minimum width in six languages, three themes and both appearances; assert selected/focus visibility, accessible names, no axis/control clipping or overlap. Evidence: inspect fresh screenshots.

- [ ] **token-stats::REQ-002/AC-07** (Implementation and end-to-end acceptance)

  > A successful choice is saved as an application-owned preference. Quitting and reopening restores it for all charts and the fourth totals card. A fresh profile defaults to 30. This is local application persistence; it does not require an account or login.

  **Test:** Electron: select 60 and 90 in separate runs, fully quit and relaunch using the same isolated user-data directory, then inspect both entries and the fourth card. A fresh profile starts at 30.

- [ ] **token-stats::REQ-002/AC-08** (Implementation and end-to-end acceptance)

  > The fourth card remains a single card whose label is the localized equivalent of “Last N days” and whose amount sums the effective usage rows for those same N local calendar dates, for the current project or all projects as appropriate. It updates whenever the global span changes, even when another totals card is active. Archived and retained usage, zero dates and undated-row exclusion follow G5–G7 and ADR-0025; the value is not a multiple or extrapolation of the 30-day total. The other three cards keep their existing meanings.

  **Test:** Electron plus usage-window seam: fixture with unequal amounts in each 30-day slice, two projects and archived/retained/undated/empty rows; assert exact fourth-card labels and totals even when another card is selected, with all other cards unchanged.

- [ ] **token-stats::REQ-002/AC-09** (Implementation and end-to-end acceptance)

  > If the fourth card is active, changing N keeps it active and recomputes its side totals, composition, model breakdown and heading for N days together with the chart highlighting. Selecting that card after changing N uses the new N immediately. Its three composition buckets continue to sum to its total. Changing N does not automatically select the fourth card when another card is active.

  **Test:** Electron: activate fourth card, switch 30/60/90, assert card/side figures/composition/model heading/rows/dimming in one pass; activate a different card and repeat to prove no automatic reselection. Assert composition identity at the usage seam.

- [ ] **token-stats::REQ-002/AC-10** (Implementation and end-to-end acceptance)

  > An older preference file without the span field, or an invalid span value, falls back to 30 without resetting valid theme/language/appearance preferences. A corrupt preference file uses the existing preference-loading fallback without crashing. Saving the span preserves unrelated preferences and does not write agent configuration or accounting archives.

  **Test:** Preference store/handler seam: missing, invalid and corrupt preferences, unrelated valid settings and save round-trip. Electron profile fixture verifies fallback 30 and preserved settings; isolated filesystem fixture verifies agent/archive files are untouched by span-only saves.

- [ ] **token-stats::REQ-002/AC-11** (Implementation and end-to-end acceptance)

  > On rapid repeated selection, the last user choice wins across views and, once saved, after restart. A late initial preference read or an earlier save response must not overwrite a newer user choice. Snapshot refreshes and preference responses must not leave the selected number, fourth-card label/amount and active breakdowns on different spans.

  **Test:** Existing preference backfill and handler seams with delayed/out-of-order completions, paired with Electron rapid selection plus snapshot updates; assert final selected number/card/breakdowns agree, then relaunch to inspect the final successful saved value.

- [ ] **token-stats::REQ-002/AC-12** (Implementation and end-to-end acceptance)

  > If saving fails, the current selection remains consistent across the open app and the existing localized save-error feedback reports the failure; the app must not claim that it was saved. On reopening, restore the last successfully persisted value (or the default if none exists). Preference writes use the existing atomic save mechanism so an interruption does not leave a partially written preference file.

  **Test:** Preference filesystem seam: force write/rename failure or interrupted replacement and re-open the store to inspect the last complete record. Electron using the same failure condition: choose a span, verify consistent live views and localized error toast, then reopen with the last saved choice.

- [ ] **token-stats::REQ-002/AC-13** (Implementation and end-to-end acceptance)

  > With no first snapshot, the startup placeholder reserves the same inline control and fourth-card geometry, displays the resolved saved/default span, and keeps the chart control disabled. On first data or restored data, the card and chart use that span; startup data arrival cannot reset it to 30. Reopening with a saved span requires no corrective user click. Existing loading and restored-data states are reused.

  **Test:** Electron first-scan delay: launch fresh and with saved 60/90, with and without saved display data; inspect disabled inline choice, fourth-card label and geometry, release scan, and verify the span and anchors remain correct.

- [ ] **token-stats::REQ-001/AC-02** (Regression acceptance)

  > Today/7-day/selected-N-day totals, model/side/composition breakdowns, trend end date and selected-span highlighting use the same current display-time anchor; crossing midnight or changing time zone must not split their definition of today.

  **Test:** Injected display clock plus Electron restored-data fixture: cross midnight and change time zone; compare today, 7-day and selected-N totals, chart end and active breakdowns from the same anchor.

- [ ] **token-stats::REQ-001/AC-03** (Regression acceptance)

  > Stored observation timestamps and the archive's scan-day accounting are not rewritten to make restored data look current. Undated-row and all-history accounting remain unchanged.

  **Test:** Seed saved observation times and archive accounting; change only span and display clock, inspect unchanged timestamps/archive and unchanged all-history/undated-row results.

- [ ] **agents-overview::REQ-001/AC-01** (Shared startup regression acceptance)

  > On a full quit and relaunch with a valid saved snapshot, show its overview and project-list data before the first background scan completes.

  **Test:** Electron: relaunch a saved profile with 60/90 while first scan is held; saved overview/project-list data appears before scan completion.

- [ ] **agents-overview::REQ-001/AC-02** (Shared startup regression acceptance)

  > A successful background scan replaces restored data in place; settings and browsing remain usable during scanning.

  **Test:** Electron: navigate between settings/projects during restored scan, release it, and check in-place data replacement plus preserved global span.

- [ ] **agents-overview::REQ-001/AC-03** (Shared startup regression acceptance)

  > Without a usable saved snapshot (missing, corrupt or incompatible format), retain the existing first-scan skeleton and its automatic recovery behavior.

  **Test:** Electron: missing/corrupt/incompatible display-cache fixtures still enter existing skeleton and recover with the stored preference intact.

- [ ] **agents-overview::REQ-002/AC-01** (Shared startup regression acceptance)

  > Restored data is accompanied by the existing scanning indicator while the first scan runs, without replacing the data area or blocking navigation.

  **Test:** Electron: saved data with 60/90 selected shows the existing scanning indicator and stays navigable without a skeleton replacement.

- [ ] **agents-overview::REQ-002/AC-02** (Shared startup regression acceptance)

  > Remove the scanning indicator when the first scan succeeds, without moving the page's content anchors.

  **Test:** Electron: compare card/chart anchor geometry before and after first scan; indicator disappears without shifting content.

- [ ] **agents-overview::REQ-002/AC-03** (Shared startup regression acceptance)

  > A failed scan retains the restored data; automatic scan triggers continue to provide recovery. The failed state must not claim that fresh data has arrived.

  **Test:** Electron failing-first-scan fixture: retain restored totals/span, show the existing failed status, then allow automatic recovery without claiming early freshness.

- [ ] **agents-overview::CON-001** (Shared startup regression acceptance)

  > Startup display data uses its own format version. An application or accounting-cache version change alone does not discard compatible display data. Restored numbers are presentation input, not a new scan result or input for overwriting the usage archive.

  **Test:** Existing display-store/version fixture plus Electron restored startup: compatible display data survives an accounting-version change; span preference writes do not feed restored rows into archive merging.

- [ ] **agents-overview::CON-003** (Shared startup regression acceptance)

  > Every full restart opens Agents. Project selection, session selection, scroll, expanded/collapsed state, search text and time-window selection are not restored by this feature. Persisted appearance and language preferences keep their existing behavior.

  **Test:** Electron relaunch after visiting a project and activating the fourth card: opens Agents with default active totals card, preserved 60/90 preference and appearance/language; existing navigation-state reset regression remains green.

## Technical prerequisites

- Extend the existing app-owned preference and validated IPC/preload contract for the one selected
  span; reuse the existing calendar aggregation and shared display clock. This supports
  token-stats::REQ-002/AC-05, token-stats::REQ-002/AC-07, token-stats::REQ-002/AC-10,
  token-stats::REQ-002/AC-11 and token-stats::REQ-001/AC-02.
  **Gate:** typecheck and preference contract/store tests under `pnpm verify`.
- Reuse the existing isolated-profile Electron and filesystem-failure test infrastructure. Any
  fixture plumbing is part of this ticket, not a separate product requirement. It supports
  token-stats::REQ-002/AC-07, token-stats::REQ-002/AC-11 and token-stats::REQ-002/AC-12.
  **Test:** distinguish true quit/relaunch from reload, and record actual failed-save evidence.

## Workflow acceptance

- [ ] Follow the project implementation workflow: red/green behavior tests, full gateway and the
  required code/test reviews. **Gate:** `pnpm verify`; **Evidence:** review records with actual
  implementation commit and logs, including a demonstrated red case for the changed behavior.
- [ ] Complete the same-ticket feature/document closeout: reconcile spec, implementation, feature
  catalogue, glossary, applicable ADRs and all three prototype mounts in the changed scope. Remove
  Pending notes only when their conditions actually hold. No unrelated ADR rewrite.
  **Evidence:** current coverage checklist and document-regression table; **Gate:** shared UI,
  language and i18n checks in `pnpm verify`.
- [ ] Publish code and documentation together in a PR; wait for explicit merge authorization.
  **Evidence:** PR diff and verification links. Opening the PR is not merge approval.

## Boundaries

Keep provider formulas, usage-row/cache/archive shapes, retention policy and observation times
unchanged. No custom date endpoints, additional totals cards, login/account feature or per-project
span preference. Prototype mock arithmetic is not production accounting. The selected totals-card
identity keeps its existing lifetime; only the numeric span is the new persisted preference.
