// Subagents 读取(spec: subagents-memory-plugin)。
// 键语义按侧不同(源码级核实 2026-07-31):
//   Claude:~/.claude/agents/*.md,键=文件名(去 .md),frontmatter 为展示字段;
//   Codex:~/.codex/agents/*.toml,键=toml 内 name 字段(agent_roles.rs;
//   无有效 name 或解析失败的文件 Codex 不加载,此处列为带 error 的降级条目)。
import { existsSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { AgentSide, ProjectSubagentEntry, SubagentEntry, SubagentSideDetail } from '@shared/domain'
import type { ScanRoots } from './types'
import { fmField, readCapped } from './read-utils'
import { ERR } from '@shared/errors'

/** Codex 内置 role(role.rs built_in::configs);自定义同名即覆盖内置 */
const CODEX_BUILTINS = new Set(['default', 'worker', 'explorer'])

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((n) => n.endsWith(ext) && !n.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

/** 文件在列表里但读不出内容(权限等)→ 保留条目并标注:静默消失会污染同名遮蔽判定(A8) */
const UNREADABLE: Omit<SubagentSideDetail, 'content'> = {
  description: null,
  tools: null,
  model: null,
  sandbox: null,
  error: { code: ERR.subagentUnreadable, params: {} }
}

function readClaudeSide(dir: string): Map<string, SubagentSideDetail> {
  const out = new Map<string, SubagentSideDetail>()
  for (const f of listFiles(dir, '.md')) {
    const content = readCapped(join(dir, f))
    if (content === null) {
      out.set(basename(f, '.md'), { content: null, ...UNREADABLE })
      continue
    }
    out.set(basename(f, '.md'), {
      content,
      description: fmField(content.text, 'description'),
      tools: fmField(content.text, 'tools'),
      model: fmField(content.text, 'model'),
      sandbox: null,
      error: null
    })
  }
  return out
}

function readCodexSide(dir: string): Map<string, SubagentSideDetail> {
  const out = new Map<string, SubagentSideDetail>()
  for (const f of listFiles(dir, '.toml')) {
    const content = readCapped(join(dir, f))
    if (content === null) {
      // 名不可知(文件读不了),以文件名占位;无法参与按 name 的遮蔽判定,但不静默消失
      out.set(`(${f})`, { content: null, ...UNREADABLE })
      continue
    }
    let parsed: Record<string, unknown>
    try {
      parsed = parseToml(content.text)
    } catch (err) {
      out.set(`(${f})`, {
        content,
        description: null,
        tools: null,
        model: null,
        sandbox: null,
        error: { code: ERR.subagentTomlFailed, params: { detail: String(err).slice(0, 120) } }
      })
      continue
    }
    const str = (k: string): string | null => (typeof parsed[k] === 'string' ? (parsed[k] as string) : null)
    const name = str('name')
    if (!name) {
      out.set(`(${f})`, {
        content,
        description: str('description'),
        tools: null,
        model: str('model'),
        sandbox: str('sandbox_mode'),
        error: { code: ERR.subagentMissingName, params: {} }
      })
      continue
    }
    // 同层重名:先者优先(agent_roles.rs 对同层 duplicate 警告并跳过后来者;文件已按名序遍历)
    if (out.has(name)) continue
    out.set(name, {
      content,
      description: str('description'),
      tools: null,
      model: str('model'),
      sandbox: str('sandbox_mode'),
      error: null
    })
  }
  return out
}

export function readGlobalSubagents(roots: ScanRoots): SubagentEntry[] {
  return mergeSides(
    readClaudeSide(join(roots.claudeHome, 'agents')),
    readCodexSide(join(roots.codexHome, 'agents'))
  )
}

/**
 * 项目详情生效视图。两侧均为项目级遮蔽低层(与 skills 的 Codex 共存语义相反):
 * Claude 官方语义项目级优先;Codex 按 config layer 覆盖(Project=25 > User=20)。
 * 同名键按侧语义:Claude=文件名,Codex=toml name 字段(跨文件名同 name 也遮蔽)。
 */
export function readEffectiveSubagents(roots: ScanRoots, projectPath: string): ProjectSubagentEntry[] {
  const sides: Array<{
    side: AgentSide
    project: Map<string, SubagentSideDetail>
    global: Map<string, SubagentSideDetail>
  }> = [
    {
      side: 'claude',
      project: readClaudeSide(join(projectPath, '.claude', 'agents')),
      global: readClaudeSide(join(roots.claudeHome, 'agents'))
    },
    {
      side: 'codex',
      project: readCodexSide(join(projectPath, '.codex', 'agents')),
      global: readCodexSide(join(roots.codexHome, 'agents'))
    }
  ]
  const out: ProjectSubagentEntry[] = []
  for (const { side, project, global } of sides) {
    const overrides = (name: string, d: SubagentSideDetail): boolean =>
      side === 'codex' && !d.error && CODEX_BUILTINS.has(name)
    for (const [name, d] of [...project.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        name,
        side,
        level: 'project',
        description: d.description,
        detail: d,
        shadows: global.has(name),
        shadowed: false,
        overridesBuiltin: overrides(name, d)
      })
    }
    for (const [name, d] of [...global.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        name,
        side,
        level: 'global',
        description: d.description,
        detail: d,
        shadows: false,
        shadowed: project.has(name),
        overridesBuiltin: overrides(name, d)
      })
    }
  }
  return out
}

function mergeSides(
  claude: Map<string, SubagentSideDetail>,
  codex: Map<string, SubagentSideDetail>
): SubagentEntry[] {
  const names = [...new Set([...claude.keys(), ...codex.keys()])].sort()
  return names.map((name) => {
    const cl = claude.get(name) ?? null
    const cx = codex.get(name) ?? null
    const sides: AgentSide[] = []
    if (cl) sides.push('claude')
    if (cx) sides.push('codex')
    return {
      name,
      sides,
      description: cl?.description ?? cx?.description ?? null,
      claude: cl,
      codex: cx,
      overridesBuiltin: Boolean(cx && !cx.error && CODEX_BUILTINS.has(name))
    }
  })
}
