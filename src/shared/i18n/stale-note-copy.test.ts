// The stale note card splices side chips into sentences at a `{sides}` slot (spec project-detail S).
// The slot is plain string content, so the type alignment cannot see it: a translation that drops it
// would render the sentence without chips, silently. This guard makes the slot a checked contract
// across every language.
import { describe, expect, it } from 'vitest'
import { zh } from './zh'
import { en } from './en'
import { fr } from './fr'
import { ru } from './ru'
import { es } from './es'
import { ja } from './ja'

const ALL = { zh, en, fr, ru, es, ja } as const

const slots = (s: string): number => s.split('{sides}').length - 1

describe('stale note copy: the {sides} slot survives every language', () => {
  for (const [lang, d] of Object.entries(ALL)) {
    it(`${lang}: cause and send each carry exactly one slot, at any side count`, () => {
      expect(slots(d.detail.staleCause(1))).toBe(1)
      expect(slots(d.detail.staleCause(3))).toBe(1)
      expect(slots(d.detail.staleSend)).toBe(1)
    })
    it(`${lang}: the prompt embeds the path it was given`, () => {
      expect(d.detail.stalePrompt('/tmp/probe-path')).toContain('/tmp/probe-path')
    })
  }
})
