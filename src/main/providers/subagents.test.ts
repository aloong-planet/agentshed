// The global Subagents section (spec: subagents-memory-plugin, sequence A):
// both sides merged into one column; the key is the filename for Claude and the toml name field for
// Codex; a parse failure degrades without crashing.
// A known gap: A7 malicious content sanitising is covered by the existing md.test.ts
// (renderMarkdown/DOMPurify) and
//   React's text node escaping, and is not repeated here.
// Unreadable files (A8) are covered with a chmod 000 fixture: chmod does not block reads as root, so that
// case is skipped explicitly.
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
    grokHome: join(dir, '.grok'),
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

describe('global subagents', () => {
  it('A5 the same name on both sides merges onto one row, with each side\'s fields and source kept separately', async () => {
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

  it('a single-side entry gets its own row; the Codex key is the toml name field rather than the filename', async () => {
    mkClaudeAgent('docs-writer', `---\ndescription: writes docs\n---\nbody`)
    mkCodexAgent('whatever-file.toml', `name = "helper"\ndescription = "d"\ndeveloper_instructions = "x"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const names = snap.global.subagents.map((s) => s.name)
    expect(names).toEqual(['docs-writer', 'helper'])
    expect(snap.global.subagents[0].sides).toEqual(['claude'])
    expect(snap.global.subagents[1].sides).toEqual(['codex'])
  })

  it('A4 Claude markdown with no frontmatter → the filename becomes the name and the fields stay empty without crashing', async () => {
    mkClaudeAgent('bare', 'just a prompt body, no frontmatter')
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.subagents[0]
    expect(s.name).toBe('bare')
    expect(s.description).toBeNull()
    expect(s.claude?.tools).toBeNull()
    expect(s.claude?.content?.text).toContain('just a prompt body')
  })

  it('A2 a corrupt Codex toml → a parse-failure entry (with the filename standing in), leaving the others unaffected', async () => {
    mkCodexAgent('broken.toml', 'name = "unterminated')
    mkCodexAgent('good.toml', `name = "good"\ndeveloper_instructions = "ok"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const broken = snap.global.subagents.find((s) => s.name === '(broken.toml)')
    expect(broken?.codex?.error).toBeTruthy()
    expect(snap.global.subagents.find((s) => s.name === 'good')).toBeTruthy()
  })

  it('A3 a Codex toml with no valid name → treated as an invalid definition (Codex does not load it either)', async () => {
    mkCodexAgent('noname.toml', `description = "d"\ndeveloper_instructions = "x"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.subagents.find((x) => x.name === '(noname.toml)')
    // Assert the error code rather than the wording: the wording is produced by the renderer per language
    // (ADR-0015, extended to data fields by ticket 07)
    expect(s?.codex?.error?.code).toBe(ERR.subagentMissingName)
  })

  it('two files with the same name in one layer → the first wins (by filename order, as agent_roles.rs skips the later duplicate)', async () => {
    mkCodexAgent('a-first.toml', `name = "dup"\ndescription = "first one"\ndeveloper_instructions = "A"\n`)
    mkCodexAgent('b-second.toml', `name = "dup"\ndescription = "second one"\ndeveloper_instructions = "B"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    const d = snap.global.subagents.find((s) => s.name === 'dup')
    expect(d?.codex?.description).toBe('first one')
  })

  it('overriding a built-in: a Codex custom name in {default,worker,explorer} → overridesBuiltin', async () => {
    mkCodexAgent('explorer.toml', `name = "explorer"\ndeveloper_instructions = "x"\n`)
    mkCodexAgent('other.toml', `name = "other"\ndeveloper_instructions = "x"\n`)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.subagents.find((s) => s.name === 'explorer')?.overridesBuiltin).toBe(true)
    expect(snap.global.subagents.find((s) => s.name === 'other')?.overridesBuiltin).toBe(false)
  })

  it('A8 a file that exists but cannot be read → the entry is kept and labelled unreadable rather than silently disappearing', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return // chmod does not block reads as root
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

  it('A8 an unreadable project-level file still takes part in the shadowing judgement (so a global entry is not wrongly marked as in effect)', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return
    mkClaudeAgent('code-reviewer', CL_MD)
    const proj = join(dir, 'shadow-proj')
    mkdirSync(join(proj, '.claude', 'agents'), { recursive: true })
    const pf = join(proj, '.claude', 'agents', 'code-reviewer.md')
    writeFileSync(pf, `---\ndescription: project version\n---\nx`)
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

  it('A1 both sides\' agents directories missing → an empty array without crashing', async () => {
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.subagents).toEqual([])
  })

  it('A6 a definition file over 200 KB → its contents are truncated', async () => {
    mkClaudeAgent('big', `---\ndescription: d\n---\n${'x'.repeat(250_000)}`)
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.subagents[0]
    expect(s.claude?.content?.text.length).toBeLessThan(210_000)
    // The main process only reports whether it was truncated; the "…(truncated)" marker is appended by
    // the renderer in the current language (ticket 07)
    expect(s.claude?.content?.truncated).toBe(true)
  })
})

// ── Project detail's effective view (sequence B) — note that subagents shadow at the project level on
// both sides, the opposite of skills' Codex coexistence semantics (agent_roles.rs overrides by layer,
// verified at source level) ──
import { readProjectDetail } from './project-detail'
import { ERR } from '@shared/errors'

function mkProjAgent(proj: string, side: 'claude' | 'codex', file: string, content: string): void {
  const d = join(proj, side === 'claude' ? '.claude' : '.codex', 'agents')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, file), content)
}

describe('project detail subagents effective view', () => {
  let proj: string
  beforeEach(() => {
    proj = join(dir, 'myproj')
    mkdirSync(proj, { recursive: true })
  })

  it('B2 Claude project level shadows the same name globally; global entries with other names stay in effect', async () => {
    mkClaudeAgent('code-reviewer', CL_MD)
    mkClaudeAgent('debugger', `---\ndescription: dbg\n---\nbody`)
    mkProjAgent(proj, 'claude', 'code-reviewer.md', `---\ndescription: project customised version\n---\nlocal body`)
    const detail = readProjectDetail(roots(), proj)
    const cr = detail.subagents.filter((s) => s.name === 'code-reviewer' && s.side === 'claude')
    expect(cr.find((s) => s.level === 'project')?.shadows).toBe(true)
    expect(cr.find((s) => s.level === 'global')?.shadowed).toBe(true)
    const dbg = detail.subagents.find((s) => s.name === 'debugger')
    expect(dbg?.level).toBe('global')
    expect(dbg?.shadowed).toBe(false)
  })

  it('B3 Codex project level shadows the user level — the key is the toml name field, so it shadows across filenames too', async () => {
    mkCodexAgent('reviewer-global.toml', `name = "code-reviewer"\ndeveloper_instructions = "global"\n`)
    mkProjAgent(proj, 'codex', 'anything.toml', `name = "code-reviewer"\ndeveloper_instructions = "proj"\n`)
    const detail = readProjectDetail(roots(), proj)
    const cx = detail.subagents.filter((s) => s.name === 'code-reviewer' && s.side === 'codex')
    expect(cx.find((s) => s.level === 'project')?.shadows).toBe(true)
    expect(cx.find((s) => s.level === 'global')?.shadowed).toBe(true)
  })

  it('B4 a Codex project-level custom name matching a built-in (explorer) → the overrides-built-in label', async () => {
    mkProjAgent(proj, 'codex', 'explorer.toml', `name = "explorer"\ndeveloper_instructions = "x"\n`)
    const detail = readProjectDetail(roots(), proj)
    const e = detail.subagents.find((s) => s.name === 'explorer')
    expect(e?.level).toBe('project')
    expect(e?.overridesBuiltin).toBe(true)
  })

  it('B1/B5 a project with no agents directory → only the global entries are in effect', async () => {
    mkClaudeAgent('docs-writer', `---\ndescription: d\n---\nbody`)
    const detail = readProjectDetail(roots(), proj)
    expect(detail.subagents).toHaveLength(1)
    expect(detail.subagents[0].level).toBe('global')
    expect(detail.subagents[0].shadowed).toBe(false)
  })
})
