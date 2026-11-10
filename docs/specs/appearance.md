# Appearance

> Related: app-wide UI tokens; rendered markdown follows the
> accent and shares one heading ladder (sequence E)  
> Two orthogonal dimensions: **mode** (follow system / light / dark, defaulting to follow system) ×
> **theme** (purple (default) / mist blue / amber brown).  
> The final look = f(theme, effective light/dark); the settings page shares one preferences
> table with language, see [i18n](i18n.md).
>
> **On the naming**: the two dimensions are *appearance* and *theme* (see CONTEXT for why —
> `prefers-color-scheme` and SwiftUI's `ColorScheme` both already mean light/dark, so "colour scheme"
> was naming the wrong axis). A choice stored under the old `scheme` key is not read, so an
> existing choice falls back to purple once on upgrade — a deliberate call, not a missing migration.

## Problem Statement

The app needs to follow macOS's light/dark mode and let the user choose between several UI accent /
paper feels. The app already does light/dark with CSS variables and
`prefers-color-scheme`, but only in a fixed brand purple. The user wants to keep **the shipped
default purple** and add reading-oriented themes such as **mist blue and amber brown**; a switch
must apply to **the whole app** (rail, lists, detail, drawers, the future skill preview and so on)
rather than being a partial skin.

The scrolling areas drew the platform's default scrollbar: wide, with a track that stays light beside
dark lists in dark mode, out of keeping with the app's restrained chrome.

## Solution

Adopt **option B**:

- **The theme dimension** `theme ∈ { purple, blue, amber }`: **user-selectable**, persisted to the
  app's own storage.  
  - `purple` = the shipped default palette (light `#8a67ab` / dark `#a084c7` family)  
  - `blue` = mist blue  
  - `amber` = amber brown  
- **The mode dimension** `mode ∈ { system, light, dark }`: **user-selectable**, defaulting to
  `system`, persisted in the same app-owned preferences.  
  `system` is **a policy, not a snapshot** — while it is selected, light/dark follows the macOS
  appearance; choosing `light` / `dark` locks it, and later system changes have no effect until the
  user actively selects `system` again.  
- **The effective light/dark** `light | dark` = `f(mode, system appearance)`, which is the value that
  actually renders; it is not persisted itself (what is persisted is `mode`).  
- The final look = `f(theme, effective light/dark)`.  
- **The whole app** references CSS variables only; hard-coding a theme's colours inside a component
  is forbidden. Semantic colours (the side badges, provider, ok/err) do not change hue with the theme.
- **Scrollbars**: every scrolling area draws a slim neutral-grey thumb on no track
  (appearance::REQ-001).

## User Stories

1. As a user, I want to choose between purple / mist blue / amber brown, so that I can keep the
   familiar default purple or move to a softer reading-oriented palette.  
2. As a user, I want a switch to recolour **the whole app** immediately and survive a restart, so that
   the experience is consistent and I do not have to choose again every time.  
3. As a user, I want light/dark to follow the system appearance by default, so that it matches my
   other macOS apps.  
3b. As someone using a dark system in a bright room, I want to lock this app to light on its own, so
   that I do not have to change the whole system appearance for one app.  
3c. As someone who has locked light or dark, I want later system appearance changes not to affect the
   app, so that my choice is not quietly overruled by the system.  
3d. As a user, I want to be able to select "follow system" again, so that locking is reversible.  
4. As a user, I want the side badges and the provider chart colours not to jump around with
   the theme, so that semantic colours stay recognisable.  
5. As a developer, I want a new UI to bind only to token names, so that adding a theme does not
   require changing components.  
6. As a user reading a rendered markdown file (SKILL.md, memory, CLAUDE.md), I want every heading
   level to be visually distinct — in particular h3 vs h4 — so that I can scan the document's
   structure without counting `#`s in the raw view.

## Functional Requirements

### appearance::REQ-001 Scrollbars

Every scrolling area in the app, vertical and horizontal, draws its own slim scrollbar rather than the
platform's.

- appearance::REQ-001/AC-01: The scrollbar is 6px wide (6px tall for a horizontal one), and its thumb
  has rounded ends (a 3px radius).
- appearance::REQ-001/AC-02: There is no track: beside the thumb, and in the corner where a vertical and
  a horizontal scrollbar meet, the surface beneath shows through.
- appearance::REQ-001/AC-03: The thumb is shown whenever the area's content overflows, also while
  nothing scrolls; an area whose content fits shows no scrollbar.
- appearance::REQ-001/AC-04: The thumb is a neutral grey that follows the effective light/dark and not
  the theme: in light, black at 25% opacity; in dark, white at 22%.
- appearance::REQ-001/AC-05: The thumb darkens under the pointer: in light, black at 40%; in dark,
  white at 36%.

## Failure modes and boundaries

**Sequence A: selection and persistence**

- A1 The default theme = **`purple`** (a fresh install with no storage file looks like the shipped
  build).  
- A2 The user changes to `blue` / `amber` / back to `purple` → apply
  the theme immediately and write atomically to userData.  
- A3 On restart the theme is read back; an invalid value or a corrupt file → fall back to
  **`purple`**, no crash.  
- A4 Storage = the app's own file in `userData` (written atomically — a temporary file + rename, so
  an interruption leaves no half file; **never written to the agent configuration**). Field:
  `theme: "purple"|"blue"|"amber"`, `mode: "system"|"light"|"dark"`.  
- A5 Switching themes triggers no full rescan and no window reload (only a DOM attribute and CSS).  
- A6 **The scope of effect = the whole app**: the rail, the Agents/Projects main area, detail pages,
  the session page, toasts, overlays and drawers, the settings page itself, and the accent-following
  parts of the future skill preview and markdown preview. There is no intermediate state where "only
  the settings page is reskinned".

**Sequence B: light/dark mode**

- B1 The default `mode = system`; a fresh install, a missing storage file, or an invalid or corrupt
  field all land on `system`, no crash.  
- B2 With `mode = system`, a system appearance change → the UI's light/dark changes with it;
  `theme` is unaffected.  
- B3 With `mode = light | dark`, **the UI does not change** however the system appearance changes.  
- B4 Switching from a locked state back to `system` → re-evaluate immediately from the current system
  appearance, without keeping the previously locked light/dark.  
- B5 Mode and theme are **independent**: changing one leaves the other alone; all 6 combinations of
  3 themes × 2 effective light/dark must hold.  
- B6 The two "follow system" settings, mode and UI language, **do not interfere**: changing the system
  language affects only the language, changing the system appearance affects only light/dark.  
- B7 Switching modes triggers no full rescan and no window reload.  
- B8 The window chrome and the macOS native menu **follow the chosen mode too** (delivered by
  `nativeTheme`, see the implementation decisions), so there is never a split between a dark app and a
  light window frame.  
- B9 The palette preview's samples **follow the effective light/dark**: in dark mode the three theme
  cards must show dark-family colours rather than still showing light samples (or the preview would
  not match what is actually seen).

**Sequence C: palette scope**

- C1 **Follows the theme** (each theme has its own light/dark table):  
  `--bg/--card/--text/--text-2/--line/--line-strong/--accent/--accent-soft/--accent-deep`  
  the rendered-markdown third-step heading colour `--md-h3` (a lighter step of the accent family;
  light and dark are declared explicitly for every theme even where values coincide), and the
  selection wash `--accent-soft-deep` (one step deeper than `--accent-soft`).  
- C2 **Does not follow the theme** (semantic / data colours; may have light/dark, identical across
  the three themes):  
  - the side badge tokens  
  - the scrollbar thumb and its hover shade (appearance::REQ-001/AC-04, AC-05)  
  - the provider `--p-*`  
  - `--ok-*` / `--err-*` / warn semantics (brightness may be nudged where it clashes with a theme's
    paper feel, but the hue is not bound to the theme)  
- C3 Local styles with hard-coded hex in `theme.css` → pulled into tokens, so no colour is missed when
  the theme changes.  
- C4 Rendered markdown (skill preview, memory / instructions / artifact readers): links follow the
  `--accent` family; headings follow the heading ladder of sequence E — h1/h2 in the accent family,
  h3 in `--md-h3`, and h4–h6 **deliberately step out of the accent family** into `--text-2` so depth
  reads as receding rather than as ever-smaller accent text.

**Sequence D: the settings entry point**

- D1 The rail's **settings dimension, "Settings"** (the rail's dimensions are agents, projects,
  search and settings; see [global-search](global-search.md)).
- D2 Switching to settings makes the main area the settings page.  
- D3 The settings page's "Appearance" section is **one card with two rows**: the top row "Mode" = a
  three-segment control (follow system / light / dark), the bottom row "Theme" = three
  palette cards. The two rows are joined by a divider, with the label on the left and the control on
  the right, in the same form as the "Language" section.  
- D3a The palette cards are compact: **a swatch plus a name**, with no full sentence of description
  (the first swatch is the paper sample; the fourth takes `--text`); the "purple is the default"
  information lives in the explanatory text below the section.
- D4 The settings entry point is anchored at the bottom of the rail. While
  an app update is in flight, the update button sits directly above it
  ([app-update](app-update.md) `app-update::REQ-001/AC-01`).  
- D5 A selection takes effect immediately, with no save button.  
- D6 Entering and leaving settings does not lose the `selected` project.

**Sequence E: rendered-markdown heading typography** (the user opens any markdown preview — a
SKILL.md in the file drawer, a memory file, a CLAUDE.md preview, the artifact reader — and scans the
document by its headings)

- E1 **One ladder, every surface**: all rendered-markdown surfaces use the same h1–h6 ladder,
  em-based against the surface's body size (both current surfaces set 12.5px, so px below are the
  current equivalents):

  | Level | Size | Colour | Shape cue |
  |---|---|---|---|
  | h1 | 1.32em (16.5px) | `--accent-deep` | full-width bottom rule, 2px `--line-strong`, 0.3em gap |
  | h2 | 1.16em (14.5px) | `--accent` | left bar, 3px `--accent`, 10px padding |
  | h3 | 1.06em (13.25px) | `--md-h3` | — |
  | h4 | 0.95em (11.9px) | `--text-2` | — |
  | h5 | 0.88em (11px) | `--text-2`, weight 650 | — |
  | h6 | 0.85em (10.6px) | `--text-2`, weight 650 | — |

  Weight 700 for h1–h4; margins `1em 0 0.4em`; line-height 1.3; no letter-spacing.
- E2 **Adjacent levels never rely on font size alone** — the pair that prompted this (h3 vs h4)
  differs in both size and colour family (accent-step vs grey). Rationale: a wrapped heading's
  taller block visually swamps a small size difference; colour and shape survive wrapping.
- E3 Two headings of adjacent levels **with no body text between them** still read as two levels
  (the hardest real case: `### x` directly followed by `#### y` in a SKILL.md).
- E4 Long headings that wrap in the narrow drawer keep their cues: the h1 rule underlines the whole
  block, the h2 bar spans every wrapped line.
- E5 No oversized display headings in panel contexts: h1 caps at 1.32em.
- E6 The ladder holds in all 3 themes × light/dark: `--md-h3` keeps contrast against `--card` in
  both modes per theme; the h1 rule uses `--line-strong` so it stays visible on dark.
- E7 Body size, the frontmatter card, links and the raw view are untouched by the ladder and
  code rules (regression line for the surfaces sharing them).
- E7b **Code shares the same two-surface rule set as the ladder**: inline code is a bordered pill, a
  fenced block is a bordered paper inset on the surface's background, and the code element inside
  a fence carries **no box of its own** — without that reset the inline-pill rule draws a second
  border inside every fenced block.
- E7c List indentation is part of the shared rule set: 20px on every surface. Link colours are
  shared too: accent at rest, deep accent on hover, on both surfaces. Body line-height is shared as
  well (1.75) — with that, the surfaces have **no** remaining authored content-styling differences.
- E7d Tables take the paper form on every surface: a bordered frame — **6px corner radius, one value
  shared by the table frame, the fenced-code inset and the frontmatter card** — and row lines in
  `--line`, **column separators one step stronger** (`--line-strong`) so columns stay readable, an
  `--accent-soft` header with `--accent-deep` text whose **cells never wrap** (a wide table scrolls
  its container instead) and are **always centred**, and `--bg`-striped even rows — every value an
  existing token. **GFM alignment (`:-:` / `--:`) applies to body cells and wins over their default
  left**; it does not drag the header along (the parser puts the align attribute on th too).
- E7e Code carries no syntax colouring on any surface: a fenced block's keywords, strings and comments
  take the same text colour as the rest of the block.
- E8 Host-capability note: this is styling of already-sanitised output; it introduces no new
  elements the user can trigger (links/media boundaries stay as specified in skills-view sequence D
  and the AGENTS.md link-interception invariant).
- E9 A container that hosts a rendered-markdown body (the artifact reader overlay today) must not
  restyle the headings inside the rendered body with its own chrome-heading rules; the same applies
  to any future container that starts hosting markdown.

**Sequence F: scrollbars** (the user scrolls any list, page, drawer or code block, with a mouse or a
trackpad, in light or dark)

- F1 A Mac with a mouse connected, where macOS would draw a classic scrollbar with a track, and a
  trackpad-only Mac, where it would draw an overlay scrollbar that hides when idle: both show the same
  6px thumb on no track, shown whenever the content overflows (appearance::REQ-001/AC-01..AC-03).
- F2 macOS's "Show scroll bars" setting (automatically, when scrolling, always) does not change the
  scrollbar the app draws.
- F3 An area that scrolls both ways (a wide table, a long code block): two 6px scrollbars, and their
  meeting corner shows the surface beneath (appearance::REQ-001/AC-02).
- F4 Switching light/dark, by the mode control or by the system while following it, recolours every
  visible thumb at once, with no reload (sequence B); switching the theme leaves the thumbs as they are
  (appearance::REQ-001/AC-04, C2).
- F5 Content that grows past its area (a rescan adds rows, a turn is expanded) gains a scrollbar, and
  content that shrinks back loses it, with no other change to the area (appearance::REQ-001/AC-03).
- F6 Dragging the thumb, clicking beside it where the track was, and wheel or keyboard scrolling behave
  as before; only the drawing changed.
- F7 The narrower scrollbar takes 6px where the classic one took 15px and the overlay one took none:
  layouts that measure their width (one-line labels, the cut of a search hit row, the session list's
  columns) keep their rules at the new width.
- F8 A scrolling area inside rendered markdown (a fenced code block, a wide table) and inside the file
  drawer and the overlays draws the same scrollbar: the rule covers the whole app, with no surface keeping
  the platform's.

**Cross-cutting**

- R1 Prefs: stored in the main process with IPC `getPrefs` / `setTheme` / `setMode` (one setter per
  preference, the same shape as language).  
- R2 Contract: theme and mode are each a three-value enum; a cross-process entry point receiving an
  unknown value refuses to write it, and reading the local file falls back **per field** on an unknown
  value.  
- R3 e2e: optionally assert the `data-theme` switch.  
- R4 Implementation colour values: purple = the current light/dark tables in `theme.css`; mist blue and
  amber brown = the light/dark tables already listed in the prototype.

## UI decisions

- **Entry point**: the rail's ⚙️ settings, the settings dimension.  
- **Settings page order**: the "Language" section first, "Appearance" second.  
- **Appearance section**: one card with two rows — "Mode" as a three-segment control + "Theme"
  as three palette cards (swatch + name, no full sentence), followed by an explanatory paragraph (the
  light/dark following rule, the two dimensions' independence, purple being the default).  
- **The section's closing explanation is plain text with no bold**: inline markup would need the
  sentence split into fragment keys maintained in every language, which conflicts with i18n's "rich
  text must not be assembled from fragment keys" convention and with ADR-0014's "the copy layer
  does not depend on React"; the paragraph already distinguishes the policy name from the prose with
  quotation marks.  
- A selection recolours the whole app immediately (including the rail's selected state), with no save
  button.  
- **Side badges share one tier**: every side's badge colour pair — the text on its background — sits at
  one lightness and chroma tier, so each side's badge text has its contrast in one band, in light and in
  dark.  
- The skill preview drawer's layout is still option A, see skills-view.  
- **Rendered-markdown heading ladder: the shape-layered direction**: hierarchy
  is carried by shape (h1 bottom rule, h2 left bar) and colour steps (accent-deep → accent →
  `--md-h3` → `--text-2`) with only a gentle size decrease. Values in
  sequence E.
- **Scrollbars**: a 6px thumb with 3px rounded ends, on no track,
  shown whenever the content overflows, in a neutral grey that follows light and dark but not the
  theme, darker under the pointer — values in appearance::REQ-001.

## Implementation Decisions

- Rendered markdown goes through **one carrier**: the sanitising exit and the link-interception
  invariant hold by construction, and a new render surface gets all of sequence E by using it. A
  surface with no in-app targets routes every relative link to the explicit out-of-scope notice.
- Each theme's palette is a block selected by the theme attribute on the document root, with its dark
  values in a `prefers-color-scheme: dark` block under it; the attribute is set at startup from the
  stored preference (`purple` when none), and components bind only to token names, with no theme
  branches.
### Light/dark is delivered by nativeTheme, with zero CSS changes

- The main process sets `nativeTheme.themeSource = 'system' | 'light' | 'dark'` from the preference.
  Electron officially defines this property's mapping to the three "Follow OS / Light / Dark" states,
  and setting it to `light`/`dark` **directly changes how `prefers-color-scheme` evaluates**, so the
  existing media queries follow along without being rewritten; on macOS the window chrome and the
  native menu follow too.
  **Confirmed by measurement** (2026-08-08): with `themeSource='dark'` /
  `shouldUseDarkColors=true` on the main process side, the renderer's
  `matchMedia('(prefers-color-scheme: dark)').matches` is `true` and the body background takes the
  dark table's value.
- **The preference's values are deliberately named the same as `themeSource`'s three states, so the
  mapping is the identity**.
- **On a switch, set `themeSource` before persisting**, the same rule as the theme (sequence
  A2) and language. On a persistence failure (a full or
  read-only disk) the switch still takes effect and lasts until the app restarts, then goes back to
  the on-disk value.
- `themeSource` must be set before the window's content renders, to avoid a first-frame light/dark
  jump.
- If the renderer needs to know the current effective light/dark (for the palette preview samples), it
  reads `matchMedia('(prefers-color-scheme: dark)')` — which follows `themeSource` changes and whose
  `change` event can be listened to.
- Preference storage: `mode` shares a table with `theme` and `language`; an invalid single field
  degrades only that field.

### Scrollbars are drawn by the app

- Every element's scrollbar is drawn through WebKit's scrollbar pseudo-elements, with no
  per-component rule: the scrollbar, the track, the corner, the thumb and its hover
  state. The thumb's two colours are tokens with a light and a dark declaration and none per theme (C2).
- Measured in the app's Electron 43 window: with no rule, a 15px classic scrollbar with a light
  track in dark; declaring a dark `color-scheme` turns that track dark but keeps its 15px and the
  track; the standard `scrollbar-width: thin` with `scrollbar-color` gives a transparent track but
  an 11px gutter the engine sets, with no hover state; the drawn scrollbar is exactly as specified.
  A drawn scrollbar replaces macOS's overlay one, which is why the thumb does not hide when idle
  (F1): in Chromium's source, an element with scrollbar pseudo-element styles gets a custom
  scrollbar, which is never an overlay one, whatever the platform uses (read 2026-10-23 on
  Chromium's main branch), and measured: launched with macOS's per-process scroll bar setting (the
  `-AppleShowScrollBars` argument, which macOS reads for that process only) at "when scrolling" (the
  overlay style) and at "always", the app's list keeps its 6px scrollbar. The hover shade can be
  observed on macOS only: on Linux a synthetic pointer on the thumb reaches the page but Chromium
  does not take the scrollbar as hovered (measured 2026-10-23).
- The corner needs its own rule: left out, it stays a light square where two scrollbars meet.
- No element sets the standard `scrollbar-width` or `scrollbar-color`: Chromium then ignores the
  pseudo-element rule for that element and draws the platform's scrollbar instead.

## Out of Scope

- A fourth theme, custom colours, a theme marketplace.  
- Switching light/dark automatically by time (sunrise/sunset or a schedule).  
- Changing the provider colours, or binding the side badges into the theme.  
- Coupling with skill business logic (only tokens are shared).  
- **A thumb that shows only while scrolling**, as macOS's overlay scrollbars do: a drawn scrollbar
  cannot hide on its own, and showing it on scroll would take a script on every scrolling area; the
  thumb shows whenever the content overflows instead (appearance::REQ-001/AC-03).  
- **Native form controls in dark** (the platform's own pickers and inputs): declaring a colour scheme
  is not part of the scrollbar change.  
- **The landing page's scrollbars**: the site is a project of its own.  
- **Cleaning up the 4 sets of dead `:root[data-theme]` rules in `theme.css`**: the evidence is
  conclusive (no code has ever set that attribute, so they are never triggered), but deleting them touches four non-adjacent regions
  of `theme.css` and does not overlap this change surface (the settings page + the main process's
  `themeSource`), so per "existing dead code is raised, not deleted, by default" they stay. A separate
  ticket has been filed to clean them up (carrying the full proof required to authorise deletion and
  the acceptance criteria).

## Further Notes

- **Prototype gate (the three-theme part): passed** (2026-08-06). Confirmed: settings as the third
  dimension ⚙️; a selection recolours the whole app with no save button; all three have dark tables;
  CC/CX semantic colours do not change hue with the theme.  
- **Prototype gate (the heading ladder): passed** (2026-08-19). Confirmed against a side-by-side
  rendering of both surfaces with the same fixture (h3→body→h4, h3/h4 with no body between, wrapped
  long headings, h5/h6 tail), across 3 themes × light/dark. The shape-layered direction won; the
  conclusions are inlined into sequence E and "UI decisions".  
- **Prototype gate (code styling): passed** (2026-08-19). The same side-by-side page showed the
  drawer's dark terminal-style block against the document card's paper inset; the paper form was
  chosen for both surfaces (E7b).  
- **Prototype gate (light/dark mode + the compact layout): passed** (2026-08-08). Confirmed: the mode
  three-segment control (follow system / light / dark); appearance compressed into one card with two
  rows; the palette cards **lose their full-sentence descriptions**, keeping only swatch + name, with
  "purple is the default" moved into the section's closing explanation; palette samples following the
  effective light/dark. The conclusions are inlined into "UI decisions"; persistent documents do not
  carry pointers to prototype paths.  
- **Prototype gate (scrollbars): passed** (2026-10-23). Confirmed on every app page of the prototypes,
  in light and dark: the 6px thumb on no track, always shown on overflow, the neutral grey and its hover
  shade. The conclusions are inlined into appearance::REQ-001 and "UI decisions".  
- 3 themes × 2 effective light/dark = **6 states** to test by hand, plus the following/locking matrix
  of 3 modes × 2 system appearances.  
- The prototype simulated light/dark switching with `data-theme` because of its carrier's limits (there
  is no Electron in a browser); **that approach does not enter the implementation** — the
  implementation goes through `nativeTheme.themeSource`.
