// Seam 2(IPC 契约):快照 schema 校验的行为测试——好载荷放行、坏载荷拒收并给出路径。
import { describe, it, expect } from 'vitest'
import { validateSnapshot, validateProjectStats, validateProjectDetail } from './validate'
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

// 票 contract-guards/01:ProjectDetail 的边界校验。
//
// 【已知缺口,如实标注】校验器本身有 24 条用例 + 一次真实数据全量扫(38 个注册
// 项目,0 误拒),但**两处接线没有行为测试**:主进程出口的 assertProjectDetail
// 与 preload 入口的校验,都只在"删掉后 typecheck 因未用 import 报错"这一层被兜住。
// 要真测得给 preload/main 建 electron IPC 的测试装置——本票不铺,补测条件是那套
// 装置到位。真实数据扫描里 mcp 一项**始终为空**(本机无项目级 MCP 配置),
// 那条分支只有 fixture 覆盖。
// 快照有两端各校验一次,而详情这条通道此前完全没有——preload 里直接 as ProjectDetail。
//
// ⚠️ 这类校验是 **fail-closed** 的:一次误拒就是整个详情页打不开。所以"合法载荷
//    必须放行"和"坏载荷必须拒收"同等重要,下面两组用例数量相当。
function okDetail(): Record<string, unknown> {
  return {
    path: '/Users/x/proj',
    skills: [
      {
        name: 'tdd', description: null, level: 'project', side: 'claude',
        symlink: false, shadowed: false, shadows: true, coexists: false,
        origin: 'disk', pluginName: null
      }
    ],
    subagents: [
      {
        name: 'code-reviewer', side: 'codex', level: 'global', description: '审代码',
        detail: { content: null, description: null, tools: null, model: null, sandbox: null, error: null },
        shadows: false, shadowed: false, overridesBuiltin: false
      }
    ],
    memory: { main: null, topics: [{ name: 'a.md', file: '/Users/x/a.md', mtimeMs: 1 }] },
    plugins: [
      {
        name: 'superpowers@official', version: '6.2.0', enabled: true, enabledFrom: 'project',
        installs: [{ scope: 'project', projectPath: '/Users/x/proj', projectMissing: false, installPath: null, version: null }],
        contents: { skills: [{ name: 'brainstorming', description: null }], agents: [], hooks: [], mcp: [], missing: false }
      }
    ],
    mcp: [{ name: 'figma', enabled: null }],
    configs: { claudeMd: null, agentsMd: null, settingsSummary: null },
    stats: null,
    artifacts: [{ type: 'adr', title: 'ADR-0001', file: '/Users/x/adr.md', mtimeMs: 2 }]
  }
}

describe('validateProjectDetail —— 放行(误拒会让详情页整个打不开)', () => {
  it('放行完整合法载荷', () => {
    expect(validateProjectDetail(okDetail())).toEqual({ ok: true })
  })

  it('放行各数组为空的基态(新项目/无组件项目的常态)', () => {
    const d = { ...okDetail(), skills: [], subagents: [], plugins: [], mcp: [], artifacts: [],
      memory: { main: null, topics: [] } }
    expect(validateProjectDetail(d).ok).toBe(true)
  })

  it('放行 stats 非 null(概览有数据时)', () => {
    const d = { ...okDetail(), stats: { tokens: emptyTokenStats(), sessions: [] } }
    expect(validateProjectDetail(d).ok).toBe(true)
  })

  it('放行各可空字段取到非 null 值', () => {
    const d = okDetail()
    ;(d.configs as Record<string, unknown>).claudeMd = '# 项目约定'
    ;(d.mcp as Array<Record<string, unknown>>)[0].enabled = false
    ;(d.plugins as Array<Record<string, unknown>>)[0].enabledFrom = null
    ;(d.plugins as Array<Record<string, unknown>>)[0].version = null
    expect(validateProjectDetail(d).ok).toBe(true)
  })
})

describe('validateProjectDetail —— 拒收并指出字段路径', () => {
  const bad = (mut: (d: Record<string, unknown>) => void): ReturnType<typeof validateProjectDetail> => {
    const d = okDetail(); mut(d); return validateProjectDetail(d)
  }
  const errOf = (r: ReturnType<typeof validateProjectDetail>): string => (r.ok ? '' : r.error)

  it('非对象 / 缺 path', () => {
    expect(validateProjectDetail(null).ok).toBe(false)
    expect(errOf(bad((d) => { delete d.path }))).toContain('path')
  })

  it('顶层数组缺失 —— 漏同步新分栏时在边界暴露', () => {
    for (const k of ['skills', 'subagents', 'plugins', 'mcp', 'artifacts']) {
      const r = bad((d) => { delete d[k] })
      expect(r.ok, `${k} 缺失应被拒`).toBe(false)
      expect(errOf(r)).toContain(k)
    }
  })

  it('枚举值非法', () => {
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].level = 'workspace' }))).toContain('skills[0].level')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].side = 'gemini' }))).toContain('skills[0].side')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].origin = 'net' }))).toContain('skills[0].origin')
    expect(errOf(bad((d) => { (d.plugins as Array<Record<string, unknown>>)[0].enabledFrom = 'team' }))).toContain('plugins[0].enabledFrom')
    expect(errOf(bad((d) => { (d.artifacts as Array<Record<string, unknown>>)[0].type = '随笔' }))).toContain('artifacts[0].type')
  })

  it('布尔字段被写成别的类型', () => {
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].shadowed = 'yes' }))).toContain('skills[0].shadowed')
    expect(errOf(bad((d) => { (d.plugins as Array<Record<string, unknown>>)[0].enabled = 1 }))).toContain('plugins[0].enabled')
  })

  it('可空字段被写成非 string|null', () => {
    expect(errOf(bad((d) => { (d.configs as Record<string, unknown>).agentsMd = 42 }))).toContain('configs.agentsMd')
    expect(errOf(bad((d) => { (d.memory as Record<string, unknown>).main = {} }))).toContain('memory.main')
  })

  it('嵌套结构缺失', () => {
    expect(errOf(bad((d) => { delete (d.subagents as Array<Record<string, unknown>>)[0].detail }))).toContain('subagents[0].detail')
    expect(errOf(bad((d) => { delete (d.plugins as Array<Record<string, unknown>>)[0].contents }))).toContain('plugins[0].contents')
    expect(errOf(bad((d) => { delete (d.memory as Record<string, unknown>).topics }))).toContain('memory.topics')
    expect(errOf(bad((d) => { delete d.configs }))).toContain('configs')
  })

  it('stats 复用 validateProjectStats,错误路径带 stats 前缀', () => {
    const r = bad((d) => {
      d.stats = { tokens: emptyTokenStats(), sessions: [{ side: 'claude', title: 't', at: 1, tokens: 0 }] }
    })
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('sessions[0].file')
  })
})
