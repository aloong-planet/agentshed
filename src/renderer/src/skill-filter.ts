// Filtering the skills lists by name (2026-08-10).
//
// **A filter, not a search** (see CONTEXT's vocabulary entry): every name these lists display is already
// in the snapshot and the project-detail payload, so this narrows what is on screen without crossing IPC.
// The sessions search it sits next to is the other thing — it reads file contents on the main side.
//
// The rule lives here rather than inline in the two lists because it is the one thing they genuinely
// share; their surrounding shapes (one flat list, one five groups with counts) do not generalise, so no
// shared component was extracted around it.

/**
 * What the user typed, reduced to what matching cares about.
 *
 * Trimming makes whitespace-only input mean "nothing typed" rather than "match the space character" —
 * without it, brushing the space bar would empty the list and read as "there are no skills here".
 * Inner whitespace is left alone: it is part of what was typed, and the rule is a plain substring, so a
 * space is an ordinary character rather than a word separator.
 */
export function normalizeKeyword(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Does this name match what the user typed?
 *
 * A plain, case-insensitive **substring** — deliberately not a subsequence and not a regular expression.
 * `String.includes` gives both properties for free: no metacharacter can change what it matches, so a
 * skill directory called `a.b` or `skill[1]` behaves like any other name instead of over-matching or
 * throwing. Nothing here needs escaping precisely because nothing is ever compiled.
 *
 * An empty keyword matches everything, so callers can pass the raw box contents and get the unfiltered
 * list back without a special case at each site.
 */
export function matchesName(name: string, keyword: string): boolean {
  const needle = normalizeKeyword(keyword)
  return needle === '' || name.toLowerCase().includes(needle)
}

/** The shape both lists' rows share, as far as filtering is concerned */
interface NamedSkill {
  name: string
}

/**
 * Narrow a list of rows by name, preserving order.
 *
 * Filtering happens over the **already assembled** list, so it decides nothing about which rows exist:
 * the same-side same-name override and the plugin join are settled upstream and stay settled (spec E11).
 */
export function filterByName<T extends NamedSkill>(rows: readonly T[], keyword: string): T[] {
  const needle = normalizeKeyword(keyword)
  if (needle === '') return [...rows]
  return rows.filter((r) => matchesName(r.name, needle))
}
