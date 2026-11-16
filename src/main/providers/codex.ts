// Reading Codex-side data: the registry (the [projects."<path>"] sections in config.toml).
// No TOML dependency: only the paths in the section headers are needed, extracted line by line with a
// regex; the section contents (trust_level) are not consumed at present.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RegistryResult } from './claude'
import { isAbsent } from './read-utils'
import { ERR } from '@shared/errors'

const PROJECT_HEADER = /^\s*\[projects\."(.+)"\]\s*$/

/** A rollout's session, as the engine module's session walk reads it off the first line
 * (engine/src/sides/codex/walk.rs) */
export interface CodexSessionMeta {
  /** The rollout file's absolute path */
  file: string
  /** The owning project's path (the first line's session_meta.payload.cwd) */
  cwd: string
  /** Whether this is a subagent thread (not counted toward session counts or activity time) */
  subagent: boolean
  /** The file's mtime (epoch ms) */
  mtimeMs: number
  /** This session's id (payload.id) */
  sessionId: string | null
  /** The parent session's id: payload.forked_from_id or
   * source.subagent.thread_spawn.parent_thread_id */
  parentId: string | null
  /** The fork moment (the top-level timestamp, epoch ms); the parent's usage before it is the history
   * this session replays */
  forkedAt: number | null
  /** Whether the rollout is in the paginated format — its first line carries an ordinal. A paginated
   * child thread carries no replayed events, so nothing is stripped from it (spec session-view B2). */
  paginated: boolean
}

export function readCodexRegistry(codexHome: string): RegistryResult {
  // Only a root that is really not there: one behind a directory it cannot enter is unreadable (agents-overview A3)
  if (isAbsent(codexHome)) return { detected: false, paths: [] }
  const configFile = join(codexHome, 'config.toml')
  if (isAbsent(configFile)) return { detected: true, paths: [] }
  // Section headers are looked for line by line and nothing is parsed, so the one failure here is the read
  try {
    const paths: string[] = []
    for (const line of readFileSync(configFile, 'utf8').split('\n')) {
      const m = PROJECT_HEADER.exec(line)
      if (m) paths.push(m[1])
    }
    return { detected: true, paths }
  } catch {
    return { detected: true, paths: [], error: { code: ERR.registryUnreadable, params: { path: configFile } } }
  }
}
