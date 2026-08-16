// Reading Memory (spec: subagents-memory-plugin, sequences C/D).
// The global summary follows the project registry (C5), only metadata and filenames enter the snapshot
// (C8), and contents are read on demand through the allow-list;
// Codex global memory is probe-style: it is listed only when the directory is non-empty (C6), and only
// the directory is enumerated with no structural parsing.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { MemoryFileMeta, MemorySummaryEntry, ProjectEntry, ProjectMemory } from '@shared/domain'
import type { ScanRoots } from './types'
import { encodeClaudeProjectDir } from './claude'
import { readCapped, readTextCapped } from './read-utils'

/** Metadata for the top-level .md files in a directory (not recursive; subagent-level memory
 * subdirectories are not read — Out of Scope) */
function listMdFiles(dir: string): MemoryFileMeta[] {
  if (!existsSync(dir)) return []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: MemoryFileMeta[] = []
  for (const name of names.sort()) {
    if (!name.endsWith('.md')) continue
    const file = join(dir, name)
    try {
      const st = statSync(file)
      if (!st.isFile()) continue
      out.push({ name, file, mtimeMs: st.mtimeMs })
    } catch {
      // Deleted between scans: skip it
    }
  }
  return out
}

/**
 * The Codex memory toggle (C6): the memories key under the features table being true —
 * the `[features]` section and the `features.memories = true` dotted key are equivalent forms, both
 * recognised by the TOML parse.
 * A parse failure → not enabled: Codex itself cannot read that config either, and salvaging semantics
 * from a broken file is a false signal
 * (a degraded judgement follows the target system's actual behaviour). A missing or unreadable config
 * likewise counts as not enabled.
 */
export function readCodexMemoriesEnabled(codexHome: string): boolean {
  const raw = readTextCapped(join(codexHome, 'config.toml'))
  if (raw === null) return false
  try {
    const parsed = parseToml(raw) as Record<string, unknown>
    const features = parsed['features']
    return (
      typeof features === 'object' &&
      features !== null &&
      (features as Record<string, unknown>)['memories'] === true
    )
  } catch {
    return false
  }
}

export function readMemorySummary(roots: ScanRoots, projects: ProjectEntry[]): MemorySummaryEntry[] {
  const out: MemorySummaryEntry[] = []
  for (const p of projects) {
    const files = listMdFiles(join(roots.claudeHome, 'projects', encodeClaudeProjectDir(p.path), 'memory'))
    if (files.length === 0) continue // C2: an empty or absent directory is not listed
    out.push({
      side: 'claude',
      projectPath: p.path,
      projectName: p.name,
      hasMain: files.some((f) => f.name === 'MEMORY.md'),
      files,
      lastModified: Math.max(...files.map((f) => f.mtimeMs)),
      stale: p.stale
    })
  }
  const codexFiles = listMdFiles(join(roots.codexHome, 'memories'))
  if (codexFiles.length > 0) {
    out.push({
      side: 'codex',
      projectPath: null,
      projectName: null,
      hasMain: false,
      files: codexFiles,
      lastModified: Math.max(...codexFiles.map((f) => f.mtimeMs)),
      stale: false
    })
  }
  // C4: most recently modified first
  return out.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
}

/** Project detail's Memory (sequence D): MEMORY.md's contents are emitted directly (truncated), and
 * topics carry metadata only */
export function readProjectMemory(roots: ScanRoots, projectPath: string): ProjectMemory {
  const dir = join(roots.claudeHome, 'projects', encodeClaudeProjectDir(projectPath), 'memory')
  const files = listMdFiles(dir)
  const main = files.some((f) => f.name === 'MEMORY.md') ? readCapped(join(dir, 'MEMORY.md')) : null
  return { main, topics: files.filter((f) => f.name !== 'MEMORY.md') }
}
