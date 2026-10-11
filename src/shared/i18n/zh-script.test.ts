// The source dictionary stays Chinese.
//
// Every other guard on the dictionaries is blind to a zh value being translated away: typecheck only pins the
// key set (the values are typed `string`), scripts/check-lang.mjs only stops Chinese from *entering* the
// repository, and scripts/check-i18n.mjs allow-lists the dictionaries outright. A blanket English conversion
// that also rewrote `installTo: '安装到…'` as 'Install to…' passed all of them and every unit test. This file
// is the guard pointing the other way: a zh value must contain Chinese characters, and the few that
// legitimately do not are pinned to their exact value, so changing one of those goes red as well.
//
// Function values are copy too — their Chinese lives in the template they return — so they are called rather
// than skipped; the sweep in ./distinctions.test.ts drops them, and reusing it here would leave them unguarded.
import { describe, it, expect } from 'vitest'
import { zh } from './zh'

const HAN = /\p{Script=Han}/u

/**
 * zh values that are correct without a Chinese character, each pinned to its exact value — for a function,
 * its output under the numeric probe in leaves()
 */
const NOT_HAN: Record<string, { value: string; why: string }> = {
  languageNameEn: { value: 'Chinese (Simplified)', why: "the language's English name, by definition" },
  htmlLang: { value: 'zh-CN', why: 'a BCP 47 tag, not copy' },
  'rail.agents': { value: 'Agents', why: 'product term kept in English in every language' },
  'rail.projects': { value: 'Projects', why: 'product term kept in English in zh and ja' },
  'detail.tabSkills': { value: 'Skills', why: 'product term kept in English in every language' },
  'detail.tabMcp': { value: 'MCP', why: 'protocol name' },
  'turn.typeSeparator': { value: '、', why: 'the Chinese enumeration comma — punctuation, not a Han character' },
  'session.parentTitle': { value: '《2》', why: 'only the Chinese title marks around the title' },
  'token.byModelIn': { value: '2 · 2', why: 'only a separator between two interpolated values' }
}

/**
 * Every leaf as [path, rendered text]. A function is called with numeric arguments: a number interpolates into
 * a string slot as readily as into a count slot, and the probe only needs the fixed Chinese around the slots.
 */
function leaves(o: object, path = ''): Array<[string, string]> {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]): Array<[string, string]> => {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'string') return [[p, v]]
    if (typeof v === 'function') {
      const fn = v as (...args: number[]) => unknown
      return [[p, String(fn(...Array<number>(fn.length).fill(2)))]]
    }
    if (v && typeof v === 'object') return leaves(v, p)
    throw new Error(`${p}: unexpected ${typeof v} in the dictionary`)
  })
}

describe('the zh dictionary stays Chinese', () => {
  const all = leaves(zh)

  it('every value contains a Chinese character, or is pinned in NOT_HAN', () => {
    const translated = all.filter(([p, s]) => !(p in NOT_HAN) && !HAN.test(s))
    expect(translated, 'zh values without Chinese — translated by mistake, or add them to NOT_HAN with a reason').toEqual([])
  })

  it('every NOT_HAN entry still exists and still has exactly its pinned value', () => {
    const got = Object.fromEntries(all)
    for (const [p, { value }] of Object.entries(NOT_HAN)) {
      expect(got[p], `${p}: pinned as ${JSON.stringify(value)}`).toBe(value)
    }
  })

  it('function values were rendered, not skipped', () => {
    // Without this the sweep could silently shrink to the string leaves and stay green
    const fns = all.filter(([p]) => {
      const v = p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], zh)
      return typeof v === 'function'
    })
    expect(fns.length).toBeGreaterThan(0)
  })
})
