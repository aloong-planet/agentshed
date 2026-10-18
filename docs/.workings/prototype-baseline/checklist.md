# Prototypes on the updated skill — Coverage and acceptance checklist

Source: the body of [#251](https://github.com/aloong-planet/agentshed/issues/251) as rewritten on 2026-10-18,
and the owner's decisions of the same day (no spec: #251 is the requirement source; one branch, one PR; the
xAI segment colour is settled, its value taken from the app). Of #250's items only item 4 is in this round,
added with the code review's refactor list by the owner's decision of 2026-10-18.
Source commit: 26b9216 (origin/main when the work began).
Scope: everything under `docs/prototypes/` that #251 names, `scripts/check-shared-ui.mjs`, the `check:ui`
script, and the documents that describe the derived-file arrangement (ADR-0018 and the ADR index).

This is a work index, not a requirement authority. The units below are #251's items and its "Done when"
lines; each names the tier that backs it.

## Source → verification

| Unit | Source text (abridged) | Planned verification and boundary |
|---|---|---|
| 251::1 | Re-copy `index.html`, `demo-dimensions.js`, `demo-harness.js`, `app-identity.js`, `sync-mmd.mjs`; settings prototype gets `data-settings` and follows the gallery; `general` on language and mode; defaults from the registry's `fallback` (language `en`, mode `light`) | Evidence: `cmp` against each master; browser: cleared storage → settings shows the registry defaults with untouched preferences; both alignment cases (explicit → explicit choice of the new values; Follow system → stays, shows the new values); reopening keeps the result |
| 251::2 | "Demo ·" instead of the Chinese demo prefix in the 11 files | Evidence: a search for the Chinese prefix under `docs/prototypes/`, command and empty output |
| 251::3 | Candidates: xAI switch removed (settled, value from the app); stale-note `.pick` block removed | Evidence: search for `XAI_CAND` and `class="pick"`; browser: Token tab draws the settled colour in light and dark |
| 251::4 | Superseded by item 12 | — |
| 251::5 | Generators and `css-blocks.mjs` deleted; four files hand-kept, headers gone; comments rewritten | Evidence: search for the generator names and "Derived file" under `docs/prototypes/` and `scripts/` |
| 251::6 | Shell: the scan-complete button moves into the harness; the header stops calling the rail static | Evidence: browser, button inside `[data-demo-harness]`; header text |
| 251::7 | Navigation helper on skills-view, plugins-view, appearance; duplicates gone from the shared blocks | Evidence: search; browser: every entry clicked alone and in the gallery |
| 251::8 | Each state switch's real source in the harness note | Evidence: per page, `dh-note` text |
| 251::9 | No "copy from the dictionary" claims; copy two or more pages show in a shared table | Evidence: search for the claims; enumeration of duplicated copy and where each landed |
| 251::10 | Six prototype-versus-app checks gone; six app checks kept; no `--cross` tier | Gate: `pnpm check:ui` exit 0; mutation of a kept rule turns it red |
| 251::11 | Settings: no system light/dark select, no `SYSTEM_LANGS`; text updated | Evidence: search; browser: Follow system shows the value in effect |
| 251::12 | Harness bars in the dock script's markup, no page or shared style targets them, no `<select>` | Evidence: search for `data-demo-harness`/`dh-` in style rules and `<select` inside bars; browser screenshots |
| 251::13 | App window root styles on its box, inherited and background ones also on the candidates cell; landing-page and md-preview judged | Evidence: search for html/body rules; browser: computed styles of the window box equal the old body's |
| 251::14 | No app source paths (`src/`) outside mock content | Evidence: search for `src/` under `docs/prototypes/`, command and output |
| 251::15 | Added on 2026-10-18 (owner): candidates settled on the app's current form — the skills preview keeps the flat expanded form, md-preview keeps V2; their switches, losing forms and bars go | Evidence: search for the removed forms; snapshot diff limited to the removed rows and texts |
| 251::done | Gallery and every page open with no page errors | Evidence: browser run over every manifest entry, zh/en × light/dark |
| 251::R1 | Code review refactor list, executed (owner, 2026-10-18): a demo bar does not cover the rail's items at its default place | Evidence: rail probe on every page with a bar, alone and in the gallery, at 1280 and 1440; the dock copy byte-equal to its master |
| 251::R2 | Same list: toasts stand at the prototypes' toast position, not at a height chosen for a demo bar | Evidence: toast probe over every toast in the prototypes |
| 250::4 | #250 item 4: the skills and plugins previews in dark take drawer shadow 0.12 and mask 0.35, as in light; their comments stop presenting the dark values as a correction | Evidence: token probe, three palettes × light and dark; drawer opened in dark |

## Current verification

| Check date, source and implementation commits | Unit | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-18; 26b9216; 03cbaa7 plus the review fixes | 251::1 | Re-copied files byte-equal to their masters (app-identity.js already was); item 1 script: cleared storage shows en/light/purple with untouched preferences; explicit preferences become the gallery's fr/light; Follow system stays and shows ja/dark; reopening keeps both; an open page follows a change from another tab | Verified |
| same | 251::2 | `rg -n "<Chinese prefix>" --glob "!landing-page/**"` under docs/prototypes: exit 1 (landing page waits) | Verified except the landing page |
| same | 251::3 | `rg -n 'XAI_CAND\|class="pick"'`: exit 1; the Agents page draws `--p-xai` from the shared theme (#ad98d0 / #c9b3ec, the app's values) | Verified |
| same | 251::5 | `rg -n "sync-(theme\|icons\|project-side\|startup-skeleton)\|css-blocks"` under docs/prototypes and scripts: exit 1; no "Derived file" header outside sync-mmd's own outputs | Verified |
| same | 251::6 | Shell: the scan button is a two-option group in the bar; the header no longer calls the rail static | Verified |
| same | 251::7 | The skill's helper block verbatim on the ten pages that render `data-goto`; 45 entries clicked opened alone, all landed, none targets its own page; inside the gallery every entry switches the hash | Verified |
| same | 251::8 | Every bar carries one `dh-note` per group naming the app-side source; the Agents page's content note about the bar is gone | Verified |
| same | 251::9 | Dictionary claims: one historical note left, rewritten; a case-insensitive search for the Chinese and English wordings of "from the app's dictionary" and for `i18n/` under docs/prototypes then exits 1; `_shared/copy.js` holds 32 entries in each language, each removed from every page that had it | Verified |
| same | 251::10 | `pnpm check:ui` (no tier) exit 0; mutations of four kept rules and of the new app-window block each exit 1 with the rule's message | Verified |
| same | 251::11 | `rg -n "mockSystemDark\|SYSTEM_LANGS\|sysTheme"`: exit 1; no select in any bar | Verified |
| same | 251::12 | No style rule names the bar on any converted page; no `<select>` and no `style` inside a bar; bars render in the dock look (screenshots) | Verified except the landing page |
| same | 251::13 | Ten app-window pages: `body` block/visible, the window box carries the root styles; md-preview's sheet on `.sheet`; `rg -n "^\s*(html\s*,\s*)?body\s*\{"` over the UI pages hits only the landing page | Verified except the landing page |
| same | 251::14 | `rg -n "src/"` over the pages: only mock content (session transcripts, a mock subagent description, the skills fixture) | Verified |
| same | 251::15 | Skills preview flat only and md-preview V2 only; snapshot diff limited to the removed rows and texts | Verified |
| same | 251::done | 48 snapshots (12 pages × zh/en × light/dark) with no page error; the gallery loads all 15 entries; `pnpm verify` exit 0 (830 unit, 135 e2e, smoke OK) | Verified; the landing page reruns with its conversion |
| 2026-10-18; 26b9216; e9701ea plus the follow-up, measured before it was committed as 8ee4eec, cfa2f43 and adff9a2 (same content) | 251::R1 | Before: the session page covered the rail's Settings item at 1280 alone and in the gallery, the settings page its Update and Settings items at 1440 alone. After: no rail item covered on any of the 8 bar pages in any of the 4 combinations; only those two bars changed (now 738 and 927px wide at 1280); `cmp` with the skill's master: identical | Verified; the landing page reruns with its conversion |
| same | 251::R2 | The three toasts in the prototypes all stand at 18px; on the settings page the toast lies over the bar's last note line only (1280 and 1440) | Verified |
| same | 250::4 | Both previews: mask 0.35 and drawer shadow 0.12 in all six palette × mode states (before: 0.5 and 0.45 in dark); drawers opened by clicks in dark render those values; the comments no longer mention the app's values | Verified |
| same | all units | 48 snapshots against e9701ea: text identical, pixels identical but for 2 antialiasing pixels; check:ui, check:lang, check:nul exit 0 | Verified |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Every #251 item has a row above; item 4 has nothing left to verify | #251 items 1–14, Done when | Mapped |
| The code review's refactor list and #250 item 4 joined this round by the owner's decision of 2026-10-18; #250's other items stay out | 251::R1, 251::R2, 250::4 | Mapped |
