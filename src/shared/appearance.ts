// Appearance: **mode** (light/dark) × **colour scheme** (accent / paper feel), two orthogonal
// dimensions. See docs/specs/appearance.md.

export const APPEARANCE_SCHEMES = ['purple', 'blue', 'amber'] as const
export type AppearanceScheme = (typeof APPEARANCE_SCHEMES)[number]

export const DEFAULT_SCHEME: AppearanceScheme = 'purple'

export function isAppearanceScheme(v: unknown): v is AppearanceScheme {
  return typeof v === 'string' && (APPEARANCE_SCHEMES as readonly string[]).includes(v)
}

/**
 * Appearance mode: the user's preference for a light or dark UI.
 *
 * `'system'` is structurally identical to the language preference's "follow system" — a **continuously
 * applied policy, not a snapshot of
 * the light/dark at the moment of selection**; choosing light or dark locks it and later system
 * appearance changes have no effect. What it and the system appearance together decide,
 * the **effective light/dark**, is what actually renders, and it is never persisted itself.
 *
 * The values are deliberately named the same as Electron `nativeTheme.themeSource`'s three states, so
 * the mapping is the identity;
 * typecheck catches it if the two value domains ever diverge — the mechanism is in
 * src/main/appearance-mode.ts.
 */
export const APPEARANCE_MODES = ['system', 'light', 'dark'] as const
export type AppearanceMode = (typeof APPEARANCE_MODES)[number]

export const DEFAULT_MODE: AppearanceMode = 'system'

export function isAppearanceMode(v: unknown): v is AppearanceMode {
  return typeof v === 'string' && (APPEARANCE_MODES as readonly string[]).includes(v)
}

// The schemes' display names moved into the i18n dictionaries along with the rest of the UI copy
// (settings.scheme*),
// so no single-language label table is kept here — it lost its only consumer in that change.

// Assembling the preferences and validating them across processes is in ./prefs — this file covers only
// appearance itself.
