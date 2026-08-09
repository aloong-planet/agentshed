// The merge rule for preference backfilling (issue #61).
//
// The `getPrefs()` issued at mount reads the disk state **at that moment**. If the user changes a
// preference before it resolves,
// an unconditional backfill pushes the new choice back to the old value — leaving the control and the
// value actually in effect out of step,
// with no self-healing. It is extracted as a pure function to make the rule testable: React components
// themselves are not unit tested per ADR-0002.
import type { Prefs } from '@shared/prefs'

/** Preference field names. Derived with keyof rather than written out again as literals, so adding a
 * field to Prefs updates this automatically */
export type PrefKey = keyof Prefs

/**
 * Only fields the user has not changed by hand take the echo.
 *
 * **Judged per field, not with a single flag**: when the user changed only the mode, the colour scheme
 * and language in the echo are still correct,
 * and skipping the whole thing would leave those two stuck at their defaults.
 *
 * Compared with having no guard, the coarse-grained version has **exactly the same trigger condition**
 * (the user has to click before the echo either way),
 * and differs only in blast radius: with no guard 1 field is overwritten (the one just clicked), while
 * coarse-grained loses 2
 * (the two untouched fields stay at their defaults, and the whole app renders in the default colour
 * scheme). Saving one at the cost of two
 * makes it not "a different trade-off" but strictly worse.
 *
 * The three fields are written out one by one rather than iterating keys: when a field is added to Prefs,
 * this fails typecheck on the missing property,
 * whereas an iterating version would silently miss it.
 */
export function backfillPrefs(
  local: Prefs,
  incoming: Prefs,
  touched: ReadonlySet<PrefKey>
): Prefs {
  return {
    scheme: touched.has('scheme') ? local.scheme : incoming.scheme,
    language: touched.has('language') ? local.language : incoming.language,
    mode: touched.has('mode') ? local.mode : incoming.mode
  }
}
