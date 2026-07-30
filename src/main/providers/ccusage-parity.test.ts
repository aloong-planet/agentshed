// 对账工具(非产线测试;默认跳过,需真实数据与 ccusage 基准):
//   npx ccusage@latest daily --by-agent --json > /tmp/ccusage-until29.json
// 注意:ccusage 20.x 是多 agent 聚合器(claude/codex/gemini/openclaw),
// 必须取 agents[] 里 agent==='claude' 的分解,否则会把别的 CLI 用量算进基准。
//   PARITY=1 pnpm vitest run scripts/ccusage-parity.test.ts
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { TokenEngine } from './token-stats'

const run = process.env['PARITY'] === '1'

describe.skipIf(!run)('ccusage 对账', () => {
  it('逐日与总量一致', async () => {
    const ref = JSON.parse(readFileSync('/tmp/ccusage-until29.json', 'utf8'))
    const home = homedir()
    const roots = {
      claudeHome: join(home, '.claude'),
      claudeConfigFile: join(home, '.claude.json'),
      codexHome: join(home, '.codex'),
      agentsSkillsDir: join(home, '.agents', 'skills')
    }
    const projects = Object.keys(JSON.parse(readFileSync(roots.claudeConfigFile, 'utf8')).projects ?? {})
    const cacheDir = mkdtempSync(join(tmpdir(), 'parity-'))
    const r = await new TokenEngine(cacheDir).build(roots, projects)
    rmSync(cacheDir, { recursive: true, force: true })

    const mine = new Map(r.global.byDay.map((d) => [d.day, d.claude]))
    const theirs = new Map<string, number>()
    for (const row of ref.daily as any[]) {
      const cl = (row.agents ?? []).find((a: any) => a.agent === 'claude')
      if (!cl) continue
      const total =
        (cl.inputTokens ?? 0) + (cl.outputTokens ?? 0) + (cl.cacheReadTokens ?? 0) + (cl.cacheCreationTokens ?? 0)
      theirs.set(row.period, total)
    }
    const days = [...theirs.keys()].sort() // 只比对基准覆盖的日期(排除采样后新增的今天)
    const diffs: string[] = []
    for (const day of days) {
      const a = mine.get(day) ?? 0
      const b = theirs.get(day) ?? 0
      if (a !== b) diffs.push(`${day} ours=${a} ccusage=${b} diff=${a - b}`)
    }
    const refTotal = [...theirs.values()].reduce((a, b) => a + b, 0)
    console.log(`总量: ours=${r.global.bySide.claude.total} ccusage(claude)=${refTotal} diff=${r.global.bySide.claude.total - refTotal}`)
    console.log(`天数: ours=${mine.size} ccusage=${theirs.size};不一致 ${diffs.length}/${days.length}`)
    for (const d of diffs.slice(0, 20)) console.log(d)
    expect(diffs).toEqual([])

    // Codex 侧同口径对账
    const cxMine = new Map(r.global.byDay.map((d) => [d.day, d.codex]))
    const cxTheirs = new Map<string, number>()
    for (const row of ref.daily as any[]) {
      const cx = (row.agents ?? []).find((a: any) => a.agent === 'codex')
      if (!cx) continue
      cxTheirs.set(
        row.period,
        (cx.inputTokens ?? 0) + (cx.outputTokens ?? 0) + (cx.cacheReadTokens ?? 0) + (cx.cacheCreationTokens ?? 0)
      )
    }
    const cxDiffs: string[] = []
    for (const day of [...cxTheirs.keys()].sort()) {
      const a = cxMine.get(day) ?? 0
      const b = cxTheirs.get(day) ?? 0
      if (a !== b) cxDiffs.push(`${day} ours=${a} ccusage=${b} diff=${a - b}`)
    }
    console.log(`Codex: ours天数=${[...cxMine].filter(([, v]) => v > 0).length} ccusage天数=${cxTheirs.size};不一致 ${cxDiffs.length}/${cxTheirs.size}`)
    for (const d of cxDiffs.slice(0, 15)) console.log(d)
    expect(cxDiffs).toEqual([])
  }, 600_000)
})
