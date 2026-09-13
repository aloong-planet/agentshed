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

/**
 * Collapses the source language does not make, which are nonetheless fine.
 *
 * Every entry answers "the source language uses two different words here, and this language uses one —
 * why is that not a defect". Anything not listed goes red.
 */
const ACCEPTED_COLLAPSES: Array<{ a: string; b: string; why: string }> = [
  {
    a: 'menu.copy',
    b: 'detail.staleCopy',
    why: 'the source language uses the macOS menu-convention word for the Edit-menu item and the everyday word for the in-app copy action — a Chinese register split over one action, not a distinction other languages can or should draw'
  },
  {
    a: 'languageName',
    b: 'languageNameEn',
    why: 'English written in English is English — identical by definition, and only for this one language'
  },
  {
    a: 'skills.pillProject',
    b: 'skills.srcProject',
    why: 'project level vs project — one concept, and the source language’s two words are a length choice, not a distinction'
  },
  { a: 'skills.srcProject', b: 'subagents.levelProject', why: 'as above' },
  { a: 'skills.pillGlobal', b: 'detail.levelGlobal', why: 'global vs global layer — one concept' },
  { a: 'subagents.levelGlobal', b: 'detail.levelGlobal', why: 'as above' },
  {
    a: 'skills.loading',
    b: 'memory.loading',
    why: 'both are "we are fetching this for display". The distinction that does carry weight — fetching one turn’s byte range on demand — is session.fetching, and that one is in MUST_DIFFER above'
  },
  {
    a: 'plugins.enabled',
    b: 'plugins.enabledShort',
    why: 'a long and a short form of the same state; languages without a shorter form legitimately render both the same'
  },
  { a: 'plugins.enabledShort', b: 'detail.mcpEnabled', why: 'as above' },
  { a: 'plugins.disabledShort', b: 'detail.mcpDisabled', why: 'as above' },
  {
    a: 'session.ascending',
    b: 'detail.oldestFirst',
    why: 'the source language labels this control abstractly (ascending) in one view and concretely (oldest first) in the other; the concrete wording is the better button label in both. detail.ascending stays abstract because it is interpolated mid-sentence by sortNote'
  },
  { a: 'session.descending', b: 'detail.recentFirst', why: 'as above' },
  {
    a: 'menu.undo',
    b: 'detail.cancel',
    why: 'French only — “Annuler” is Apple’s French for Undo in the Edit menu and the standard word on a Cancel button. Following the platform beats inventing a distinction French does not draw'
  }
]

describe('no language collapses a distinction the source language draws', () => {
  // **Exhaustive, not sampled.** The named cases in MUST_DIFFER are the ones that were actually wrong and
  // carry their reasoning; this sweep is the completeness net over every pair of entries — five independent
  // reviewers each read a whole dictionary and all five missed the three defects this found (Japanese using
  // one word for the Settings page and the Config tab, and for the hidden *state* and the hide *action*;
  // French using “Aperçu” for both file preview and the Overview tab). Reading cannot establish a negative
  // over ~270 entries; enumerating the pairs can.
  const flatten = (o: unknown, path = '', out: Record<string, string> = {}): Record<string, string> => {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      if (typeof v === 'string') out[p] = v
      else if (v && typeof v === 'object') flatten(v, p, out)
    }
    return out
  }
  const accepted = new Set(ACCEPTED_COLLAPSES.map((c) => `${c.a} ≡ ${c.b}`))

  it('every collapse is either absent or explicitly accepted', () => {
    const source = flatten(dictOf('zh'))
    const keys = Object.keys(source)
    const unexpected: string[] = []
    for (const l of LANGUAGES) {
      if (l === 'zh') continue
      const d = flatten(dictOf(l))
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const [a, b] = [keys[i], keys[j]]
          if (source[a] === source[b] || d[a] !== d[b]) continue
          if (accepted.has(`${a} ≡ ${b}`)) continue
          unexpected.push(`${l}: ${a} and ${b} both render as “${d[a]}” (source: “${source[a]}” / “${source[b]}”)`)
        }
      }
    }
    expect(unexpected).toEqual([])
  })

  it('no accepted-collapse entry has gone stale', () => {
    // An entry that no longer describes a real collapse is a standing permission nobody is using — the same
    // rubber-stamp hazard the working-language gate's allow-list guards against.
    const source = flatten(dictOf('zh'))
    const dead = ACCEPTED_COLLAPSES.filter(({ a, b }) => {
      if (source[a] === undefined || source[b] === undefined) return true
      if (source[a] === source[b]) return true
      return !LANGUAGES.some((l) => l !== 'zh' && flatten(dictOf(l))[a] === flatten(dictOf(l))[b])
    }).map(({ a, b, why }) => `${a} ≡ ${b} — ${why}`)
    expect(dead, 'these accepted-collapse entries no longer match anything and should be deleted').toEqual([])
  })
})

describe('one concept, one word', () => {
  // The opposite failure: the same concept rendered several different ways inside one language, so a user
  // cannot tell they are reading about the same thing.
  it('a plugin whose project directory is gone uses that language’s word for a stale project', () => {
    // `plugins.ts` computes projectMissing as `!existsSync(projectPath)` — which is precisely CONTEXT.md’s
    // definition of a stale project ("still recorded in a registry, directory no longer on disk"). Five
    // languages called it "lost" instead — and so did the source language, which used one word here and a
    // different one in the eight other places the same condition appears. One condition, one word;
    // otherwise the badge on the project row and the note on the plugin row look like two problems.
    for (const l of LANGUAGES) {
      const d = dictOf(l)
      const stale = d.detail.staleTag.toLocaleLowerCase()
      expect(
        d.plugins.projectMissing.toLocaleLowerCase(),
        `${l}: a stale project is “${d.detail.staleTag}” elsewhere, but the plugin row says “${d.plugins.projectMissing}”`
      ).toContain(stale)
    }
  })

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
