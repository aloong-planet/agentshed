# Prototypes on the updated skill — Coverage and acceptance checklist

Source: the body of [#251](https://github.com/aloong-planet/agentshed/issues/251) as rewritten on 2026-10-18,
and the owner's decisions of the same day (no spec: #251 is the requirement source; one branch, one PR; the
xAI segment colour is settled, its value taken from the app). #250's items are not in this round.
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

## Current verification

| Check date, source and implementation commits | Unit | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-18; 26b9216; uncommitted | all | Not run yet | Unverified |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Every #251 item has a row above; item 4 has nothing left to verify | #251 items 1–14, Done when | Mapped |
