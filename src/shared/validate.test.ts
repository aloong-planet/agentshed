// Seam 2(IPC 契约):快照 schema 校验的行为测试——好载荷放行、坏载荷拒收并给出路径。
import { describe, it, expect } from 'vitest'
import { validateSnapshot, validateProjectStats, validateProjectDetail, validateSessionTurn, validateSearchResult } from './validate'
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
      if (!r.ok) expect(r.failure.path).toContain(field)
    }
  })

  it('拒收缺字段的快照并指出路径', () => {
    const bad = { scannedAt: 1, sides: { claude: { detected: true } }, projects: [] }
    const r = validateSnapshot(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.path).toContain('sides.codex')
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
    if (!r.ok) expect(r.failure.path).toContain('sides')
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
    sessions: [
      { side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/.claude/projects/e/a.jsonl', questionCount: 3, forkState: 'none' }
    ]
  }

  it('放行合法载荷', () => {
    expect(validateProjectStats(ok).ok).toBe(true)
  })

  it('放行 sessions 为空的项目', () => {
    expect(validateProjectStats({ tokens: emptyTokenStats(), sessions: [] }).ok).toBe(true)
  })

  it('拒收缺 file 的会话并指出路径', () => {
    const bad = { ...ok, sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, questionCount: 3, forkState: 'none' }] }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('sessions[0].file')
  })

  it('拒收缺 questionCount 的会话并指出路径', () => {
    const bad = {
      ...ok,
      sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/a.jsonl', forkState: 'none' }]
    }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('sessions[0].questionCount')
  })

  it('拒收非法 forkState 并指出路径——三态是枚举,不能是任意串', () => {
    const bad = {
      ...ok,
      sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/a.jsonl', questionCount: 3, forkState: '存疑' }]
    }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('sessions[0].forkState')
  })

  it('三种合法 forkState 都放行', () => {
    for (const st of ['none', 'stripped', 'uncertain']) {
      const v = { ...ok, sessions: [{ ...(ok.sessions[0] as object), forkState: st }] }
      expect(validateProjectStats(v).ok, st).toBe(true)
    }
  })

  it('拒收空字符串 file——空串不是标识,拿它去读会落到 cwd', () => {
    const bad = { ...ok, sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '', questionCount: 3, forkState: 'none' }] }
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
        symlink: false, pkg: { files: 1, bytes: 10 },
        origin: 'disk', pluginName: null, pluginRoot: null, pluginSkillName: null
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
        name: 'superpowers@official', version: '6.2.0', installPath: '/cache/sp', enabled: true, enabledFrom: 'project',
        installs: [{ scope: 'project', projectPath: '/Users/x/proj', projectMissing: false, installPath: null, version: null }],
        contents: { skills: [{ name: 'brainstorming', description: null, pkg: { files: 1, bytes: 8 } }], agents: [], hooks: [], mcp: [], missing: false }
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
  const errOf = (r: ReturnType<typeof validateProjectDetail>): string => (r.ok ? '' : r.failure.path)

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
    // pkg:null 合法;非对象/字段非数字拒收
    expect(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].pkg = null }).ok).toBe(true)
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].pkg = 'big' }))).toContain('skills[0].pkg')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].pkg = { files: '1', bytes: 2 } }))).toContain('skills[0].pkg')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].origin = 'net' }))).toContain('skills[0].origin')
    expect(errOf(bad((d) => { (d.plugins as Array<Record<string, unknown>>)[0].enabledFrom = 'team' }))).toContain('plugins[0].enabledFrom')
    expect(errOf(bad((d) => { (d.artifacts as Array<Record<string, unknown>>)[0].type = '随笔' }))).toContain('artifacts[0].type')
  })

  it('布尔字段被写成别的类型', () => {
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].symlink = 'yes' }))).toContain('skills[0].symlink')
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

// ── 票 04:会话页载荷(getSessionPage 通道,两端各校验一次)──
import { validateSessionPage } from './validate'

describe('validateSessionPage(会话页载荷)', () => {
  const okPage = {
    file: '/Users/x/.claude/projects/-e/a.jsonl',
    side: 'claude',
    title: '标题',
    at: 1,
    tokens: 10,
    bytes: 2048,
    forkState: 'none',
    forkPoints: 0,
    forkParentTitle: null,
    forkParentFile: null,
    questions: [{ i: 1, text: '问一', at: 1, tools: 2, subagents: 0 }]
  }

  it('放行合法载荷,含 questions 为空的基态与 at 为 null', () => {
    expect(validateSessionPage(okPage).ok).toBe(true)
    expect(validateSessionPage({ ...okPage, questions: [], at: null }).ok).toBe(true)
    expect(validateSessionPage({ ...okPage, questions: [{ i: 1, text: 't', at: null, tools: 0, subagents: 0 }] }).ok).toBe(true)
  })

  it('拒收非法 side / forkState 并指出路径', () => {
    const r1 = validateSessionPage({ ...okPage, side: 'gemini' })
    expect(r1.ok === false && r1.failure.path).toContain('side')
    const r2 = validateSessionPage({ ...okPage, forkState: '存疑' })
    expect(r2.ok === false && r2.failure.path).toContain('forkState')
  })

  it('拒收缺字段的提问项并带下标路径', () => {
    const r = validateSessionPage({ ...okPage, questions: [{ i: 1, at: 1, tools: 0, subagents: 0 }] })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('questions[0].text')
  })

  it('拒收 questions 非数组 / 空 file / 计数非 number', () => {
    expect(validateSessionPage({ ...okPage, questions: '不是数组' }).ok).toBe(false)
    expect(validateSessionPage({ ...okPage, file: '' }).ok).toBe(false)
    expect(validateSessionPage({ ...okPage, questions: [{ i: 1, text: 't', at: 1, tools: '2', subagents: 0 }] }).ok).toBe(false)
  })

  // 票 06:横幅数据面三字段
  it('放行 stripped 页带父标题/父文件;拒收缺 forkPoints 或类型不对的', () => {
    const stripped = {
      ...okPage,
      side: 'codex',
      forkState: 'stripped',
      forkParentTitle: '父会话标题',
      forkParentFile: '/Users/x/.codex/sessions/2026/07/30/rollout-x.jsonl'
    }
    expect(validateSessionPage(stripped).ok).toBe(true)
    const noFp = { ...okPage } as Record<string, unknown>
    delete noFp['forkPoints']
    const r1 = validateSessionPage(noFp)
    expect(r1.ok === false && r1.failure.path).toContain('forkPoints')
    const r2 = validateSessionPage({ ...okPage, forkParentTitle: 42 })
    expect(r2.ok === false && r2.failure.path).toContain('forkParentTitle')
    const r3 = validateSessionPage({ ...okPage, forkParentFile: 42 })
    expect(r3.ok === false && r3.failure.path).toContain('forkParentFile')
  })
})

describe('validateSessionTurn(单轮取回载荷,票 05)', () => {
  const ok = {
    blocks: [{ kind: 'text', role: 'assistant', at: 1754300000000, body: '回答正文' }],
    bytesRead: 2048
  }

  it('放行合法载荷;空 blocks 也合法(该轮没有正文)', () => {
    expect(validateSessionTurn(ok).ok).toBe(true)
    expect(validateSessionTurn({ blocks: [], bytesRead: 0 }).ok).toBe(true)
    expect(validateSessionTurn({ blocks: [{ ...ok.blocks[0], at: null }], bytesRead: 1 }).ok).toBe(true)
  })

  it('拒收缺 bytesRead / blocks 非数组,并指出路径', () => {
    const r1 = validateSessionTurn({ blocks: [] })
    expect(r1.ok === false && r1.failure.path).toContain('bytesRead')
    const r2 = validateSessionTurn({ blocks: '不是数组', bytesRead: 0 })
    expect(r2.ok === false && r2.failure.path).toContain('blocks')
  })

  it('拒收非法块:kind 未知 / body 非 string / at 非 number|null', () => {
    const bad1 = { blocks: [{ kind: 'video', role: 'assistant', at: null, body: 'x' }], bytesRead: 1 }
    const r1 = validateSessionTurn(bad1)
    expect(r1.ok === false && r1.failure.path).toContain('blocks[0]')
    const bad2 = { blocks: [{ kind: 'text', role: 'assistant', at: null, body: 42 }], bytesRead: 1 }
    expect(validateSessionTurn(bad2).ok).toBe(false)
    const bad3 = { blocks: [{ kind: 'text', role: 'assistant', at: '昨天', body: 'x' }], bytesRead: 1 }
    expect(validateSessionTurn(bad3).ok).toBe(false)
  })
})

describe('validateSessionTurn —— 票 07 富内容块', () => {
  const okBlocks = [
    { kind: 'text', role: 'assistant', at: 1, body: '正文' },
    { kind: 'think', at: 1, body: '想' },
    { kind: 'reason', at: null, titles: ['小标题'] },
    { kind: 'tool', at: 1, name: 'Bash', summary: 'ls', input: 'ls', output: 'ok', truncated: false },
    { kind: 'tool', at: 1, name: 'Read', summary: 'f', input: 'f', output: null, truncated: true },
    {
      kind: 'sub', at: 1, name: 'debugger', prompt: '查日志',
      steps: [{ kind: 'text', label: '看日志' }, { kind: 'tool', label: 'Bash · tail' }],
      result: '干净', unlinked: false
    },
    { kind: 'unknown', count: 2, types: ['agent_snapshot'] }
  ]

  it('放行全部七种块形态', () => {
    expect(validateSessionTurn({ blocks: okBlocks, bytesRead: 1 }).ok).toBe(true)
  })

  it('拒收:tool 缺 name / sub 的 step kind 非法 / unknown.types 非 string 数组', () => {
    const bad1 = { blocks: [{ kind: 'tool', at: 1, summary: 's', input: 'i', output: null, truncated: false }], bytesRead: 1 }
    const r1 = validateSessionTurn(bad1)
    expect(r1.ok === false && r1.failure.path).toContain('blocks[0]')
    const bad2 = {
      blocks: [{ kind: 'sub', at: 1, name: 'x', prompt: '', steps: [{ kind: 'video', label: 'x' }], result: null, unlinked: false }],
      bytesRead: 1
    }
    expect(validateSessionTurn(bad2).ok).toBe(false)
    const bad3 = { blocks: [{ kind: 'unknown', count: 1, types: [42] }], bytesRead: 1 }
    expect(validateSessionTurn(bad3).ok).toBe(false)
  })

  it('拒收未知 kind(白名单校验,07 之后的新 kind 要先过契约)', () => {
    expect(validateSessionTurn({ blocks: [{ kind: 'hologram' }], bytesRead: 1 }).ok).toBe(false)
  })
})

describe('validateSearchResult(搜索载荷,票 08)', () => {
  const ok = {
    groups: [
      {
        file: '/Users/x/.claude/projects/-e/a.jsonl',
        title: '标题',
        side: 'claude',
        forkState: 'none',
        at: 1,
        hits: [
          { i: 1, text: '提问命中', at: 1, inBody: false, snippet: null },
          { i: 1, text: '提问命中', at: null, inBody: true, snippet: '…上下文 magicword 上下文…' }
        ]
      }
    ],
    totalHits: 2,
    sessionCount: 1,
    folded: 3
  }

  it('放行合法载荷与空结果基态', () => {
    expect(validateSearchResult(ok).ok).toBe(true)
    expect(validateSearchResult({ groups: [], totalHits: 0, sessionCount: 0, folded: 0 }).ok).toBe(true)
  })

  it('拒收缺 folded / hits 项缺 inBody / snippet 类型错,并指出路径', () => {
    const noFolded = { ...ok } as Record<string, unknown>
    delete noFolded['folded']
    const r1 = validateSearchResult(noFolded)
    expect(r1.ok === false && r1.failure.path).toContain('folded')
    const badHit = JSON.parse(JSON.stringify(ok)) as typeof ok
    delete (badHit.groups[0].hits[0] as unknown as Record<string, unknown>)['inBody']
    const r2 = validateSearchResult(badHit)
    expect(r2.ok === false && r2.failure.path).toContain('hits[0]')
    const badSnip = JSON.parse(JSON.stringify(ok)) as typeof ok
    ;(badSnip.groups[0].hits[0] as unknown as Record<string, unknown>)['snippet'] = 42
    expect(validateSearchResult(badSnip).ok).toBe(false)
  })

  it('拒收组级非法 forkState / 空 file', () => {
    const b1 = JSON.parse(JSON.stringify(ok)) as typeof ok
    ;(b1.groups[0] as unknown as Record<string, unknown>)['forkState'] = '存疑'
    expect(validateSearchResult(b1).ok).toBe(false)
    const b2 = JSON.parse(JSON.stringify(ok)) as typeof ok
    ;(b2.groups[0] as unknown as Record<string, unknown>)['file'] = ''
    expect(validateSearchResult(b2).ok).toBe(false)
  })
})
