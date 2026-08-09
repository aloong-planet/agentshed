// Seam 2 (the IPC contract): behavioural tests of snapshot schema validation — a good payload is admitted,
// a bad one is refused with a path.
import { describe, it, expect } from 'vitest'
import { validateSnapshot, validateProjectStats, validateProjectDetail, validateSessionTurn, validateSearchResult } from './validate'
import { emptySnapshot, emptyTokenStats } from './domain'

describe('validateSnapshot', () => {
  it('admits a valid snapshot (an empty snapshot is a valid base state)', () => {
    const r = validateSnapshot(emptySnapshot(1234))
    expect(r.ok).toBe(true)
  })

  it('admits a snapshot containing projects', () => {
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

  it('refuses a non-object', () => {
    expect(validateSnapshot(null).ok).toBe(false)
    expect(validateSnapshot('x').ok).toBe(false)
  })

  it('refuses a snapshot missing the v2 component arrays (forgetting to sync subagents/memory/codexPlugins surfaces at the boundary, R1)', () => {
    for (const field of ['subagents', 'memory', 'codexPlugins'] as const) {
      const snap = emptySnapshot(1) as unknown as { global: Record<string, unknown> }
      delete snap.global[field]
      const r = validateSnapshot(snap)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.failure.path).toContain(field)
    }
  })

  it('refuses a snapshot with a missing field and points at the path', () => {
    const bad = { scannedAt: 1, sides: { claude: { detected: true } }, projects: [] }
    const r = validateSnapshot(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.path).toContain('sides.codex')
  })

  it('refuses an invalid side on a project entry', () => {
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

  it('refuses a wrongly typed lastSessionAt (a string posing as a timestamp)', () => {
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

// Ticket session-view/01: session metadata carries its source file identity. Sessions travel over the
// getProjectDetail channel,
// which had no boundary validation at all (the preload simply did `as ProjectDetail`) — this ticket does
// not build
// an exhaustive ProjectDetail validator and covers only this ticket's addition.
describe('validateProjectStats (session metadata)', () => {
  const ok = {
    tokens: emptyTokenStats(),
    sessions: [
      { side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/.claude/projects/e/a.jsonl', questionCount: 3, forkState: 'none' }
    ]
  }

  it('admits a valid payload', () => {
    expect(validateProjectStats(ok).ok).toBe(true)
  })

  it('admits a project with no sessions', () => {
    expect(validateProjectStats({ tokens: emptyTokenStats(), sessions: [] }).ok).toBe(true)
  })

  it('refuses a session with no file and points at the path', () => {
    const bad = { ...ok, sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, questionCount: 3, forkState: 'none' }] }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('sessions[0].file')
  })

  it('refuses a session with no questionCount and points at the path', () => {
    const bad = {
      ...ok,
      sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/a.jsonl', forkState: 'none' }]
    }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('sessions[0].questionCount')
  })

  it('refuses an invalid forkState and points at the path — the three states are an enum, not an arbitrary string', () => {
    const bad = {
      ...ok,
      sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '/Users/x/a.jsonl', questionCount: 3, forkState: 'bogus-state' }]
    }
    const r = validateProjectStats(bad)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('sessions[0].forkState')
  })

  it('all three valid forkStates are admitted', () => {
    for (const st of ['none', 'stripped', 'uncertain']) {
      const v = { ...ok, sessions: [{ ...(ok.sessions[0] as object), forkState: st }] }
      expect(validateProjectStats(v).ok, st).toBe(true)
    }
  })

  it('refuses an empty-string file — an empty string is not an identity, and reading with it lands on cwd', () => {
    const bad = { ...ok, sessions: [{ side: 'claude', title: 't', at: 1, tokens: 10, file: '', questionCount: 3, forkState: 'none' }] }
    expect(validateProjectStats(bad).ok).toBe(false)
  })

  it('refuses an invalid side and a wrongly typed at', () => {
    expect(validateProjectStats({ ...ok, sessions: [{ ...ok.sessions[0], side: 'gemini' }] }).ok).toBe(false)
    expect(validateProjectStats({ ...ok, sessions: [{ ...ok.sessions[0], at: 'yesterday' }] }).ok).toBe(false)
  })

  it('refuses a sessions that is not an array', () => {
    expect(validateProjectStats({ tokens: emptyTokenStats(), sessions: null }).ok).toBe(false)
  })
})

// Ticket contract-guards/01: ProjectDetail's boundary validation.
//
// [A known gap, stated honestly] The validator itself has 24 cases plus one full scan over real data
// (38 registered
// projects, 0 false refusals), but **two wiring points have no behavioural test**: the main process's
// exit assertProjectDetail
// and the validation at the preload's entry, both of which are only backstopped by "removing it makes
// typecheck complain about an unused import".
// Really testing them needs an electron IPC test harness for preload and main — not built in this ticket,
// and the condition for covering them is that
// harness existing. In the real-data scan the mcp field was **always empty** (this machine has no
// project-level MCP configuration),
// so that branch has fixture coverage only.
// The snapshot is validated at each end, while this detail channel had nothing — the preload simply did
// `as ProjectDetail`.
//
// ⚠️ This kind of validation is **fail-closed**: one false refusal means the whole detail page will not
//    open. So "a valid payload
//    must be admitted" matters as much as "a bad payload must be refused", and the two groups below are
//    comparable in size.
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
        name: 'code-reviewer', side: 'codex', level: 'global', description: 'review code',
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

describe('validateProjectDetail — admitting (a false refusal stops the whole detail page opening)', () => {
  it('admits a complete valid payload', () => {
    expect(validateProjectDetail(okDetail())).toEqual({ ok: true })
  })

  it('admits the base state with every array empty (the norm for a new project or one with no components)', () => {
    const d = { ...okDetail(), skills: [], subagents: [], plugins: [], mcp: [], artifacts: [],
      memory: { main: null, topics: [] } }
    expect(validateProjectDetail(d).ok).toBe(true)
  })

  it('admits a non-null stats (when the overview has data)', () => {
    const d = { ...okDetail(), stats: { tokens: emptyTokenStats(), sessions: [] } }
    expect(validateProjectDetail(d).ok).toBe(true)
  })

  it('admits nullable fields holding non-null values', () => {
    const d = okDetail()
    // configs.claudeMd has been a CappedText since ticket 07 (the body plus whether it was truncated)
    ;(d.configs as Record<string, unknown>).claudeMd = { text: '# project conventions', truncated: false }
    ;(d.mcp as Array<Record<string, unknown>>)[0].enabled = false
    ;(d.plugins as Array<Record<string, unknown>>)[0].enabledFrom = null
    ;(d.plugins as Array<Record<string, unknown>>)[0].version = null
    expect(validateProjectDetail(d).ok).toBe(true)
  })
})

describe('validateProjectDetail — refusing, and pointing at the field path', () => {
  const bad = (mut: (d: Record<string, unknown>) => void): ReturnType<typeof validateProjectDetail> => {
    const d = okDetail(); mut(d); return validateProjectDetail(d)
  }
  const errOf = (r: ReturnType<typeof validateProjectDetail>): string => (r.ok ? '' : r.failure.path)

  it('a non-object, or a missing path', () => {
    expect(validateProjectDetail(null).ok).toBe(false)
    expect(errOf(bad((d) => { delete d.path }))).toContain('path')
  })

  it('a missing top-level array — forgetting to sync a new section surfaces at the boundary', () => {
    for (const k of ['skills', 'subagents', 'plugins', 'mcp', 'artifacts']) {
      const r = bad((d) => { delete d[k] })
      expect(r.ok, `a missing ${k} should be refused`).toBe(false)
      expect(errOf(r)).toContain(k)
    }
  })

  it('an invalid enum value', () => {
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].level = 'workspace' }))).toContain('skills[0].level')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].side = 'gemini' }))).toContain('skills[0].side')
    // pkg: null is valid; a non-object or non-numeric field is refused
    expect(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].pkg = null }).ok).toBe(true)
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].pkg = 'big' }))).toContain('skills[0].pkg')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].pkg = { files: '1', bytes: 2 } }))).toContain('skills[0].pkg')
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].origin = 'net' }))).toContain('skills[0].origin')
    expect(errOf(bad((d) => { (d.plugins as Array<Record<string, unknown>>)[0].enabledFrom = 'team' }))).toContain('plugins[0].enabledFrom')
    expect(errOf(bad((d) => { (d.artifacts as Array<Record<string, unknown>>)[0].type = 'essay' }))).toContain('artifacts[0].type')
  })

  it('a boolean field written as another type', () => {
    expect(errOf(bad((d) => { (d.skills as Array<Record<string, unknown>>)[0].symlink = 'yes' }))).toContain('skills[0].symlink')
    expect(errOf(bad((d) => { (d.plugins as Array<Record<string, unknown>>)[0].enabled = 1 }))).toContain('plugins[0].enabled')
  })

  it('a nullable field written as something other than string|null', () => {
    expect(errOf(bad((d) => { (d.configs as Record<string, unknown>).agentsMd = 42 }))).toContain('configs.agentsMd')
    expect(errOf(bad((d) => { (d.memory as Record<string, unknown>).main = {} }))).toContain('memory.main')
  })

  it('a missing nested structure', () => {
    expect(errOf(bad((d) => { delete (d.subagents as Array<Record<string, unknown>>)[0].detail }))).toContain('subagents[0].detail')
    expect(errOf(bad((d) => { delete (d.plugins as Array<Record<string, unknown>>)[0].contents }))).toContain('plugins[0].contents')
    expect(errOf(bad((d) => { delete (d.memory as Record<string, unknown>).topics }))).toContain('memory.topics')
    expect(errOf(bad((d) => { delete d.configs }))).toContain('configs')
  })

  it('stats reuses validateProjectStats, with the error path carrying the stats prefix', () => {
    const r = bad((d) => {
      d.stats = { tokens: emptyTokenStats(), sessions: [{ side: 'claude', title: 't', at: 1, tokens: 0 }] }
    })
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('sessions[0].file')
  })
})

// ── Ticket 04: the session page payload (the getSessionPage channel, validated at each end) ──
import { validateSessionPage } from './validate'

describe('validateSessionPage (the session page payload)', () => {
  const okPage = {
    file: '/Users/x/.claude/projects/-e/a.jsonl',
    side: 'claude',
    title: 'title',
    at: 1,
    tokens: 10,
    bytes: 2048,
    forkState: 'none',
    forkPoints: 0,
    forkParentTitle: null,
    forkParentFile: null,
    questions: [{ i: 1, text: 'question one', at: 1, tools: 2, subagents: 0 }]
  }

  it('admits a valid payload, including the base state with empty questions and a null at', () => {
    expect(validateSessionPage(okPage).ok).toBe(true)
    expect(validateSessionPage({ ...okPage, questions: [], at: null }).ok).toBe(true)
    expect(validateSessionPage({ ...okPage, questions: [{ i: 1, text: 't', at: null, tools: 0, subagents: 0 }] }).ok).toBe(true)
  })

  it('refuses an invalid side or forkState and points at the path', () => {
    const r1 = validateSessionPage({ ...okPage, side: 'gemini' })
    expect(r1.ok === false && r1.failure.path).toContain('side')
    const r2 = validateSessionPage({ ...okPage, forkState: 'bogus-state' })
    expect(r2.ok === false && r2.failure.path).toContain('forkState')
  })

  it('refuses a question item with a missing field, carrying its index in the path', () => {
    const r = validateSessionPage({ ...okPage, questions: [{ i: 1, at: 1, tools: 0, subagents: 0 }] })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.failure.path).toContain('questions[0].text')
  })

  it('refuses a non-array questions, an empty file, or a non-numeric count', () => {
    expect(validateSessionPage({ ...okPage, questions: 'not an array' }).ok).toBe(false)
    expect(validateSessionPage({ ...okPage, file: '' }).ok).toBe(false)
    expect(validateSessionPage({ ...okPage, questions: [{ i: 1, text: 't', at: 1, tools: '2', subagents: 0 }] }).ok).toBe(false)
  })

  // Ticket 06: the banner's three data fields
  it('admits a stripped page carrying the parent title and file; refuses a missing or wrongly typed forkPoints', () => {
    const stripped = {
      ...okPage,
      side: 'codex',
      forkState: 'stripped',
      forkParentTitle: 'parent session title',
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

describe('validateSessionTurn (the single-turn fetch payload, ticket 05)', () => {
  const ok = {
    blocks: [{ kind: 'text', role: 'assistant', at: 1754300000000, body: 'the answer body' }],
    bytesRead: 2048
  }

  it('admits a valid payload; empty blocks are valid too (that turn has no prose)', () => {
    expect(validateSessionTurn(ok).ok).toBe(true)
    expect(validateSessionTurn({ blocks: [], bytesRead: 0 }).ok).toBe(true)
    expect(validateSessionTurn({ blocks: [{ ...ok.blocks[0], at: null }], bytesRead: 1 }).ok).toBe(true)
  })

  it('refuses a missing bytesRead or a non-array blocks, and points at the path', () => {
    const r1 = validateSessionTurn({ blocks: [] })
    expect(r1.ok === false && r1.failure.path).toContain('bytesRead')
    const r2 = validateSessionTurn({ blocks: 'not an array', bytesRead: 0 })
    expect(r2.ok === false && r2.failure.path).toContain('blocks')
  })

  it('refuses an invalid block: an unknown kind, a non-string body, or an at that is not number|null', () => {
    const bad1 = { blocks: [{ kind: 'video', role: 'assistant', at: null, body: 'x' }], bytesRead: 1 }
    const r1 = validateSessionTurn(bad1)
    expect(r1.ok === false && r1.failure.path).toContain('blocks[0]')
    const bad2 = { blocks: [{ kind: 'text', role: 'assistant', at: null, body: 42 }], bytesRead: 1 }
    expect(validateSessionTurn(bad2).ok).toBe(false)
    const bad3 = { blocks: [{ kind: 'text', role: 'assistant', at: 'yesterday', body: 'x' }], bytesRead: 1 }
    expect(validateSessionTurn(bad3).ok).toBe(false)
  })
})

describe('validateSessionTurn — ticket 07\'s rich content blocks', () => {
  const okBlocks = [
    { kind: 'text', role: 'assistant', at: 1, body: 'body' },
    { kind: 'think', at: 1, body: 'thinking' },
    { kind: 'reason', at: null, titles: ['sub-heading'] },
    { kind: 'tool', at: 1, name: 'Bash', summary: 'ls', input: 'ls', output: 'ok', truncated: false },
    { kind: 'tool', at: 1, name: 'Read', summary: 'f', input: 'f', output: null, truncated: true },
    {
      kind: 'sub', at: 1, name: 'debugger', prompt: 'check logs',
      steps: [{ kind: 'text', label: 'look at logs' }, { kind: 'tool', label: 'Bash · tail' }],
      result: 'clean', unlinked: false
    },
    { kind: 'unknown', count: 2, types: ['agent_snapshot'] }
  ]

  it('admits all seven block shapes', () => {
    expect(validateSessionTurn({ blocks: okBlocks, bytesRead: 1 }).ok).toBe(true)
  })

  it('refuses: a tool with no name, a sub whose step kind is invalid, or an unknown.types that is not a string array', () => {
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

  it('refuses an unknown kind (allow-list validation: a kind added after 07 has to pass the contract first)', () => {
    expect(validateSessionTurn({ blocks: [{ kind: 'hologram' }], bytesRead: 1 }).ok).toBe(false)
  })
})

describe('validateSearchResult (the search payload, ticket 08)', () => {
  const ok = {
    groups: [
      {
        file: '/Users/x/.claude/projects/-e/a.jsonl',
        title: 'title',
        side: 'claude',
        forkState: 'none',
        at: 1,
        hits: [
          { i: 1, text: 'question hit', at: 1, inBody: false, snippet: null },
          { i: 1, text: 'question hit', at: null, inBody: true, snippet: '…context magicword context…' }
        ]
      }
    ],
    totalHits: 2,
    sessionCount: 1,
    folded: 3
  }

  it('admits a valid payload and the empty-result base state', () => {
    expect(validateSearchResult(ok).ok).toBe(true)
    expect(validateSearchResult({ groups: [], totalHits: 0, sessionCount: 0, folded: 0 }).ok).toBe(true)
  })

  it('refuses a missing folded, a hit with no inBody, or a wrongly typed snippet, and points at the path', () => {
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

  it('refuses an invalid group-level forkState or an empty file', () => {
    const b1 = JSON.parse(JSON.stringify(ok)) as typeof ok
    ;(b1.groups[0] as unknown as Record<string, unknown>)['forkState'] = 'bogus-state'
    expect(validateSearchResult(b1).ok).toBe(false)
    const b2 = JSON.parse(JSON.stringify(ok)) as typeof ok
    ;(b2.groups[0] as unknown as Record<string, unknown>)['file'] = ''
    expect(validateSearchResult(b2).ok).toBe(false)
  })
})
