# Appearance — Coverage and acceptance checklist

Spec: [appearance](../../specs/appearance.md)
Source commit: fc3fbeb with uncommitted changes (the spec's scrollbar requirement, written on branch `fix/thin-scrollbars`)
Scope: #281's scrollbars — appearance::REQ-001 and its failure items (sequence F), the thumb tokens' place in C2, and the
regression conditions they touch (sequence B's light/dark switch, B5's six states). Not affected this round: sequences A, B
and D (selection, persistence, the settings page), C1 and the rest of C2, sequence E (rendered markdown), R1–R4, and the
nativeTheme decisions — the change adds a drawing rule and two tokens and changes none of them.

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| The owner's request, 2026-10-23 (translated): "not only adjust the scrollbar's colour in dark mode, but also narrow it [a reference image: a slim grey thumb], and do not show its background" | Confirmed and in force | appearance::REQ-001/AC-01 (narrow), AC-02 (no background), AC-04 (the dark colour) | Kept: narrow, no track, a dark-mode colour. "Background" read as the track; the corner where two scrollbars meet is the same background (AC-02) |
| #281, "What was seen": in dark, a near-white strip down the right edge of the question list, the search results and the project list | Confirmed and in force | appearance::REQ-001/AC-02, AC-04; F1 | The strip is the track: gone with no track, and the thumb takes a dark-mode grey |
| D1 (`ticket-281-tasks.md`): a 6px thumb drawn through `::-webkit-scrollbar`, no track | Confirmed and in force | appearance::REQ-001/AC-01, AC-02; Implementation Decisions "Scrollbars are drawn by the app" | Kept: 6px; drawn, not the engine's thin one |
| D2: shown whenever the content overflows | Confirmed and in force | appearance::REQ-001/AC-03; F1; Out of Scope (a thumb shown only while scrolling) | Kept; the option not taken (only under the pointer) recorded in UI decisions |
| D3: every scrolling area in the app, vertical and horizontal | Confirmed and in force | appearance::REQ-001 (its body); F3, F8 | Kept: no surface keeps the platform's scrollbar |
| D4: a neutral grey that changes with light and dark, the same in all three themes | Confirmed and in force | appearance::REQ-001/AC-04; C2 | Kept: follows the effective light/dark, not the theme |
| D5: the prototype confirmed as drawn — 6px, 3px corners, light black 25% / hover 40%, dark white 22% / hover 36%, no track, the corner cleared | Confirmed and in force | appearance::REQ-001/AC-01 (the radius), AC-04, AC-05; UI decisions; Further Notes (the prototype gate) | Kept, values as drawn. The hover shade was added on the prototype and confirmed with it |
| #281, "Suggested check": a declared colour scheme for dark, or explicit scrollbar colours | Background | — | Measured: the declared scheme alone keeps the 15px track (Implementation Decisions); the owner's request goes further |

## Spec → tickets → verification

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| appearance::REQ-001/AC-01 | 6px wide (6px tall when horizontal); the thumb's ends rounded, 3px | #281: implementation and acceptance | Test: e2e, a list that overflows in the running app, light and dark: the area's width less its client width is 6px (the e2e window's classic scrollbar is 15px without the rule) |
| appearance::REQ-001/AC-02 | No track; the corner shows the surface beneath | #281 | Test: e2e, a pixel beside the thumb in the captured window equals the area's background, light and dark. The corner: Evidence, a both-way scrolling area captured |
| appearance::REQ-001/AC-03 | Shown whenever the content overflows, also idle; none when the content fits | #281 | Test: e2e, the width read on an overflowing area with no scrolling done, and on one whose content fits (no gutter) |
| appearance::REQ-001/AC-04 | Light black 25%, dark white 22%; follows light/dark, not the theme | #281 | Test: e2e, a pixel inside the thumb equals the colour laid over the background, light and dark. Evidence: the two tokens across the six theme × mode states (`theme-vars`) |
| appearance::REQ-001/AC-05 | Under the pointer: light black 40%, dark white 36% | #281 | Test: e2e, the same pixel with the pointer on the thumb |
| appearance F1, F2 | The same drawing with a mouse or a trackpad, whatever macOS's setting | #281 | Evidence: by construction (a drawn scrollbar replaces the platform's); the e2e window is the classic case. A trackpad-only overlay case is not automatable here |
| appearance F3 | Both ways: two 6px scrollbars, the corner clear | #281 | Evidence: a capture of a both-way scrolling area |
| appearance F4 | A light/dark switch recolours the thumbs at once; a theme switch does not | #281 | Test: the e2e's light and dark readings; Evidence: the token check across themes |
| appearance F5 | Content that grows gains a scrollbar, shrinks loses it | #281 | Evidence: by construction (overflow decides); covered by AC-03's two readings |
| appearance F6 | Dragging, clicking beside the thumb, wheel and keyboard scrolling unchanged | #281 | Gate: the full e2e suite, whose cases scroll lists, stays green |
| appearance F7 | Layouts that measure their width keep their rules at 6px | #281 | Gate: the full e2e suite (one-line labels, the hit-row cut, the side filter row) |
| appearance F8 | Markdown, the drawer and the overlays draw the same scrollbar | #281 | Evidence: the rule's selector covers every element (code review); a capture of the drawer |
| appearance C2 (the thumb tokens), B5 | Identical across the three themes; light and dark each declared | #281 | Evidence: `theme-vars` over the theme stylesheet |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-23; spec fc3fbeb with uncommitted changes; no implementation yet | Every unit above; #281 | Not run yet | Unverified |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source above in force maps to a coverage unit | The source table | Complete: the request, #281's strip, D1–D5 each map; the issue's suggested check is background |
| Reverse: every normative unit traced to a source or derived from one | appearance::REQ-001/AC-01..AC-05; F1–F8; the C2 entry; the Out of Scope entries | AC-01..AC-05 trace to D1–D5 and the request. Derived, resolving cases the decisions left open without changing them: AC-03's "none when the content fits" (what "shown whenever it overflows" implies), F1–F8 (boundaries and regressions of a drawn scrollbar). Out of Scope's native form controls and landing page record what the change does not touch; neither adds an obligation |
| The prototype shows no area that scrolls both ways, so the corner and a horizontal scrollbar were not seen on it | appearance::REQ-001/AC-02 (the corner), D3 (horizontal) | Both are in the confirmed decisions (no background; vertical and horizontal) and in the prototype's rule; their evidence is a capture in the app (F3) |
| Conflict found in the self-review: the spec's "No pixel testing" against the scrollbars' pixel reads | appearance Testing Decisions | Resolved in the spec: reading a few pixels at measured positions is measurement, not the screenshot comparison that line rules out, as the heading ladder's note already says for computed styles |
