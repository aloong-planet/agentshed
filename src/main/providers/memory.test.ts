// Memory 全局汇总(spec: subagents-memory-plugin 序列 C):
// 元数据+文件名列表进快照,内容不进(C8);以项目注册表为准(C5);Codex 探测式(C6)。
// 已知缺口:①抽屉读取失败路径(文件被删/白名单拒绝→UI 报错不崩)属 UI 层,
//   按 ADR-0002 不单测,e2e 覆盖正常读取链路,失败分支靠手测;
//   ②D4 纯 Codex 项目的空态文案属 UI 层,同上。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import { encodeClaudeProjectDir } from './claude'
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
/** 注册一个项目(写 ~/.claude.json projects 键)并可选造 memory 目录 */
function register(projects: string[]): void {
  writeFileSync(
    join(dir, '.claude.json'),
    JSON.stringify({ projects: Object.fromEntries(projects.map((p) => [p, {}])) })
  )
}
function mkMemory(projectPath: string, files: Record<string, { body: string; mtime: number }>): void {
  const d = join(dir, '.claude', 'projects', encodeClaudeProjectDir(projectPath), 'memory')
  mkdirSync(d, { recursive: true })
  for (const [name, { body, mtime }] of Object.entries(files)) {
    const f = join(d, name)
    writeFileSync(f, body)
    utimesSync(f, new Date(mtime), new Date(mtime))
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-mem-'))
  register([])
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Memory 全局汇总', () => {
  it('C3/C4/C8 有 memory 的项目入列:元数据+文件名(含绝对路径与 mtime),不含内容;按最近修改倒序', async () => {
    const pa = join(dir, 'proj-a')
    const pb = join(dir, 'proj-b')
    mkdirSync(pa)
    mkdirSync(pb)
    register([pa, pb])
    mkMemory(pa, { 'MEMORY.md': { body: '# 主文件', mtime: 1_000 }, 'topic.md': { body: 't', mtime: 2_000 } })
    mkMemory(pb, { 'only-topic.md': { body: 't', mtime: 9_000 } }) // C3:无 MEMORY.md 仅 topic
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toHaveLength(2)
    // 倒序:proj-b(9000) 在前
    expect(snap.global.memory[0].projectPath).toBe(pb)
    expect(snap.global.memory[0].hasMain).toBe(false)
    expect(snap.global.memory[1].projectPath).toBe(pa)
    expect(snap.global.memory[1].hasMain).toBe(true)
    const files = snap.global.memory[1].files
    expect(files.map((f) => f.name).sort()).toEqual(['MEMORY.md', 'topic.md'])
    expect(files[0].file.startsWith('/')).toBe(true)
    expect(files.every((f) => typeof f.mtimeMs === 'number')).toBe(true)
    expect(JSON.stringify(snap.global.memory)).not.toContain('# 主文件') // 内容不进快照
  })

  it('C2 memory 目录存在但为空 → 不入列;无 memory 目录 → 不入列', async () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkdirSync(join(dir, '.claude', 'projects', encodeClaudeProjectDir(pa), 'memory'), { recursive: true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toEqual([])
  })

  it('C5 编码目录在注册表无对应项目 → 不入列(以注册表为准)', async () => {
    mkMemory(join(dir, 'ghost-proj'), { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toEqual([])
  })

  it('C4 失效(stale)项目照常入列并带标记', async () => {
    const gone = join(dir, 'deleted-proj') // 不创建目录 → stale
    register([gone])
    mkMemory(gone, { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory).toHaveLength(1)
    expect(snap.global.memory[0].stale).toBe(true)
  })

  it('C4 已隐藏(hidden)项目照常入列并带标记', async () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkMemory(pa, { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    const snap = await scan(roots(), { now: () => 1, isHidden: (p) => p === pa })
    expect(snap.global.memory[0].hidden).toBe(true)
  })

  it('C6 Codex memories 目录空 → 无 codex 条目;非空 → 探测式入列', async () => {
    mkdirSync(join(dir, '.codex', 'memories'), { recursive: true })
    let snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.memory.filter((m) => m.side === 'codex')).toEqual([])
    writeFileSync(join(dir, '.codex', 'memories', 'consolidated.md'), 'mem')
    snap = await scan(roots(), { now: () => 1 })
    const cx = snap.global.memory.filter((m) => m.side === 'codex')
    expect(cx).toHaveLength(1)
    expect(cx[0].projectPath).toBeNull()
    expect(cx[0].files.map((f) => f.name)).toEqual(['consolidated.md'])
  })
})

// ── 项目详情 Memory(序列 D) ──
import { readProjectDetail } from './project-detail'

describe('项目详情 memory', () => {
  it('D2 MEMORY.md 内容直出;topic 仅元数据(内容走按需通道)', () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkMemory(pa, {
      'MEMORY.md': { body: '# 主文件内容', mtime: 1_000 },
      'topic-a.md': { body: 'topic 正文', mtime: 2_000 }
    })
    const detail = readProjectDetail(roots(), pa)
    expect(detail.memory.main).toContain('# 主文件内容')
    expect(detail.memory.topics.map((t) => t.name)).toEqual(['topic-a.md'])
    expect(JSON.stringify(detail.memory.topics)).not.toContain('topic 正文')
  })

  it('D1 无 memory 目录 → main null + topics 空(UI 空态)', () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    const detail = readProjectDetail(roots(), pa)
    expect(detail.memory.main).toBeNull()
    expect(detail.memory.topics).toEqual([])
  })

  it('D3 memory 下的子目录(如 subagent 级)不读取', () => {
    const pa = join(dir, 'proj-a')
    mkdirSync(pa)
    register([pa])
    mkMemory(pa, { 'MEMORY.md': { body: 'x', mtime: 1_000 } })
    mkdirSync(
      join(dir, '.claude', 'projects', encodeClaudeProjectDir(pa), 'memory', 'sub.md'),
      { recursive: true }
    ) // 同名目录混淆项:是目录不是文件,不得入列
    const detail = readProjectDetail(roots(), pa)
    expect(detail.memory.topics).toEqual([])
  })
})
