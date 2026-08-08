// Subagents 全局分栏(spec: subagents-memory-plugin 序列 A):
// 双端合并单列;键语义 Claude=文件名、Codex=toml name 字段;解析失败降级不崩。
// 已知缺口:A7 恶意内容消毒由既有 md.test.ts(renderMarkdown/DOMPurify)与
//   React 文本节点转义覆盖,此处不重复。
// 不可读文件(A8)用 chmod 000 fixture 覆盖:root 下 chmod 不拦截读取,显式跳过。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
function mkClaudeAgent(name: string, content: string): void {
  const d = join(dir, '.claude', 'agents')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, `${name}.md`), content)
}
function mkCodexAgent(file: string, content: string): void {
  const d = join(dir, '.codex', 'agents')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, file), content)
}
const CL_MD = `---
name: code-reviewer
description: Expert code review specialist.
tools: Read, Grep, Glob, Bash
---

You are a senior code reviewer.`
const CX_TOML = `name = "code-reviewer"
description = "Expert code review specialist."
model = "gpt-5.5"
sandbox_mode = "read-only"
developer_instructions = """
You are a senior code reviewer.
"""
`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-sub-'))
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('全局 subagents', () => {
  it('A5 双端同名合并一行;各侧字段与原文分别保留', async () => {
    mkClaudeAgent('code-reviewer', CL_MD)
    mkCodexAgent('code-reviewer.toml', CX_TOML)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.subagents).toHaveLength(1)
    const s = snap.global.subagents[0]
    expect(s.name).toBe('code-reviewer')
    expect(s.sides).toEqual(['claude', 'codex'])
    expect(s.description).toBe('Expert code review specialist.')
    expect(s.claude?.tools).toBe('Read, Grep, Glob, Bash')
    expect(s.claude?.content?.text).toContain('senior code reviewer')
    expect(s.codex?.model).toBe('gpt-5.5')
    expect(s.codex?.sandbox).toBe('read-only')
    expect(s.codex?.content?.text).toContain('developer_instructions')
  })

  it('单侧条目各自成行;Codex 键取 toml name 字段而非文件名', async () => {
    mkClaudeAgent('docs-writer', `---\ndescription: writes docs\n---\nbody`)
    mkCodexAgent('whatever-file.toml', `name = "helper"\ndescription = "d"\ndeveloper_instructions = "x"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const names = snap.global.subagents.map((s) => s.name)
    expect(names).toEqual(['docs-writer', 'helper'])
    expect(snap.global.subagents[0].sides).toEqual(['claude'])
    expect(snap.global.subagents[1].sides).toEqual(['codex'])
  })

  it('A4 Claude md 无 frontmatter → 文件名为名,字段留空不崩', async () => {
    mkClaudeAgent('bare', 'just a prompt body, no frontmatter')
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.subagents[0]
    expect(s.name).toBe('bare')
    expect(s.description).toBeNull()
    expect(s.claude?.tools).toBeNull()
    expect(s.claude?.content?.text).toContain('just a prompt body')
  })

  it('A2 Codex toml 损坏 → 解析失败条目(文件名占位),其余条目不受影响', async () => {
    mkCodexAgent('broken.toml', 'name = "unterminated')
    mkCodexAgent('good.toml', `name = "good"\ndeveloper_instructions = "ok"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const broken = snap.global.subagents.find((s) => s.name === '(broken.toml)')
    expect(broken?.codex?.error).toBeTruthy()
    expect(snap.global.subagents.find((s) => s.name === 'good')).toBeTruthy()
  })

  it('A3 Codex toml 缺有效 name → 视为无效定义(Codex 本身不加载)', async () => {
    mkCodexAgent('noname.toml', `description = "d"\ndeveloper_instructions = "x"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.subagents.find((x) => x.name === '(noname.toml)')
    // 断错误码而非措辞:措辞已交给渲染层按语言生成(ADR-0015,票 07 扩到数据字段)
    expect(s?.codex?.error?.code).toBe(ERR.subagentMissingName)
  })

  it('同层内两文件同 name → 先者优先(按文件名序,agent_roles.rs 同层重名跳过后来者)', async () => {
    mkCodexAgent('a-first.toml', `name = "dup"\ndescription = "第一个"\ndeveloper_instructions = "A"\n`)
    mkCodexAgent('b-second.toml', `name = "dup"\ndescription = "第二个"\ndeveloper_instructions = "B"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const d = snap.global.subagents.find((s) => s.name === 'dup')
    expect(d?.codex?.description).toBe('第一个')
  })

  it('覆盖内置:Codex 自定义名 ∈ {default,worker,explorer} → overridesBuiltin', async () => {
    mkCodexAgent('explorer.toml', `name = "explorer"\ndeveloper_instructions = "x"\n`)
    mkCodexAgent('other.toml', `name = "other"\ndeveloper_instructions = "x"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.subagents.find((s) => s.name === 'explorer')?.overridesBuiltin).toBe(true)
    expect(snap.global.subagents.find((s) => s.name === 'other')?.overridesBuiltin).toBe(false)
  })

  it('A8 文件存在但不可读 → 条目保留并标"不可读",不静默消失', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return // root 下 chmod 不拦截
    mkClaudeAgent('locked', `---\ndescription: d\n---\nbody`)
    const { chmodSync } = await import('node:fs')
    const f = join(dir, '.claude', 'agents', 'locked.md')
    chmodSync(f, 0o000)
    try {
      const snap = await scan(roots(), { now: () => 1 })
      const s = snap.global.subagents.find((x) => x.name === 'locked')
      expect(s?.claude?.error?.code).toBe(ERR.subagentUnreadable)
    } finally {
      chmodSync(f, 0o644)
    }
  })

  it('A8 项目级文件不可读时仍参与遮蔽判定(不因静默消失而误标全局条目生效)', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return
    mkClaudeAgent('code-reviewer', CL_MD)
    const proj = join(dir, 'shadow-proj')
    mkdirSync(join(proj, '.claude', 'agents'), { recursive: true })
    const pf = join(proj, '.claude', 'agents', 'code-reviewer.md')
    writeFileSync(pf, `---\ndescription: 项目版\n---\nx`)
    const { chmodSync } = await import('node:fs')
    chmodSync(pf, 0o000)
    try {
      const detail = readProjectDetail(roots(), proj)
      const globalEntry = detail.subagents.find(
        (s) => s.name === 'code-reviewer' && s.level === 'global' && s.side === 'claude'
      )
      expect(globalEntry?.shadowed).toBe(true)
    } finally {
      chmodSync(pf, 0o644)
    }
  })

  it('A1 两侧 agents 目录均缺失 → 空数组不崩', async () => {
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.subagents).toEqual([])
  })

  it('A6 定义文件超 200KB → 内容截断', async () => {
    mkClaudeAgent('big', `---\ndescription: d\n---\n${'x'.repeat(250_000)}`)
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.subagents[0]
    expect(s.claude?.content?.text.length).toBeLessThan(210_000)
    // 主进程只报告是否被截断,「…(已截断)」由渲染层按当前语言追加(票 07)
    expect(s.claude?.content?.truncated).toBe(true)
  })
})

// ── 项目详情生效视图(序列 B)——注意:subagents 两侧均为项目级遮蔽,
// 与 skills 的 Codex 同名共存语义相反(agent_roles.rs 层覆盖,源码级核实) ──
import { readProjectDetail } from './project-detail'
import { ERR } from '@shared/errors'

function mkProjAgent(proj: string, side: 'claude' | 'codex', file: string, content: string): void {
  const d = join(proj, side === 'claude' ? '.claude' : '.codex', 'agents')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, file), content)
}

describe('项目详情 subagents 生效视图', () => {
  let proj: string
  beforeEach(() => {
    proj = join(dir, 'myproj')
    mkdirSync(proj, { recursive: true })
  })

  it('B2 Claude 项目级遮蔽全局同名;非同名全局项照常生效', async () => {
    mkClaudeAgent('code-reviewer', CL_MD)
    mkClaudeAgent('debugger', `---\ndescription: dbg\n---\nbody`)
    mkProjAgent(proj, 'claude', 'code-reviewer.md', `---\ndescription: 项目定制版\n---\nlocal body`)
    const detail = readProjectDetail(roots(), proj)
    const cr = detail.subagents.filter((s) => s.name === 'code-reviewer' && s.side === 'claude')
    expect(cr.find((s) => s.level === 'project')?.shadows).toBe(true)
    expect(cr.find((s) => s.level === 'global')?.shadowed).toBe(true)
    const dbg = detail.subagents.find((s) => s.name === 'debugger')
    expect(dbg?.level).toBe('global')
    expect(dbg?.shadowed).toBe(false)
  })

  it('B3 Codex 项目级遮蔽用户级——键取 toml name 字段,跨文件名也遮蔽', async () => {
    mkCodexAgent('reviewer-global.toml', `name = "code-reviewer"\ndeveloper_instructions = "global"\n`)
    mkProjAgent(proj, 'codex', 'anything.toml', `name = "code-reviewer"\ndeveloper_instructions = "proj"\n`)
    const detail = readProjectDetail(roots(), proj)
    const cx = detail.subagents.filter((s) => s.name === 'code-reviewer' && s.side === 'codex')
    expect(cx.find((s) => s.level === 'project')?.shadows).toBe(true)
    expect(cx.find((s) => s.level === 'global')?.shadowed).toBe(true)
  })

  it('B4 Codex 项目级自定义名为内置(explorer)→ 覆盖内置标注', async () => {
    mkProjAgent(proj, 'codex', 'explorer.toml', `name = "explorer"\ndeveloper_instructions = "x"\n`)
    const detail = readProjectDetail(roots(), proj)
    const e = detail.subagents.find((s) => s.name === 'explorer')
    expect(e?.level).toBe('project')
    expect(e?.overridesBuiltin).toBe(true)
  })

  it('B1/B5 项目无 agents 目录 → 仅全局生效项', async () => {
    mkClaudeAgent('docs-writer', `---\ndescription: d\n---\nbody`)
    const detail = readProjectDetail(roots(), proj)
    expect(detail.subagents).toHaveLength(1)
    expect(detail.subagents[0].level).toBe('global')
    expect(detail.subagents[0].shadowed).toBe(false)
  })
})
