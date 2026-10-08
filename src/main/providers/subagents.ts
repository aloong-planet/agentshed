// Reading subagents (spec: subagents-memory-plugin).
// The key means different things per side (verified at source level 2026-07-31):
//   Claude: ~/.claude/agents/*.md, key = the filename (minus .md), with frontmatter as the display fields;
//   Codex: ~/.codex/agents/*.toml, key = the name field inside the toml (agent_roles.rs;
//   Codex does not load a file with no valid name or one that fails to parse, and those are listed here
//   as degraded entries carrying an error).
import { existsSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { AgentSide, ProjectSubagentEntry, SubagentEntry, SubagentSideDetail } from '@shared/domain'
import type { ScanRoots } from './types'
import { fmField, readCapped } from './read-utils'
import { ERR } from '@shared/errors'

/** The Codex built-in roles (role.rs built_in::configs); a custom entry of the same name overrides the
 * built-in */
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

/** A file that is listed but whose contents cannot be read (permissions and so on) → keep the entry with
 * a label: silently disappearing would pollute the same-name shadowing judgement (A8) */
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
      // The name is unknowable (the file cannot be read), so the filename stands in; it cannot take part
      // in name-based shadowing, but it does not silently disappear
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
    const str = (k: string): string | null => (typeof parsed[k] === 'string' ? parsed[k] : null)
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
    // Duplicate names within a layer: the first wins (agent_roles.rs warns on a same-layer duplicate and
    // skips the later one; the files are already walked in name order)
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
 * Project detail's effective view. Both sides shadow the lower layer at the project level (the opposite
 * of skills' Codex coexistence semantics):
 * Claude's official semantics give the project level priority; Codex overrides by config layer
 * (Project=25 > User=20).
 * The same-name key follows each side: Claude = the filename, Codex = the toml name field (so the same
 * name shadows across different filenames too).
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
