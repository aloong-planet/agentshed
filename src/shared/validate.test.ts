// Seam 2(IPC 契约):快照 schema 校验的行为测试——好载荷放行、坏载荷拒收并给出路径。
import { describe, it, expect } from 'vitest'
import { validateSnapshot, validateProjectStats } from './validate'
import { emptySnapshot, emptyTokenStats } from './domain'

describe('validateSnapshot', () => {
  it('放行合法快照(空快照即合法基态)', () => {
    const r = validateSnapshot(emptySnapshot(1234))
    expect(r.ok).toBe(true)
  })

  it('放行带项目的快照', () => {
    const snap = emptySnapshot(1)
    snap.projects.push({
      path: '/Users/x/proj',
      name: 'proj',
      sides: ['claude', 'codex'],
      stale: false,
      hidden: false,
      lastSessionAt: null,
      sessionCount: 0
    })
    expect(validateSnapshot(snap).ok).toBe(true)
  })

  it('拒收非对象', () => {
    expect(validateSnapshot(null).ok).toBe(false)
    expect(validateSnapshot('x').ok).toBe(false)
  })

  it('拒收缺 v2 组件数组的快照(subagents/memory/codexPlugins 漏同步即在边界暴露,R1)', () => {
    for (const field of ['subagents', 'memory', 'codexPlugins'] as const) {
      const snap = emptySnapshot(1) as unknown as { global: Record<string, unknown> }
      delete snap.global[field]
      const r = validateSnapshot(snap)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain(field)
    }
  })

  it('拒收缺字段的快照并指出路径', () => {
    const bad = { scannedAt: 1, sides: { claude: { detected: true } }, projects: [] }
    const r = validateSnapshot(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('sides.codex')
  })

  it('拒收项目条目里的非法 side', () => {
    const snap = emptySnapshot(1) as unknown as Record<string, unknown>
    ;(snap['projects'] as unknown[]).push({
      path: '/p',
      name: 'p',
      sides: ['gemini'],
      stale: false,
      hidden: false,
      lastSessionAt: null,
      sessionCount: 0
    })
    const r = validateSnapshot(snap)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('sides')
  })

  it('拒收 lastSessionAt 类型错误(string 冒充时间戳)', () => {
    const snap = emptySnapshot(1) as unknown as { projects: unknown[] }
    snap.projects.push({
      path: '/p',
      name: 'p',
      sides: ['claude'],
      stale: false,
      hidden: false,
      lastSessionAt: 'yesterday',
      sessionCount: 0
    })
    expect(validateSnapshot(snap).ok).toBe(false)
  })
})

// 票 session-view/01:会话元数据带源文件标识。会话走的是 getProjectDetail 通道,
// 该通道此前完全没有边界校验(preload 里直接 as ProjectDetail)——不在本票造
// 大而全的 ProjectDetail 校验器,只覆盖本票新增的这部分。
describe('validateProjectStats(会话元数据)', () => {
  const ok = {
    tokens: emptyTokenStats(),
    sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/.claude/projects/e/a.jsonl' }]
  }

  it('放行合法载荷', () => {
    expect(validateProjectStats(ok).ok).toBe(true)
  })

  it('放行 sessions 为空的项目', () => {
    expect(validateProjectStats({ tokens: emptyTokenStats(), sessions: [] }).ok).toBe(true)
  })

  it('拒收缺 file 的会话并指出路径', () => {
    const bad = { ...ok, sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10 }] }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('sessions[0].file')
  })

  it('拒收空字符串 file——空串不是标识,拿它去读会落到 cwd', () => {
    const bad = { ...ok, sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '' }] }
    expect(validateProjectStats(bad).ok).toBe(false)
  })

  it('拒收非法 side 与 at 类型错误', () => {
    expect(validateProjectStats({ ...ok, sessions: [{ ...ok.sessions[0], side: 'gemini' }] }).ok).toBe(false)
    expect(validateProjectStats({ ...ok, sessions: [{ ...ok.sessions[0], at: '昨天' }] }).ok).toBe(false)
  })

  it('拒收 sessions 不是数组', () => {
    expect(validateProjectStats({ tokens: emptyTokenStats(), sessions: null }).ok).toBe(false)
  })
})
