// A reconciliation against a third-party meter (ccusage). Not part of the default gate: it needs this
// machine's real agent data and a baseline generated from it, neither of which exists in CI.
//
//   PARITY=1 pnpm vitest run src/main/providers/ccusage-parity.test.ts
//
// The baseline is generated on demand. It used to be read from a path named after the day it was first
// sampled, which meant every run began with an undocumented manual step — and a reconciliation nobody
// can run is one nobody runs: a systematic drift on a whole side went unnoticed for weeks behind that
// step. Set CCUSAGE_BASELINE to reuse an existing export instead of regenerating (much faster).
//
// ccusage 20.x is a multi-agent aggregator; the per-agent breakdown inside agents[] is what must be
// read, or another CLI's usage lands in the baseline.
//
// The meter reads only Codex's legacy usage event; this application reads Codex's usage records from
// a rollout's usage boundary on (ADR-0027). On a day any rollout's records fall on, the meter is
// expected to read lower, so such days are reported as an expected divergence and do not fail the
// reconciliation — it keeps its meaning for legacy data only (spec token-stats, Testing Decisions).
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { TokenEngine } from './token-stats'
import type { AgentSide } from '@shared/domain'
import { localDay } from '@shared/format'

const run = process.env['PARITY'] === '1'

/** ccusage's daily rows, only the fields this reconciliation reads */
interface CcAgent {
  agent: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}
interface CcDaily {
  daily: Array<{ period: string; agents?: CcAgent[] }>
}

function baseline(): CcDaily {
  const reuse = process.env['CCUSAGE_BASELINE']
  if (reuse) return JSON.parse(readFileSync(reuse, 'utf8')) as CcDaily
  const out = execFileSync('npx', ['-y', 'ccusage@latest', 'daily', '--by-agent', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const f = join(mkdtempSync(join(tmpdir(), 'ccusage-')), 'baseline.json')
  writeFileSync(f, out)
  console.log(`baseline generated: ${f} (reuse it with CCUSAGE_BASELINE=${f})`)
  return JSON.parse(out) as CcDaily
}

/** The local days any Codex rollout's usage records fall on, read from the cache the build just wrote:
 * the meter reads only the legacy usage event, so on these days it is expected to read lower (ADR-0027) */
function codexRecordDays(cacheFile: string): Set<string> {
  const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as {
    files?: Record<string, { agg?: { kind?: string; events?: Array<[number | null, ...number[]]>; boundary?: number } }>
  }
  const days = new Set<string>()
  for (const entry of Object.values(cache.files ?? {})) {
    const agg = entry.agg
    if (agg?.kind !== 'codex' || !Array.isArray(agg.events) || typeof agg.boundary !== 'number') continue
    for (const ev of agg.events.slice(agg.boundary)) if (ev[0] !== null) days.add(localDay(ev[0]))
  }
  return days
}

/** The local day, in the same shape the engine keys `byDay` with */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe.skipIf(!run)('ccusage reconciliation', () => {
  it('every side agrees day by day', async () => {
    const ref = baseline()
    const home = homedir()
    const roots = {
      claudeHome: join(home, '.claude'),
      claudeConfigFile: join(home, '.claude.json'),
      codexHome: join(home, '.codex'),
      grokHome: join(home, '.grok'),
      agentsSkillsDir: join(home, '.agents', 'skills')
    }
    const projects = Object.keys(JSON.parse(readFileSync(roots.claudeConfigFile, 'utf8')).projects ?? {})
    const cacheDir = mkdtempSync(join(tmpdir(), 'parity-'))
    const r = await new TokenEngine(cacheDir).build(roots, projects)
    const recordDays = codexRecordDays(join(cacheDir, 'token-cache.json'))
    rmSync(cacheDir, { recursive: true, force: true })

    // The current day is still being written — by the very agents whose data this reads. Comparing it
    // measures the gap between two sampling moments, not a disagreement about accounting.
    const today = localToday()

    const failures: string[] = []
    for (const side of ['claude', 'codex', 'grok'] as AgentSide[]) {
      const mine = new Map(r.global.byDay.map((d) => [d.day, d.bySide[side]]))
      const theirs = new Map<string, number>()
      for (const row of ref.daily) {
        if (row.period === today) continue
        const a = (row.agents ?? []).find((x) => x.agent === side)
        if (!a) continue
        theirs.set(
          row.period,
          (a.inputTokens ?? 0) + (a.outputTokens ?? 0) + (a.cacheReadTokens ?? 0) + (a.cacheCreationTokens ?? 0)
        )
      }
      const diffs: string[] = []
      const expectedDivergence: string[] = []
      for (const day of [...theirs.keys()].sort()) {
        const a = mine.get(day) ?? 0
        const b = theirs.get(day) ?? 0
        if (a === b) continue
        const line = `  ${side} ${day} ours=${a} ccusage=${b} diff=${a - b}`
        if (side === 'codex' && recordDays.has(day)) expectedDivergence.push(line)
        else diffs.push(line)
      }
      const refTotal = [...theirs.values()].reduce((x, y) => x + y, 0)
      const ourTotal = [...theirs.keys()].reduce((x, day) => x + (mine.get(day) ?? 0), 0)
      console.log(
        `${side}: ${theirs.size} days compared, ${diffs.length} mismatched; total ours=${ourTotal} ccusage=${refTotal} diff=${ourTotal - refTotal}`
      )
      for (const d of diffs.slice(0, 20)) console.log(d)
      if (expectedDivergence.length > 0) {
        console.log(`  ${expectedDivergence.length} day(s) carry usage records and differ from the meter as expected (ADR-0027):`)
        for (const d of expectedDivergence.slice(0, 20)) console.log(d)
      }
      failures.push(...diffs)
    }
    expect(failures).toEqual([])
  }, 900_000)
})
