// 票07:Agents 全局层——全局 skills(合并/软链)、plugins、全局 MCP(三来源)、配置只读。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
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
function mkSkill(base: string, name: string, content: string): void {
  const d = join(base, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'SKILL.md'), content)
}
const SKILL_MD = (desc: string, body = 'x'): string =>
  `---\nname: n\ndescription: ${desc}\n---\n\n${body}\n`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-glb-'))
  // 两侧存在的最小骨架
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('全局 skills(全局库)', () => {
  it('两侧合并单列:同名合并双侧,单侧的带各自徽标;描述取 SKILL.md frontmatter', async () => {
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', SKILL_MD('红先于绿', 'same'))
    mkSkill(join(dir, '.agents', 'skills'), 'tdd', SKILL_MD('红先于绿', 'same'))
    mkSkill(join(dir, '.claude', 'skills'), 'review-code', SKILL_MD('四层法'))
    mkSkill(join(dir, '.agents', 'skills'), 'decision-form', SKILL_MD('批量决策表单'))
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.skills.map((s) => [s.name, s]))
    expect(byName['tdd'].sides).toEqual(['claude', 'codex'])
    expect(byName['tdd']).not.toHaveProperty('differs')
    expect(byName['review-code'].sides).toEqual(['claude'])
    expect(byName['review-code'].description).toBe('四层法')
    expect(byName['decision-form'].sides).toEqual(['codex'])
    // 行内包统计:该侧有包给数字,无定义侧为 null
    expect(byName['tdd'].pkg.claude?.files).toBe(1)
    expect(byName['tdd'].pkg.claude!.bytes).toBeGreaterThan(0)
    expect(byName['decision-form'].pkg.claude).toBeNull()
    expect(byName['decision-form'].pkg.codex?.files).toBe(1)
  })

  it('两侧同名内容不同仍合并一行(无 differs 信号)', async () => {
    mkSkill(join(dir, '.claude', 'skills'), 'grilling', SKILL_MD('分批', 'A 版'))
    mkSkill(join(dir, '.agents', 'skills'), 'grilling', SKILL_MD('一次一问', 'B 版'))
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.skills.find((x) => x.name === 'grilling')
    expect(s?.sides).toEqual(['claude', 'codex'])
    expect(s).not.toHaveProperty('differs')
  })

  it('软链 skill 标记 symlink(按侧)', async () => {
    mkSkill(join(dir, '.agents', 'skills'), 'grill-me', SKILL_MD('转发'))
    mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
    symlinkSync(join(dir, '.agents', 'skills', 'grill-me'), join(dir, '.claude', 'skills', 'grill-me'))
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.skills.find((x) => x.name === 'grill-me')
    expect(s?.symlink.claude).toBe(true)
    expect(s?.symlink.codex).toBe(false)
  })
})

describe('plugins(仅 Claude,只读)', () => {
  it('installed_plugins.json + settings.json enabledPlugins → 名称/版本/scope/启用', async () => {
    const pdir = join(dir, '.claude', 'plugins')
    mkdirSync(pdir, { recursive: true })
    writeFileSync(
      join(pdir, 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'chrome-devtools-mcp@chrome-devtools-plugins': [
            { scope: 'user', version: '1.6.0', installPath: join(dir, 'plug-install') }
          ],
          'disabled-one@mp': [{ scope: 'user', version: '0.9.2', installPath: '/nope' }]
        }
      })
    )
    writeFileSync(
      join(dir, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'chrome-devtools-mcp@chrome-devtools-plugins': true } })
    )
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.plugins.map((p) => [p.name, p]))
    expect(byName['chrome-devtools-mcp@chrome-devtools-plugins']).toMatchObject({
      version: '1.6.0',
      enabled: true
    })
    expect(byName['chrome-devtools-mcp@chrome-devtools-plugins'].installs[0].scope).toBe('user')
    expect(byName['disabled-one@mp'].enabled).toBe(false)
  })
})

describe('全局 MCP(三来源)', () => {
  it('Claude 全局 mcpServers + plugin 自带 + Codex config.toml 段', async () => {
    writeFileSync(
      join(dir, '.claude.json'),
      JSON.stringify({ projects: {}, mcpServers: { figma: { command: 'x' } } })
    )
    // plugin 自带:installPath/.claude-plugin/plugin.json 的 mcpServers
    const plugRoot = join(dir, 'plug-install')
    mkdirSync(join(plugRoot, '.claude-plugin'), { recursive: true })
    writeFileSync(
      join(plugRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'chrome-devtools-mcp', mcpServers: { 'chrome-devtools': { command: 'npx' } } })
    )
    const pdir = join(dir, '.claude', 'plugins')
    mkdirSync(pdir, { recursive: true })
    writeFileSync(
      join(pdir, 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: { 'chrome-devtools-mcp@mp': [{ scope: 'user', version: '1.6.0', installPath: plugRoot }] }
      })
    )
    writeFileSync(
      join(dir, '.codex', 'config.toml'),
      'model = "gpt-5.5-codex"\n[mcp_servers.node_repl]\ncommand = "node"\n[mcp_servers.computer-use]\ncommand = "cu"\n'
    )
    const snap = await scan(roots(), { now: () => 1 })
    const rows = snap.global.mcp.map((m) => `${m.side}:${m.source}:${m.name}`).sort()
    expect(rows).toEqual([
      'claude:global-config:figma',
      'claude:plugin:chrome-devtools',
      'codex:config.toml:computer-use',
      'codex:config.toml:node_repl'
    ])
  })
})

describe('全局配置只读', () => {
  it('读全局 CLAUDE.md 与 AGENTS.md;缺失为 null;config.toml 摘要含 model 与计数', async () => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'CLAUDE.md'), '# 全局规矩\n- pnpm\n')
    writeFileSync(join(dir, '.codex', 'AGENTS.md'), '# Codex 全局\n')
    writeFileSync(
      join(dir, '.codex', 'config.toml'),
      'model = "gpt-5.5-codex"\n[projects."/a"]\ntrust_level = "trusted"\n[mcp_servers.node_repl]\ncommand="node"\n'
    )
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.claudeGlobalMd).toContain('全局规矩')
    expect(snap.global.codexAgentsMd).toContain('Codex 全局')
    expect(snap.global.codexConfigSummary).toContain('gpt-5.5-codex')
    expect(snap.global.codexConfigSummary).toContain('projects: 1')
    expect(snap.global.codexConfigSummary).toContain('mcp_servers: 1')
  })

  it('全部缺失 → null,不抛错', async () => {
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.claudeGlobalMd).toBeNull()
    expect(snap.global.codexAgentsMd).toBeNull()
  })
})
