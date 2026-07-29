// Seam 2(IPC 契约):快照 schema 校验的行为测试——好载荷放行、坏载荷拒收并给出路径。
import { describe, it, expect } from 'vitest'
import { validateSnapshot } from './validate'
import { emptySnapshot } from './domain'

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
