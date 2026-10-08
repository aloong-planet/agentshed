// The window slice and the projections, both derived from usage rows (ADR-0025; spec token-stats
// sequence G). What is being guarded here is not "does it add up" but the identities the interface
// leans on: the three buckets sum to the total, `all` equals the side totals, and a bounded window
// excludes exactly what it cannot attribute.
//
// **Known gaps, stated rather than papered over:**
//   - G6, archived days joining a window, is not covered here: the archive is folded into the row set
//     in the main process's snapshot assembly, which has no unit seam of its own. Covering it needs an
//     end-to-end run against a populated archive directory; the condition for adding it is a fixture
//     that can age a day out of the live scan.
//   - The composition colours (G10) are asserted by the theme-variable measurement rather than here —
//     a value in a stylesheet is not reachable from a unit test, and asserting the hex strings back
//     would only restate the source.
//   - G4 — that the whole-history card names its own span, so it is not misread as the chart's 30 days
//     — is a copy fact. The dictionaries carry it and the type alignment keeps the six in step, but
//     nothing asserts the wording says what it means.
import { describe, it, expect } from 'vitest'
import { localDay } from './format'
import { deriveStats, inWindow, sliceUsage, USAGE_WINDOWS, USAGE_WINDOW_DAYS } from './usage'
import type { AgentSide, UsageRow } from './domain'

/**
 * A fixed anchor, deliberately **well in the past**. A date near today would make these cases unable
 * to tell the two apart: the window is specified to be cut against the caller-provided common anchor rather than a separately read
 * clock (spec G2), and if the two coincide an implementation reading `Date.now()` passes everything
 * here. With the anchor months back, a clock-based cut puts every row outside `today` and the
 * assertions below go red — which is the only reason they are evidence for G2 at all.
 */
const ANCHOR = new Date('2026-03-11T12:00:00Z').getTime()
const dayBack = (n: number): string => localDay(ANCHOR - n * 86_400_000)

function row(o: Partial<UsageRow> & { side: AgentSide }): UsageRow {
  return {
    day: dayBack(0),
    projectKey: 'p',
    model: 'm',
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    ...o
  }
}
/** A row whose four fields actually add up the way a real one does */
function real(side: AgentSide, day: string, o: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; model?: string; projectKey?: string }): UsageRow {
  const input = o.input ?? 0, output = o.output ?? 0, cacheRead = o.cacheRead ?? 0, cacheWrite = o.cacheWrite ?? 0
  return row({ side, day, ...o, input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite })
}

/** The fixture the identity assertions run over: three sides, several models, a spread of days */
const ROWS: UsageRow[] = [
  real('claude', dayBack(0), { input: 100, output: 50, cacheRead: 7000, cacheWrite: 300, model: 'claude-fable-5' }),
  real('claude', dayBack(3), { input: 20, output: 10, model: 'claude-opus-5' }),
  real('claude', dayBack(9), { input: 5, output: 5, cacheRead: 90, model: 'claude-fable-5' }),
  real('codex', dayBack(0), { input: 40, output: 12, cacheRead: 400, model: 'gpt-5.6-sol' }),
  real('codex', dayBack(20), { input: 7, output: 3, model: 'gpt-5.6-sol' }),
  real('grok', dayBack(1), { input: 60, output: 8, cacheRead: 150, model: 'grok-4.6-build' }),
  real('grok', dayBack(45), { input: 11, output: 2, model: 'grok-4.5-build' })
]

describe('window slicing', () => {
  it('the fourth window uses the selected span for totals, sides, composition and models', () => {
    const anchor = new Date(2026, 2, 31, 12).getTime()
    const rows = [
      real('claude', '2026-03-31', { input: 7, cacheWrite: 3, output: 2, model: 'recent' }),
      real('codex', '2026-01-31', { input: 20, cacheRead: 3, model: 'older' }),
      real('grok', '2026-01-01', { input: 44, model: 'oldest' }),
      real('claude', '2025-12-31', { input: 100 }),
      real('claude', '2026-04-01', { input: 200 }),
      real('claude', '', { input: 300 })
    ]
    expect(sliceUsage(rows, 'd30', anchor, 30).total).toBe(12)
    expect(sliceUsage(rows, 'd30', anchor, 60).total).toBe(35)
    expect(sliceUsage(rows, 'd30', anchor, 90)).toEqual({
      total: 79, bySide: { claude: 12, codex: 23, grok: 44 },
      composition: { uncachedInput: 74, output: 2, cacheRead: 3 },
      byModel: [
        { side: 'grok', model: 'oldest', total: 44 },
        { side: 'codex', model: 'older', total: 23 },
        { side: 'claude', model: 'recent', total: 12 }
      ]
    })
    expect(sliceUsage(rows, 'all', anchor, 90).total).toBe(679)
    expect(sliceUsage(rows, 'today', anchor, 90).total).toBe(12)
    expect(sliceUsage(rows, 'd7', anchor, 90).total).toBe(12)
  })

  it.each(USAGE_WINDOWS)('%s: the three buckets sum exactly to the total', (w) => {
    const s = sliceUsage(ROWS, w, ANCHOR)
    const c = s.composition
    // Asserted for every window over the whole fixture rather than for one hand-picked case: a
    // rounding or apportioning rule that only drifts on lopsided data survives a single case
    expect(c.uncachedInput + c.output + c.cacheRead).toBe(s.total)
    expect(Object.values(s.bySide).reduce((a, b) => a + b, 0)).toBe(s.total)
    expect(s.byModel.reduce((a, m) => a + m.total, 0)).toBe(s.total)
  })

  it('all equals the side totals the projections report, so the four cards cannot disagree (G7)', () => {
    const stats = deriveStats(ROWS)
    const all = sliceUsage(ROWS, 'all', ANCHOR)
    const sides = Object.values(stats.bySide).reduce((a, t) => a + t.total, 0)
    expect(all.total).toBe(sides)
    for (const side of ['claude', 'codex', 'grok'] as AgentSide[]) {
      expect(all.bySide[side]).toBe(stats.bySide[side].total)
    }
  })

  it('narrower windows are nested: today ⊆ 7 days ⊆ 30 days ⊆ all', () => {
    const t = sliceUsage(ROWS, 'today', ANCHOR).total
    const d7 = sliceUsage(ROWS, 'd7', ANCHOR).total
    const d30 = sliceUsage(ROWS, 'd30', ANCHOR).total
    const all = sliceUsage(ROWS, 'all', ANCHOR).total
    expect(t).toBeLessThan(d7)
    expect(d7).toBeLessThan(d30)
    expect(d30).toBeLessThan(all)
    // The fixture must actually exercise each boundary, or the ordering above holds vacuously
    expect([t, d7, d30, all].every((v) => v > 0)).toBe(true)
  })

  it('the window counts the anchor day as its first, so 7 days means 7 including today', () => {
    const rows = [0, 6, 7].map((n) => real('claude', dayBack(n), { input: 1 }))
    expect(sliceUsage(rows, 'd7', ANCHOR).total).toBe(2)
    expect(inWindow(dayBack(6), 'd7', ANCHOR)).toBe(true)
    expect(inWindow(dayBack(7), 'd7', ANCHOR)).toBe(false)
  })

  it('a day after the anchor is outside every bounded window — a snapshot never counts the future', () => {
    // Reachable in practice: a session file whose clock ran ahead, or an anchor from a stale snapshot
    const rows = [real('claude', dayBack(-1), { input: 5 })]
    expect(sliceUsage(rows, 'today', ANCHOR).total).toBe(0)
    expect(sliceUsage(rows, 'd30', ANCHOR).total).toBe(0)
    expect(sliceUsage(rows, 'all', ANCHOR).total, 'but it is still on record').toBe(5)
  })

  it('an undated row joins all but no bounded window (G7)', () => {
    const rows = [real('claude', '', { input: 9 }), real('claude', dayBack(0), { input: 1 })]
    expect(sliceUsage(rows, 'all', ANCHOR).total, 'on record, so whole history counts it').toBe(10)
    expect(sliceUsage(rows, 'today', ANCHOR).total, 'cannot be shown to fall inside a bounded window').toBe(1)
    expect(deriveStats(rows).bySide.claude.total, 'and the side total agrees with all').toBe(10)
    expect(deriveStats(rows).byDay.length, 'while contributing no day to the trend').toBe(1)
  })

  it('a window with no rows yields zeros rather than absent structure (G5)', () => {
    const s = sliceUsage([real('claude', dayBack(40), { input: 5 })], 'today', ANCHOR)
    expect(s.total).toBe(0)
    expect(s.composition).toEqual({ uncachedInput: 0, output: 0, cacheRead: 0 })
    expect(s.bySide, 'every side present with an explicit zero, so the cards have something to render')
      .toEqual({ claude: 0, codex: 0, grok: 0 })
    expect(s.byModel).toEqual([])
  })

  it('cache writes are counted inside uncached input, never on their own', () => {
    // The grouping the legend claims. `input` and `cacheWrite` do not each carry one meaning across
    // sides, but their sum does — CONTEXT.md's invariant, and the reason this is the chosen cut.
    const rows = [real('claude', dayBack(0), { input: 10, cacheWrite: 90, output: 1, cacheRead: 899 })]
    const c = sliceUsage(rows, 'all', ANCHOR).composition
    expect(c).toEqual({ uncachedInput: 100, output: 1, cacheRead: 899 })
  })

  it('models are ordered by size and split by side, so the same name on two sides stays two rows', () => {
    const rows = [
      real('claude', dayBack(0), { input: 5, model: 'shared-name' }),
      real('codex', dayBack(0), { input: 50, model: 'shared-name' }),
      real('grok', dayBack(0), { input: 20, model: 'other' })
    ]
    expect(sliceUsage(rows, 'all', ANCHOR).byModel).toEqual([
      { model: 'shared-name', side: 'codex', total: 50 },
      { model: 'other', side: 'grok', total: 20 },
      { model: 'shared-name', side: 'claude', total: 5 }
    ])
  })

  it('a row with no model counts toward the total but enters no model bucket', () => {
    // The same rule Claude's synthetic models follow (spec A6): the tokens are real, the attribution
    // is not available
    const rows = [real('claude', dayBack(0), { input: 7, model: '' })]
    const s = sliceUsage(rows, 'all', ANCHOR)
    expect(s.total).toBe(7)
    expect(s.byModel).toEqual([])
  })

  it('every window is declared, so adding one cannot silently inherit "all"', () => {
    for (const w of USAGE_WINDOWS) expect(USAGE_WINDOW_DAYS[w] === null || USAGE_WINDOW_DAYS[w] > 0).toBe(true)
    expect(Object.keys(USAGE_WINDOW_DAYS).sort()).toEqual([...USAGE_WINDOWS].sort())
  })
})

describe('deriving the projections', () => {
  it('the projections equal the rows they come from', () => {
    const s = deriveStats(ROWS)
    for (const side of ['claude', 'codex', 'grok'] as AgentSide[]) {
      const mine = ROWS.filter((r) => r.side === side)
      expect(s.bySide[side].total).toBe(mine.reduce((a, r) => a + r.total, 0))
      expect(s.bySide[side].cacheRead).toBe(mine.reduce((a, r) => a + r.cacheRead, 0))
    }
    expect(s.byDay.reduce((a, d) => a + Object.values(d.bySide).reduce((x, v) => x + v, 0), 0))
      .toBe(ROWS.reduce((a, r) => a + r.total, 0))
  })

  it('days come out in ascending order and each provider segment sums to that day', () => {
    const s = deriveStats(ROWS)
    expect([...s.byDay].sort((a, b) => (a.day < b.day ? -1 : 1))).toEqual(s.byDay)
    for (const d of s.byDay) {
      const sides = Object.values(d.bySide).reduce((a, v) => a + v, 0)
      const provs = Object.values(d.byProvider).reduce((a: number, v) => a + (v ?? 0), 0)
      expect(provs, `${d.day}: the segments must sum to the bar`).toBe(sides)
    }
  })

  it('a side with no rows still gets an explicit zero (ADR-0020)', () => {
    const s = deriveStats([real('claude', dayBack(0), { input: 1 })])
    expect(s.bySide.grok).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 })
    expect(s.byDay[0].bySide.grok, 'a day too: absence there could only mean the producer forgot').toBe(0)
  })
})
