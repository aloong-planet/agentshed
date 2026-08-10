// Plural selection, and the module-graph property that makes it usable from inside a dictionary.
//
// **This file must not import `./index`, and `./ru` must stay the first dictionary import below.**
// Both constraints are load-bearing, and neither is obvious:
//
//   - The defect pinned here is a circular import. `index.ts` imports every dictionary, so a dictionary that
//     imports a *value* back from `index.ts` can only be loaded through `index.ts`. Importing `./index`
//     first would populate the module cache and hide exactly that.
//   - The cycle only bites when the dictionary is the **entry point of the module graph**. `ru.ts` calls
//     `plural()` inside arrow functions, never at module scope, so evaluating `ru.ts` needs only the
//     binding, which ESM hoisting supplies. The breakage comes from the *other* direction: `ru.ts` →
//     `index.ts` → `const DICTS = { …, ru, … }` at module scope, reading `ru` before it is initialised.
//     Import anything that pulls in `index.ts` ahead of `./ru` and `index.ts` finishes first, the cycle
//     resolves, and this file passes with the cycle fully intact — measured, not assumed.
//
// The surfaced symptom differs by runtime, so do not match on the message: under a plain ESM runtime it is
// `ReferenceError: Cannot access 'ru' before initialization`, while vitest's transform degrades it to
// `DICTS.ru === undefined` and it surfaces as a TypeError from `dictOf(...).htmlLang`. Same defect.
import { describe, it, expect } from 'vitest'
import { ru } from './ru'
import { fr } from './fr'
import { plural } from './plural'

describe('a dictionary is loadable on its own', () => {
  it('importing ./ru directly does not throw', () => {
    // ru.ts is the only dictionary that calls plural() at module scope, so it is the only one that can be
    // caught by a cycle. Before plural moved to its own leaf module this threw
    // `ReferenceError: Cannot access 'ru' before initialization`.
    expect(ru.languageName).toBe('Русский')
    expect(typeof ru.projects.staleFiltered).toBe('function')
  })

  it('a dictionary loaded on its own can still evaluate its plural forms', () => {
    // Reaching a real plural() call through the dictionary, not just importing the module: the cycle bites
    // at call time as well as load time.
    expect(ru.projects.staleFiltered(1)).toContain('устаревший')
    expect(ru.projects.staleFiltered(5)).toContain('устаревших')
    expect(fr.projects.staleFiltered(1)).not.toContain('obsolètes')
  })
})

describe('plural', () => {
  // Expectations come from measuring Intl.PluralRules, not from memory.
  const ruForms = { one: 'сессия', few: 'сессии', many: 'сессий', other: 'сессии' }

  it('Russian has four forms: 1=one, 2=few, 5=many, 21=one, 0=many', () => {
    expect(plural('ru', 1, ruForms)).toBe('сессия')
    expect(plural('ru', 2, ruForms)).toBe('сессии')
    expect(plural('ru', 5, ruForms)).toBe('сессий')
    expect(plural('ru', 21, ruForms)).toBe('сессия')
    expect(plural('ru', 0, ruForms)).toBe('сессий')
  })

  it('French uses the singular for 0 and English the plural — the same 0 differs by language', () => {
    const forms = { one: 'session', other: 'sessions' }
    expect(plural('fr', 0, forms)).toBe('session')
    expect(plural('en', 0, forms)).toBe('sessions')
    expect(plural('fr', 1, forms)).toBe('session')
    expect(plural('fr', 2, forms)).toBe('sessions')
  })

  it('Chinese and Japanese have no plural inflection and always use other', () => {
    expect(plural('zh', 1, { other: ' sessions' })).toBe(' sessions')
    expect(plural('zh', 5, { other: ' sessions' })).toBe(' sessions')
    expect(plural('ja', 5, { other: ' items' })).toBe(' items')
  })

  it('a form the caller did not supply falls back to other', () => {
    expect(plural('ru', 2, { other: 'x' })).toBe('x')
  })
})
