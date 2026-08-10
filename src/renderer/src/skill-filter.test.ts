import { describe, expect, test } from 'vitest'
import { filterByName, matchesName, normalizeKeyword } from './skill-filter'

describe('normalizeKeyword (what counts as "the user typed nothing")', () => {
  test('trims and lowercases; whitespace-only is the same as empty', () => {
    expect(normalizeKeyword('  Review  ')).toBe('review')
    expect(normalizeKeyword('')).toBe('')
    // Spec E4: whitespace alone filters nothing rather than matching nothing — a user who hits space by
    // accident should not be told the library is empty
    expect(normalizeKeyword('   ')).toBe('')
    expect(normalizeKeyword('\t\n ')).toBe('')
  })

  test('inner whitespace is left alone — it is part of what was typed, not padding', () => {
    expect(normalizeKeyword(' a b ')).toBe('a b')
  })
})

describe('matchesName (spec E1–E4: a case-insensitive plain substring over the name)', () => {
  test('an empty keyword matches everything, so an empty box filters nothing', () => {
    expect(matchesName('github-ops', '')).toBe(true)
    expect(matchesName('', '')).toBe(true)
  })

  test('case-insensitive in both directions', () => {
    expect(matchesName('github-ops', 'GITHUB')).toBe(true)
    expect(matchesName('GitHub-Ops', 'github')).toBe(true)
  })

  test('matches anywhere in the name, not just at the start', () => {
    expect(matchesName('grill-with-docs', 'docs')).toBe(true)
    expect(matchesName('grill-with-docs', 'with')).toBe(true)
  })

  test('a substring, never a subsequence — `gwd` must not reach `grill-with-docs`', () => {
    // This is the whole difference between what was chosen and fuzzy matching. If it ever starts
    // passing, the rule silently became fuzzy and the result order needs explaining (see Out of Scope).
    expect(matchesName('grill-with-docs', 'gwd')).toBe(false)
    expect(matchesName('review-code', 'rc')).toBe(false)
  })

  test('not word-split: a space is an ordinary character to match, not an AND', () => {
    expect(matchesName('chrome-devtools-mcp:a11y-debugging', 'chrome a11y')).toBe(false)
    expect(matchesName('my skill', 'my skill')).toBe(true)
  })

  test('regex metacharacters are matched literally, never compiled', () => {
    // A name containing `.` or `[` is ordinary on disk. If these were compiled, `.` would match any
    // character and `[` would throw — one silently over-matches, the other crashes the list.
    expect(matchesName('a.b', 'a.b')).toBe(true)
    expect(matchesName('axb', 'a.b')).toBe(false)
    expect(matchesName('skill[1]', '[1]')).toBe(true)
    expect(matchesName('anything', '[')).toBe(false)
    expect(matchesName('a+b', 'a+b')).toBe(true)
    expect(matchesName('ab', 'a+b')).toBe(false)
  })

  test("a plugin entry's namespace prefix is part of its name (spec E3)", () => {
    expect(matchesName('superpowers:brainstorming', 'brain')).toBe(true)
    expect(matchesName('superpowers:brainstorming', 'superpowers')).toBe(true)
    expect(matchesName('superpowers:brainstorming', ':brain')).toBe(true)
  })

  test('the keyword is normalised on the way in, so a padded keyword still matches', () => {
    expect(matchesName('github-ops', '  GITHUB  ')).toBe(true)
    expect(matchesName('github-ops', '   ')).toBe(true)
  })

  test('names with non-Latin characters and emoji are matched as ordinary text', () => {
    // Names are directory names on disk, so nothing constrains them to ASCII
    expect(matchesName('スキル-テスト', 'テスト')).toBe(true)
    expect(matchesName('skill-🚀-launch', '🚀')).toBe(true)
  })
})

describe('filterByName (narrowing a list of rows)', () => {
  const rows = [
    { name: 'github-ops' },
    { name: 'review-code' },
    { name: 'review-tests' },
    { name: 'superpowers:brainstorming' }
  ]

  test('keeps the matching rows in their original order', () => {
    // Order matters: the lists are already sorted upstream, and filtering must not reshuffle them
    expect(filterByName(rows, 'review').map((r) => r.name)).toEqual(['review-code', 'review-tests'])
  })

  test('an empty or whitespace-only keyword returns everything', () => {
    expect(filterByName(rows, '')).toHaveLength(4)
    expect(filterByName(rows, '   ')).toHaveLength(4)
  })

  test('nothing matched yields an empty list rather than the original', () => {
    // The caller distinguishes "no matches" from "nothing here" by this being empty, so returning the
    // unfiltered list on a miss would show the full library under a "no match" heading
    expect(filterByName(rows, 'zzz')).toEqual([])
  })

  test('does not mutate or alias the input', () => {
    const out = filterByName(rows, '')
    out.pop()
    expect(rows).toHaveLength(4)
  })
})
