// Plugin scope 语义(spec: subagents-memory-plugin 序列 E/F):
// 安装记录不合并(E1);全局页启用口径=user 层(E4);
// 项目详情有效启用集 local > project > user(F1),层损坏降级(F2);F3 双向验收。
// 已知缺口:E2(projectPath 失联标注)/F4(Codex 组详情页注)/按侧分组渲染均属 UI 层,
//   按 ADR-0002 不单测;数据透传由 E1/E8 锁定,F3 全链路由 e2e 锁定。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import { readProjectDetail } from './project-detail'
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
function mkInstalled(plugins: Record<string, unknown[]>): void {
  const pdir = join(dir, '.claude', 'plugins')
  mkdirSync(pdir, { recursive: true })
  writeFileSync(join(pdir, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }))
}
function mkUserSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(dir, '.claude'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins }))
}
function mkProjSettings(proj: string, file: string, enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(proj, '.claude'), { recursive: true })
  writeFileSync(join(proj, '.claude', file), JSON.stringify({ enabledPlugins }))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-plg-'))
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('全局 plugins:scope 语义修复', () => {
  it('E1 同插件多条安装记录全量保留(user+project 双装,projectPath 随行)', async () => {
    const demo = join(dir, 'demo-proj')
    mkInstalled({
      'tdd-guard@community': [
        { scope: 'user', version: '2.4.1', installPath: '/cache/a' },
        { scope: 'project', version: '2.4.1', installPath: '/cache/a', projectPath: demo }
      ]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const p = snap.global.plugins[0]
    expect(p.installs).toHaveLength(2)
    expect(p.installs[0].scope).toBe('user')
    expect(p.installs[1]).toMatchObject({ scope: 'project', projectPath: demo })
  })

  it('E2 project-scope 记录的归属项目目录已不存在 → projectMissing 标注,不崩', async () => {
    const demo = join(dir, 'demo-exists')
    mkdirSync(demo, { recursive: true })
    mkInstalled({
      'p@mp': [
        { scope: 'project', version: '1.0.0', installPath: '/x', projectPath: demo },
        { scope: 'project', version: '1.0.0', installPath: '/x', projectPath: join(dir, 'gone-proj') }
      ]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const [ok, gone] = snap.global.plugins[0].installs
    expect(ok.projectMissing).toBe(false)
    expect(gone.projectMissing).toBe(true)
  })

  it('E3 scope 为 local/未知值原样保留;记录缺 scope 字段 → "(未知)"', async () => {
    mkInstalled({
      'a@mp': [{ scope: 'local', version: '1.0.0', installPath: '/x' }],
      'b@mp': [{ version: '1.0.0', installPath: '/x' }]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.plugins.map((p) => [p.name, p]))
    expect(byName['a@mp'].installs[0].scope).toBe('local')
    expect(byName['b@mp'].installs[0].scope).toBe('(未知)')
  })

  it('E4 全局页启用口径取 user 层:缺失与显式 false 均为未启用', async () => {
    mkInstalled({
      'a@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }],
      'b@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }],
      'c@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }]
    })
    mkUserSettings({ 'a@mp': true, 'b@mp': false })
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.plugins.map((p) => [p.name, p]))
    expect(byName['a@mp'].enabled).toBe(true)
    expect(byName['b@mp'].enabled).toBe(false)
    expect(byName['c@mp'].enabled).toBe(false)
  })
})

describe('项目详情 plugins:有效启用集(local > project > user)', () => {
  let proj: string
  beforeEach(() => {
    proj = join(dir, 'myproj')
    mkdirSync(proj, { recursive: true })
    mkInstalled({ 'p@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }] })
  })

  it('F1 项目层显式 false 压过 user 层 true;local 层再压过 project 层', () => {
    mkUserSettings({ 'p@mp': true })
    mkProjSettings(proj, 'settings.json', { 'p@mp': false })
    let d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: false, enabledFrom: 'project' })
    mkProjSettings(proj, 'settings.local.json', { 'p@mp': true })
    d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: true, enabledFrom: 'local' })
  })

  it('F1 任何层都未提及 → 未启用(enabledFrom null);仅 user 层启用 → user 生效', () => {
    let d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: false, enabledFrom: null })
    mkUserSettings({ 'p@mp': true })
    d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: true, enabledFrom: 'user' })
  })

  it('F2 项目层 settings 损坏 → 该层跳过,降级到 user 层,不崩', () => {
    mkUserSettings({ 'p@mp': true })
    mkdirSync(join(proj, '.claude'), { recursive: true })
    writeFileSync(join(proj, '.claude', 'settings.json'), '{broken json')
    const d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: true, enabledFrom: 'user' })
  })

  it('F3 验收:project-scope 安装 → 全局页未启用;归属项目详情里启用(project 层)', async () => {
    const demo = join(dir, 'demo')
    mkdirSync(demo, { recursive: true })
    mkInstalled({
      'superpowers@official': [
        { scope: 'project', version: '6.2.0', installPath: '/cache/sp', projectPath: demo }
      ]
    })
    mkProjSettings(demo, 'settings.json', { 'superpowers@official': true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.plugins.find((p) => p.name === 'superpowers@official')?.enabled).toBe(false)
    const d = readProjectDetail(roots(), demo)
    expect(d.plugins.find((p) => p.name === 'superpowers@official')).toMatchObject({
      enabled: true,
      enabledFrom: 'project'
    })
  })
})

// ── 内含组件展开(E5-E7)与 Codex 插件枚举(E8) ──

/** 造一个插件包目录:skills/agents/hooks/manifest 按需 */
function mkPluginPkg(root: string): void {
  mkdirSync(join(root, '.claude-plugin'), { recursive: true })
  // manifest:内联 mcpServers + hooks 字段指向额外文件(三形态之 string)
  writeFileSync(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({
      name: 'pkg',
      mcpServers: { 'pkg-server': { command: 'npx' } },
      hooks: './extra-hooks.json'
    })
  )
  writeFileSync(
    join(root, 'extra-hooks.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } })
  )
  // 目录约定 hooks
  mkdirSync(join(root, 'hooks'), { recursive: true })
  writeFileSync(
    join(root, 'hooks', 'hooks.json'),
    JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: 'startup|clear', hooks: [] }],
        PostToolUse: [{ matcher: 'Write', hooks: [] }, { matcher: 'Edit', hooks: [] }]
      }
    })
  )
  // skills:一个正常 + 一个损坏(无 description 行)
  mkdirSync(join(root, 'skills', 'good-skill'), { recursive: true })
  writeFileSync(join(root, 'skills', 'good-skill', 'SKILL.md'), '---\ndescription: 好技能\n---\nbody')
  mkdirSync(join(root, 'skills', 'broken-skill'), { recursive: true })
  writeFileSync(join(root, 'skills', 'broken-skill', 'SKILL.md'), ' 二进制垃圾')
  // agents
  mkdirSync(join(root, 'agents'), { recursive: true })
  writeFileSync(join(root, 'agents', 'helper.md'), '---\ndescription: h\n---\nx')
}

describe('插件内含组件展开', () => {
  it('E5 目录约定+manifest 字段合并:skills/agents/hooks/mcp 四类;单文件损坏条目保留名称', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    mkInstalled({ 'pkg@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }] })
    const snap = await scan(roots(), { now: () => 1 })
    const c = snap.global.plugins[0].contents
    expect(c.missing).toBe(false)
    expect(c.skills.map(({ name, description }) => ({ name, description }))).toEqual([
      { name: 'broken-skill', description: null },
      { name: 'good-skill', description: '好技能' }
    ])
    // H1:每条摘要带 stat-only 包统计
    expect(c.skills[0].pkg?.files).toBeGreaterThanOrEqual(1)
    expect(c.agents).toEqual(['helper'])
    // hooks:目录约定(SessionStart×1、PostToolUse×2)+ manifest 指向的额外文件(PreToolUse×1)
    const hooks = Object.fromEntries(c.hooks.map((h) => [h.event, h.matchers]))
    expect(hooks).toEqual({ PostToolUse: 2, PreToolUse: 1, SessionStart: 1 })
    expect(c.mcp).toEqual(['pkg-server'])
  })

  it('manifest 字段指向包外路径(../)→ 忽略,不读包外文件', async () => {
    const pkg = join(dir, 'pkg-root')
    mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
    writeFileSync(
      join(pkg, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'evil', hooks: '../outside-hooks.json', mcpServers: '../outside-mcp.json' })
    )
    // 包外真实存在这两个文件——若被读到就是路径逃逸
    writeFileSync(
      join(dir, 'outside-hooks.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'x', hooks: [] }] } })
    )
    writeFileSync(join(dir, 'outside-mcp.json'), JSON.stringify({ mcpServers: { leaked: {} } }))
    mkInstalled({ 'evil@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }] })
    const snap = await scan(roots(), { now: () => 1 })
    const c = snap.global.plugins[0].contents
    expect(c.hooks).toEqual([])
    expect(c.mcp).toEqual([])
  })

  it('E6 installPath 缺失/目录不存在 → contents.missing,列表行保留', async () => {
    mkInstalled({ 'ghost@mp': [{ scope: 'user', version: '0.1.0', installPath: '/gone/away' }] })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.plugins[0].contents.missing).toBe(true)
  })
})

describe('G 系列:插件内含 skills 并入 Skills 生效视图', () => {
  it('G1/G4 仅 user 层启用插件的 skills 进全局视图:命名空间条目,sides 恒 claude,origin=plugin', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    mkInstalled({
      'pkg@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }],
      'off@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }]
    })
    mkUserSettings({ 'pkg@mp': true }) // off@mp 未启用 → 其 skills 不出现
    const snap = await scan(roots(), { now: () => 1 })
    const pluginSkills = snap.global.skills.filter((s) => s.origin === 'plugin')
    expect(pluginSkills.map((s) => s.name).sort()).toEqual(['pkg:broken-skill', 'pkg:good-skill'])
    expect(pluginSkills[0].sides).toEqual(['claude'])
    expect(pluginSkills[0].pluginName).toBe('pkg@mp')
    // G3 同权预览:并入条目带包统计与摘要同源包根(ADR-0012)
    expect(pluginSkills[0].pkg.claude?.files).toBeGreaterThanOrEqual(1)
    expect(pluginSkills[0].pluginRoot).toBe(pkg)
    // 裸 skill 名随条目下发(UI 不再按 : 反解)
    expect(pluginSkills[0].pluginSkillName).toBe('broken-skill')
  })

  it('G2 与磁盘同名 skill 互不遮蔽:命名空间隔离,两条独立条目并存', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    mkInstalled({ 'pkg@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }] })
    mkUserSettings({ 'pkg@mp': true })
    // 磁盘全局库同基名 skill
    const sd = join(dir, '.claude', 'skills', 'good-skill')
    mkdirSync(sd, { recursive: true })
    writeFileSync(join(sd, 'SKILL.md'), '---\ndescription: 磁盘版\n---\nx')
    const snap = await scan(roots(), { now: () => 1 })
    const names = snap.global.skills.map((s) => s.name)
    expect(names).toContain('good-skill')
    expect(names).toContain('pkg:good-skill')
    const disk = snap.global.skills.find((s) => s.name === 'good-skill')
    expect(disk?.origin).toBe('disk')
  })

  it('G1 详情页口径:本项目有效启用集决定插件 skills 是否出现(project 层启用即入)', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    const demo = join(dir, 'demo')
    mkdirSync(demo, { recursive: true })
    mkInstalled({
      'pkg@mp': [{ scope: 'project', version: '1.0.0', installPath: pkg, projectPath: demo }]
    })
    mkProjSettings(demo, 'settings.json', { 'pkg@mp': true })
    // user 层未启用:全局页不出现
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.skills.some((s) => s.origin === 'plugin')).toBe(false)
    // demo 详情:出现,level=plugin
    const d = readProjectDetail(roots(), demo)
    const ps = d.skills.filter((s) => s.origin === 'plugin')
    expect(ps.map((s) => s.name).sort()).toEqual(['pkg:broken-skill', 'pkg:good-skill'])
    expect(ps[0].level).toBe('plugin')
    // G3 同权预览:详情插件条目带包统计与摘要同源包根(ADR-0012)
    expect(ps[0].pkg?.files).toBeGreaterThanOrEqual(1)
    expect(ps[0].pluginRoot).toBeTruthy()
    expect(ps[0].pluginSkillName).toBe('broken-skill')
    // 其他项目详情:不出现
    const other = join(dir, 'other')
    mkdirSync(other, { recursive: true })
    expect(readProjectDetail(roots(), other).skills.some((s) => s.origin === 'plugin')).toBe(false)
  })
})

describe('E8 Codex 插件缓存枚举', () => {
  it('E10 单个 marketplace 目录不可读 → 跳过该目录,其余 marketplace 照常枚举(不整组清空)', async () => {
    // chmod 000 在 root 下不拦截读取,该环境显式 skip 不造假绿
    if (typeof process.getuid === 'function' && process.getuid() === 0) return
    const cache = join(dir, '.codex', 'plugins', 'cache')
    mkdirSync(join(cache, 'good', 'ok-plugin', '1.0.0'), { recursive: true })
    mkdirSync(join(cache, 'broken', 'x', '1.0.0'), { recursive: true })
    const { chmodSync } = await import('node:fs')
    chmodSync(join(cache, 'broken'), 0o000)
    try {
      const snap = await scan(roots(), { now: () => 1 })
      expect(snap.global.codexPlugins.map((p) => p.name)).toContain('ok-plugin')
    } finally {
      chmodSync(join(cache, 'broken'), 0o755) // 恢复,免得 afterEach 清理失败
    }
  })

  it('三层目录枚举;多版本取最高并计数;缓存根缺失/空 → 空数组', async () => {
    let snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexPlugins).toEqual([])
    const cache = join(dir, '.codex', 'plugins', 'cache')
    mkdirSync(join(cache, 'local', 'codex-helper', '0.3.2'), { recursive: true })
    mkdirSync(join(cache, 'official', 'superpowers', '6.1.0'), { recursive: true })
    mkdirSync(join(cache, 'official', 'superpowers', '6.2.0'), { recursive: true })
    snap = await scan(roots(), { now: () => 1 })
    expect(
      snap.global.codexPlugins.map(({ name, marketplace, version, cachedVersions }) => ({ name, marketplace, version, cachedVersions }))
    ).toEqual([
      { name: 'codex-helper', marketplace: 'local', version: '0.3.2', cachedVersions: 1 },
      { name: 'superpowers', marketplace: 'official', version: '6.2.0', cachedVersions: 2 }
    ])
    // E8:root=最高版本缓存目录(摘要同源包根);无 skills 目录 → 空列表
    expect(snap.global.codexPlugins[1].root).toBe(join(cache, 'official', 'superpowers', '6.2.0'))
    expect(snap.global.codexPlugins[0].skills).toEqual([])
  })
})

describe('插件 skill 预览:枚举与统计(plugins-view H1/H5/E8)', () => {
  it('Claude contents.skills 带包统计;整包缺失 missing 且 skills 空', async () => {
    const pkg = join(dir, 'cache', 'sp')
    mkdirSync(join(pkg, 'skills', 'brainstorming', 'references'), { recursive: true })
    writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: 先问后做\n---\n正文\n')
    writeFileSync(join(pkg, 'skills', 'brainstorming', 'references', 'a.md'), 'x\n')
    mkInstalled({
      'sp@official': [{ scope: 'user', installPath: pkg, version: '1.0.0' }],
      'ghost@old': [{ scope: 'user', installPath: join(dir, 'gone'), version: '1.0.0' }]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const sp = snap.global.plugins.find((p) => p.name === 'sp@official')!
    const sk = sp.contents.skills[0]
    expect(sk).toMatchObject({ name: 'brainstorming', description: '先问后做' })
    expect(sk.pkg?.files).toBe(2)
    expect(sk.pkg!.bytes).toBeGreaterThan(0)
    const ghost = snap.global.plugins.find((p) => p.name === 'ghost@old')!
    expect(ghost.contents.missing).toBe(true)
    expect(ghost.contents.skills).toEqual([])
  })

  it('Codex 条目枚举最高版本包根下的 skills(E8,目录约定与 Claude 同构)', async () => {
    const base = join(dir, '.codex', 'plugins', 'cache', 'openai-bundled', 'documents')
    for (const v of ['1.0.0', '2.0.0']) {
      mkdirSync(join(base, v, 'skills', 'documents'), { recursive: true })
      writeFileSync(join(base, v, 'skills', 'documents', 'SKILL.md'), `---\ndescription: v${v}\n---\n`)
    }
    const snap = await scan(roots(), { now: () => 1 })
    const cx = snap.global.codexPlugins.find((p) => p.name === 'documents')!
    expect(cx.version).toBe('2.0.0')
    expect(cx.root).toBe(join(base, '2.0.0'))
    expect(cx.skills[0]).toMatchObject({ name: 'documents', description: 'v2.0.0' })
    expect(cx.skills[0].pkg?.files).toBe(1)
  })

  it('详情插件条目带摘要同源包根(H5)', () => {
    const proj = join(dir, 'proj')
    mkdirSync(proj, { recursive: true })
    const pkg = join(dir, 'cache', 'ct')
    mkdirSync(join(pkg, 'skills', 'x'), { recursive: true })
    writeFileSync(join(pkg, 'skills', 'x', 'SKILL.md'), '#\n')
    mkInstalled({ 'ct@local': [{ scope: 'user', installPath: pkg, version: '1' }] })
    const d = readProjectDetail(roots(), proj)
    const p = d.plugins.find((x) => x.name === 'ct@local')!
    expect(p.installPath).toBe(pkg)
    expect(p.contents.skills[0].pkg?.files).toBe(1)
  })
})
