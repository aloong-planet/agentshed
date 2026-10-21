// Plural selection, and the module-graph property that makes it usable from inside a dictionary.
//
// **This file must not import `./index`, and `./en` must stay the first dictionary import below.**
// Both constraints are load-bearing, and neither is obvious:
//
//   - The defect pinned here is a circular import. `index.ts` imports every dictionary, so a dictionary that
//     imports a *value* back from `index.ts` can only be loaded through `index.ts`. Importing `./index`
//     first would populate the module cache and hide exactly that.
//   - The cycle only bites when the dictionary is the **entry point of the module graph**. `en.ts` calls
//     `plural()` inside arrow functions, never at module scope, so evaluating `en.ts` needs only the
//     binding, which ESM hoisting supplies. The breakage comes from the *other* direction: `en.ts` →
//     `index.ts` → `const DICTS = { zh, en }` at module scope, reading `en` before it is initialised.
//     Import anything that pulls in `index.ts` ahead of `./en` and `index.ts` finishes first, the cycle
//     resolves, and this file passes with the cycle fully intact.
//
// The surfaced symptom differs by runtime, so do not match on the message: under a plain ESM runtime it is
// `ReferenceError: Cannot access 'en' before initialization`, while vitest's transform degrades it to
// `DICTS.en === undefined`. Since `plural()` takes the bare language code it reads no dictionary, so under
// vitest nothing trips over that `undefined` by itself: the last case below asks `index.ts` for the
// dictionary, which is what goes red (measured 2026-10-21 by planting the cycle in `en.ts`).
import { describe, it, expect } from 'vitest'
import { en } from './en'
import { plural } from './plural'

describe('a dictionary is loadable on its own', () => {
  it('importing ./en directly does not throw', () => {
    // en.ts is the dictionary that calls plural(), so it is the one a cycle can catch. Before plural moved to
    // its own leaf module, loading a dictionary this way threw
    // `ReferenceError: Cannot access '…' before initialization`.
    expect(en.languageName).toBe('English')
    expect(typeof en.projects.staleFiltered).toBe('function')
  })

  it('a dictionary loaded on its own can still evaluate its plural forms', () => {
    // Reaching a real plural() call through the dictionary, not just importing the module: the cycle bites
    // at call time as well as load time.
    expect(en.projects.staleFiltered(1)).toBe('1 stale project filtered out')
    expect(en.projects.staleFiltered(2)).toBe('2 stale projects filtered out')
  })

  it('the layer then serves the same dictionary', async () => {
    // Loaded only now, after ./en, so the module cache cannot hide a cycle: had en.ts pulled index.ts in
    // while it was still initialising, index.ts would hold an undefined entry for it.
    const { dictOf } = await import('./index')
    expect(dictOf('en')).toBe(en)
  })
})

describe('plural', () => {
  // Expectations come from measuring Intl.PluralRules, not from memory.
  const forms = { one: 'session', other: 'sessions' }

  it('English takes the singular for 1 and the plural for 0 and 2', () => {
    expect(plural('en', 1, forms)).toBe('session')
    expect(plural('en', 0, forms)).toBe('sessions')
    expect(plural('en', 2, forms)).toBe('sessions')
  })

  it('Chinese has no plural inflection and always uses other', () => {
    expect(plural('zh', 1, { other: ' sessions' })).toBe(' sessions')
    expect(plural('zh', 5, { other: ' sessions' })).toBe(' sessions')
  })

  it('a form the caller did not supply falls back to other', () => {
    expect(plural('en', 1, { other: 'x' })).toBe('x')
  })
})
