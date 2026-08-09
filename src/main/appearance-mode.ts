// Where appearance mode lands: the preference → Electron's nativeTheme.themeSource.
//
// **Why nativeTheme rather than having the renderer compute light/dark itself and write a DOM
// attribute**: setting themeSource to
// light or dark directly changes how `prefers-color-scheme` evaluates, so the existing media queries
// follow along with **zero changes**,
// and the macOS window chrome and native menu follow too. Computing it ourselves would require every
// dark value to be written twice, once in the media query block
// and once in the manual override block (3 schemes × 2 = 6 duplicated sets, so a colour change would
// inevitably miss one), and it could not reach the window chrome.
// See docs/specs/appearance.md, "Light/dark is delivered by nativeTheme, with zero CSS changes".
//
// Note: the `:root[data-theme]` rules still in theme.css are **dead code** (the whole of git history
// proves no code has ever
// set that attribute); they are not a hook for this path, so do not use them as a model for computing
// light/dark in the renderer — a separate task exists to clean them up.
import type { NativeTheme } from 'electron'
import type { AppearanceMode } from '@shared/appearance'

/**
 * nativeTheme's minimal contract: this module uses only the one writable property, themeSource.
 *
 * Narrowed to an interface rather than using `nativeTheme` directly so that this assignment can be
 * driven by unit tests **without pulling in Electron**
 * (ADR-0002: main process logic stands on an injectable seam). The import above is **type-only**,
 * fully erased after compilation, so tests never actually load electron.
 *
 * The property type is deliberately taken from `NativeTheme['themeSource']` and **not** written as
 * `AppearanceMode`:
 * the assignment below is therefore "writing an AppearanceMode into Electron's value domain", which is
 * an **invariant** check,
 * so one extra AppearanceMode value that Electron does not have reports TS2322.
 * Writing `themeSource: AppearanceMode` looks equivalent and measurably **guards nothing** — an object
 * property's assignability is
 * covariant, so the wider AppearanceMode still satisfies the interface and `nativeTheme` passes without
 * a word.
 * (This was found by measurement: the comment was first written on the assumption that "same names
 * means safe", and when a fourth value was added as a mutation, typecheck still
 * exited 0 — which is how that comment was discovered to be wrong.)
 */
export interface ThemeSourceTarget {
  themeSource: NativeTheme['themeSource']
}

/**
 * Write the appearance mode preference into themeSource.
 *
 * **The responsibility boundary**: our job ends at setting themeSource correctly. Whether a system
 * appearance change then propagates to the UI is
 * Electron's and Chromium's responsibility and is outside the testable surface (the test environment
 * cannot change the real system appearance, and using
 * themeSource itself to simulate a "system change" is circular). The propagation is accepted by hand.
 */
export function applyAppearanceMode(target: ThemeSourceTarget, mode: AppearanceMode): void {
  target.themeSource = mode
}
