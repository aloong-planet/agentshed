// Distinctions the source language draws that no target language may collapse.
//
// Every finding below came from the same failure mode: the translator saw two words that mean nearly the
// same thing in general usage and merged them — but in this product they name two different states, two
// different commands, or two different error codes. Collapsing them is not a style choice; it makes the UI
// unable to say something it is required to say.
//
// This runs over all six languages rather than the ones that happened to be wrong, because the next
// language added will have the same temptation and nothing else would catch it.
import { describe, it, expect } from 'vitest'
import { LANGUAGES, dictOf } from './index'
import type { Locale } from './types'

const MUST_DIFFER: Array<{ why: string; a: (d: Locale) => string; b: (d: Locale) => string }> = [
  {
    why: 'Zoom Out and Minimize are two different menu commands, in two different menus',
    a: (d) => d.menu.zoomOut,
    b: (d) => d.menu.minimize
  },
  {
    why: 'Zoom In and Zoom Out are opposites',
    a: (d) => d.menu.zoomIn,
    b: (d) => d.menu.zoomOut
  },
  {
    why: 'uninstalling a project-level copy is not deleting — the confirm dialog’s destructive button would otherwise read exactly like the trigger that opened it',
    a: (d) => d.detail.uninstall,
    b: (d) => d.detail.del
  },
  {
    why: 'an uninstall failure and a skill-delete failure are separate error codes; rendering them identically defeats the structured-error protocol (ADR-0015)',
    a: (d) => d.detail.uninstallFailed('E'),
    b: (d) => d.errors.skillDeleteFailed('E')
  },
  {
    why: '“not enabled” (never turned on) is not “disabled” (turned off) — CONTEXT.md requires a degraded judgement to match what the target agent actually does, and neither agent can tell us a switch was thrown',
    a: (d) => d.plugins.notEnabled,
    b: (d) => d.plugins.disabledShort
  },
  {
    why: 'fetching one turn’s byte range on demand is the product’s load-bearing claim, and is not the same as loading a view',
    a: (d) => d.session.fetching,
    b: (d) => d.session.loading
  },
  {
    why: 'a skill package’s entry point is not a tool call’s input',
    a: (d) => d.skills.tagEntry,
    b: (d) => d.turn.input
  }
]

describe('distinctions no language may collapse', () => {
  for (const { why, a, b } of MUST_DIFFER) {
    it(why, () => {
      for (const l of LANGUAGES) {
        const d = dictOf(l)
        expect(a(d), `${l} renders both as “${a(d)}”`).not.toBe(b(d))
      }
    })
  }
})

describe('one concept, one word', () => {
  // The opposite failure: the same concept rendered several different ways inside one language, so a user
  // cannot tell they are reading about the same thing.
  it('the artifacts tab, the empty state and the error all use the same root word', () => {
    // CONTEXT.md fixes the term as “artifact” — the five kinds of document a project accumulates. Rendering
    // it as “product” reads as a commercial product, and rendering it two ways within one language leaves
    // the tab and its own error message looking unrelated.
    //
    // **Scope of this check:** it compares the three strings against each other, so it catches a language
    // that is internally inconsistent. It cannot tell whether the word chosen is the right one — a language
    // that says “product” in all three places passes. Choosing the term is a CONTEXT.md decision and is
    // enforced by review, not here.
    for (const l of LANGUAGES) {
      const d = dictOf(l)
      const root = d.detail.tabArts.toLocaleLowerCase().slice(0, 5)
      expect(
        d.detail.noArtifactsOfType.toLocaleLowerCase(),
        `${l}: the “${d.detail.tabArts}” tab’s empty state does not use the same word`
      ).toContain(root)
      expect(
        d.errors.artifactNotWhitelisted.toLocaleLowerCase(),
        `${l}: the “${d.detail.tabArts}” tab’s allow-list error does not use the same word`
      ).toContain(root)
    }
  })
})
