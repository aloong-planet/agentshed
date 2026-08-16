# Appearance

> Related: [features](../features/appearance.md) · app-wide UI tokens; artifact markdown follows the accent  
> Two orthogonal dimensions: **mode** (follow system / light / dark, defaulting to follow system) ×
> **theme** (purple (default) / mist blue / amber brown).  
> The final look = f(theme, effective light/dark); the settings page shares one preferences
> table with language, see [i18n](i18n.md).
>
> **On the naming**: the two dimensions are *appearance* and *theme* (see CONTEXT for why —
> `prefers-color-scheme` and SwiftUI's `ColorScheme` both already mean light/dark, so "colour scheme"
> was naming the wrong axis). Prose and code now agree, down to the persisted key. The rename shipped
> without reading the old `scheme` key, so an existing choice falls back to purple once on upgrade —
> a deliberate call, not a missing migration.

## Problem Statement

The app needs to follow macOS's light/dark mode and let the user choose between several UI accent /
paper feels. The existing `theme.css` already does light/dark with CSS variables and
`prefers-color-scheme`, but only in a fixed brand purple. The user wants to keep **the shipped
default purple** and add reading-oriented themes such as **mist blue and amber brown**; a switch
must apply to **the whole app** (rail, lists, detail, drawers, the future skill preview and so on)
rather than being a partial skin.

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
  is forbidden. Semantic colours (CC/CX, provider, ok/err) do not change hue with the theme.

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
4. As a user, I want the side badges (CC/CX) and the provider chart colours not to jump around with
   the theme, so that semantic colours stay recognisable.  
5. As a developer, I want a new UI to bind only to token names, so that adding a theme does not
   require changing components.

## Failure modes and boundaries

**Sequence A: selection and persistence**

- A1 The default theme = **`purple`** (a fresh install with no storage file looks like the shipped
  build).  
- A2 The user changes to `blue` / `amber` / back to `purple` → set
  `document.documentElement.dataset.theme` immediately and write atomically to userData.  
- A3 On restart the theme is read back; an invalid value or a corrupt file → fall back to
  **`purple`**, no crash.  
- A4 Storage = the app's own file in `userData` (written atomically — a temporary file + rename, so
  an interruption leaves no half file; **never written to the agent configuration**). Field:
  `theme: "purple"|"blue"|"amber"`.  
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
  and the preview's `--md-*` (where landed).  
- C2 **Does not follow the theme** (semantic / data colours; may have light/dark, identical across
  the three themes):  
  - the CC/CX side badge tokens  
  - the provider `--p-*`  
  - `--ok-*` / `--err-*` / warn semantics (brightness may be nudged where it clashes with a theme's
    paper feel, but the hue is not bound to the theme)  
- C3 Local styles with hard-coded hex in `theme.css` → pulled into tokens, so no colour is missed when
  the theme changes.  
- C4 Skill preview and artifact markdown: headings, links and so on follow the `--accent` family and
  match the current theme.

**Sequence D: the settings entry point**

- D1 The rail's **third dimension, "Settings"** (`Dim = agents | projects | settings`).  
- D2 Switching to settings makes the main area the settings page.  
- D3 The settings page's "Appearance" section is **one card with two rows**: the top row "Mode" = a
  three-segment control (follow system / light / dark), the bottom row "Theme" = three
  palette cards. The two rows are joined by a divider, with the label on the left and the control on
  the right, in the same form as the "Language" section.  
- D3a The palette cards are compact: **a swatch plus a name**, with no full sentence of description;
  the "purple is the default" information moves into the explanatory text below the section.  
- D4 The refresh button stays in the rail's bottom area, grouped with the settings entry point.  
- D5 A selection takes effect immediately, with no save button.  
- D6 Entering and leaving settings does not lose the `selected` project.

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

- **Entry point**: the rail's ⚙️ settings, the third dimension.  
- **Settings page order**: the "Language" section first, "Appearance" second.  
- **Appearance section**: one card with two rows — "Mode" as a three-segment control + "Theme"
  as three palette cards (swatch + name, no full sentence), followed by an explanatory paragraph (the
  light/dark following rule, the two dimensions' independence, purple being the default).  
- **The section's closing explanation is plain text with no bold** (settled in ticket 04 on 2026-08-08,
  a deliberate deviation from the prototype): the prototype bolded the words "follow system", but for a
  dictionary entry to carry inline markup the whole sentence would have to be split into three
  fragment keys maintained in six languages — which conflicts with i18n's "rich text must not be
  assembled from fragment keys" convention and with ADR-0014's "the copy layer does not depend on
  React". Breaking the copy layer's shape for one decorative bold is not worth it; the paragraph
  already distinguishes the policy name from the prose with quotation marks.  
- **The Language and Appearance sections share one set of row-form class names** (card container + row
  + left-hand label) rather than each writing its own: the two sections are the same form, and writing
  them separately would store the same styles twice, so changing one would inevitably miss the other.  
- The segmented control reuses the existing `.seg` form (outer frame + overflow clipping + an
  accent-soft selected state), sized slightly larger than its use in the chart toolbar to suit the
  settings page context.  
- A selection recolours the whole app immediately (including the rail's selected state), with no save
  button.  
- Palette samples come in two sets by effective light/dark, so the preview is what you get.  
- The skill preview drawer's layout is still option A, see skills-view.

## Implementation Decisions

- CSS: `html[data-theme="purple"|"blue"|"amber"]` plus a `@media (prefers-color-scheme: dark)` under
  each theme.  
- Set `data-theme` at startup, defaulting to `purple`.  
- Components have zero theme branches and write only `var(--accent)` and the like.  

### Light/dark is delivered by nativeTheme, with zero CSS changes

- The main process sets `nativeTheme.themeSource = 'system' | 'light' | 'dark'` from the preference.
  Electron officially defines this property's mapping to the three "Follow OS / Light / Dark" states,
  and setting it to `light`/`dark` **directly changes how `prefers-color-scheme` evaluates**, so the
  existing media queries follow along without being rewritten; on macOS the window chrome and the
  native menu follow too.
  **Confirmed by measurement** (ticket 04, 2026-08-08): with `themeSource='dark'` /
  `shouldUseDarkColors=true` on the main process side, the renderer's
  `matchMedia('(prefers-color-scheme: dark)').matches` is `true` and the body background takes the
  dark table's value.
- **The preference's values are deliberately named the same as `themeSource`'s three states, so the
  mapping is the identity**; if the two value domains ever diverge, typecheck must catch it. The
  crucial detail: the interface receiving the assignment declares the property's type as
  `NativeTheme['themeSource']` and **not** as our own `AppearanceMode` — the latter looks equivalent
  and **measurably guards nothing**: an object property's assignability is covariant, so the wider
  `AppearanceMode` still satisfies the interface and `nativeTheme` passes without a word. With
  Electron's type, that assignment becomes "writing into Electron's value domain", the assignment is
  an invariant check, and any extra value reports `TS2322`.
- **On a switch, set `themeSource` before persisting**, the same rule as the theme (sequence
  A2) and language. The order matters: written the other way round, a persistence failure (a full or
  read-only disk) would throw before `themeSource` is set, so the renderer would have optimistically
  ticked the chosen mode while the UI did not change — the notice says it failed and the UI does not
  move either, a double frustration. In the current order a failure loses only the persistence — it
  works for this session and reverts to the on-disk value after a restart.
- **Explicitly not adopted**: having the renderer compute light/dark itself and write a DOM attribute
  (such as `data-theme`). That would require every dark value to be written twice, once in the media
  query block and once in the manual override block (3 themes × 2 = 6 duplicated sets, so a colour
  change would inevitably miss one), it could not reach the window chrome, and it would add another
  first-frame flicker risk.
- `themeSource` must be set before the window's content renders, to avoid a first-frame light/dark
  jump.
- If the renderer needs to know the current effective light/dark (for the palette preview samples), it
  reads `matchMedia('(prefers-color-scheme: dark)')` — which follows `themeSource` changes and whose
  `change` event can be listened to.
- Preference storage: `mode` shares a table with `theme` and `language`, reusing the existing atomic
  write and degradation strategy; an invalid single field degrades only that field.

**A leftover finding (outside this change surface)**: `theme.css` has 4 sets of
`:root[data-theme='dark'|'light']` rules (mark / question locating / risk banner / in-turn warning),
and excluding `theme.css` itself, the whole of git history proves no code has ever set that attribute
— they are **dead code**. Adopting the `nativeTheme` approach leaves them still untriggered. The
recommended handling is in "Out of Scope".

## Testing Decisions

- Prefs: `theme` defaults to `purple`, `mode` defaults to `system`; three-value read/write, and
  fallback on corruption or an invalid value; **an invalid single field does not drag down the
  others**.  
- Deriving the effective light/dark is a pure function (`mode` + system appearance → `light|dark`),
  covering the locked / following / switching-back paths.  
- IPC validation.  
- The `data-theme` switch (a light test).  
- No pixel testing.  
- **Read before writing a light/dark e2e**: Playwright's `electron.launch` **emulates
  `prefers-color-scheme: light` by default**, which pins the media query, so a `themeSource` change
  never reaches the renderer. A light/dark test case must pass `colorScheme: null` to remove the
  emulation (the `'no-override'` the docs also mention works at runtime but is not in this version's
  type union, so typecheck goes red). **This was hit once**: the main process side was already dark
  while the renderer's media query was still light, which looked like the implementation not working
  and was actually the test harness masking it. Other cases keep the default emulation, so results do
  not vary with the system appearance of whoever runs the tests.
- **Assert light/dark in both directions** (locked dark → matches dark, locked light → matches light).
  Asserting one direction only gives a **tautological pass** to the half of people whose development
  machine's system appearance happens to match — this repository's development machine is dark, and in
  the mutation check the "locked dark" assertion was indeed tautological; what actually caught the
  mutation was the "locked light" one.
- **The palette sample assertion targets only the paper sample (the first swatch)**, not "no sample is
  near-white in dark mode": the fourth swatch takes `--text`, which *should* be near-white in dark
  mode, so the literal version would be a guaranteed false positive.
- **A known test gap (no fake greens)**: `nativeTheme.themeSource`'s effect on the window chrome and
  the macOS native menu is system-drawn and cannot be tested by automation; what is testable is "the
  property was set" and "the renderer's media query changed accordingly", while the actual appearance
  of the menu and the chrome can only be accepted by hand. The former must not be passed off as the
  latter.
- **Also not automated**: "after locking, later system appearance changes do not affect the UI". The
  test environment cannot change the real system appearance, and using `themeSource` itself to
  simulate a "system change" is circular — it tests the value we just set. Filed as evidence; do not
  "add the missing test case".

## Out of Scope

- A fourth theme, custom colours, a theme marketplace.  
- Switching light/dark automatically by time (sunrise/sunset or a schedule).  
- Changing the provider brand colours, or binding CC/CX into the theme.  
- Coupling with skill business logic (only tokens are shared).  
- **Cleaning up the 4 sets of dead `:root[data-theme]` rules in `theme.css`**: the evidence is
  conclusive (see the implementation decisions), but deleting them touches four non-adjacent regions
  of `theme.css` and does not overlap this change surface (the settings page + the main process's
  `themeSource`), so per "existing dead code is raised, not deleted, by default" they stay. A separate
  ticket has been filed to clean them up (carrying the full proof required to authorise deletion and
  the acceptance criteria).

## Further Notes

- **Prototype gate (the three-theme part): passed** (2026-08-06). Confirmed: settings as the third
  dimension ⚙️; a selection recolours the whole app with no save button; all three have dark tables;
  CC/CX semantic colours do not change hue with the theme.  
- **Prototype gate (light/dark mode + the compact layout): passed** (2026-08-08). Confirmed: the mode
  three-segment control (follow system / light / dark); appearance compressed into one card with two
  rows; the palette cards **lose their full-sentence descriptions**, keeping only swatch + name, with
  "purple is the default" moved into the section's closing explanation; palette samples following the
  effective light/dark. The conclusions are inlined into "UI decisions"; persistent documents do not
  carry pointers to prototype paths.  
- 3 themes × 2 effective light/dark = **6 states** to test by hand, plus the following/locking matrix
  of 3 modes × 2 system appearances.  
- The prototype simulated light/dark switching with `data-theme` because of its carrier's limits (there
  is no Electron in a browser); **that approach does not enter the implementation** — the
  implementation goes through `nativeTheme.themeSource`.
