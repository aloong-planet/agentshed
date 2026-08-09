// Ticket 05: the subagent failure label branches on **category**, not on wording.
//
// These cases guard the hazard ADR-0015 named: it used to read `error.includes('不可读')`,
// so a wording change would make the branch fail silently with no test going red. What is asserted now is
// "category → label",
// and no wording change should affect which branch is taken — so this deliberately does **not** assert a
// specific literal,
// but that each category picks up its own entry from the dictionaries.
import { describe, it, expect } from 'vitest'
import { dictOf, LANGUAGES } from '@shared/i18n'
import { errLabel } from './SubagentsView'
import { ERR } from '@shared/errors'

describe('errLabel (branching on the error code)', () => {
  it('unreadable and parse-failed pick up their own wording', () => {
    for (const lang of LANGUAGES) {
      const t = dictOf(lang)
      expect(errLabel({ code: ERR.subagentUnreadable, params: {} }, t)).toBe(t.subagentError.unreadable)
      expect(errLabel({ code: ERR.subagentTomlFailed, params: {} }, t)).toBe(t.subagentError.parseFailed)
    }
  })

  it('the two labels differ from each other (otherwise the branch is no branch at all)', () => {
    for (const lang of LANGUAGES) {
      const t = dictOf(lang)
      expect(errLabel({ code: ERR.subagentUnreadable, params: {} }, t)).not.toBe(errLabel({ code: ERR.subagentTomlFailed, params: {} }, t))
    }
  })

  it('a null category falls to the parse-failure side, matching the behaviour before the change', () => {
    // Before the change, `includes('不可读')` sent any error not containing that word to "parse failed",
    // including a non-empty error with no category; the same fallback is kept here, so what the user sees
    // does not change
    const t = dictOf('zh')
    expect(errLabel(null, t)).toBe(t.subagentError.parseFailed)
  })
})
