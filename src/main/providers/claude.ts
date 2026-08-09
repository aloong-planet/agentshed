// Reading Claude Code-side data: the registry (the projects key in ~/.claude.json).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ERR, type AppError } from '@shared/errors'

export interface RegistryResult {
  detected: boolean
  paths: string[]
  /** Probe failure: a code plus parameters, containing no natural language (ticket 07) */
  error?: AppError
}

export function readClaudeRegistry(configFile: string): RegistryResult {
  if (!existsSync(configFile)) return { detected: false, paths: [] }
  try {
    const raw: unknown = JSON.parse(readFileSync(configFile, 'utf8'))
    const projects =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)['projects']
        : undefined
    if (typeof projects !== 'object' || projects === null) {
      return { detected: true, paths: [], error: { code: ERR.registryProjectsInvalid, params: {} } }
    }
    return { detected: true, paths: Object.keys(projects) }
  } catch (err) {
    return {
      detected: true,
      paths: [],
      error: { code: ERR.registryParseFailed, params: { detail: String(err) } }
    }
  }
}

/**
 * The forward encoding from a project path to Claude's session directory name (never decoded back, which
 * would be lossy).
 * The measured rule: every non-alphanumeric character becomes '-' (including / . _).
 */
export function encodeClaudeProjectDir(projectPath: string): string {
  return projectPath.replace(/[^A-Za-z0-9]/g, '-')
}

export interface Activity {
  sessionCount: number
  /** epoch ms; null with no sessions */
  lastSessionAt: number | null
}

/** A project's Claude session activity: the count of *.jsonl under the encoded directory + the largest
 * mtime. Contents are not parsed. */
export function readClaudeActivity(claudeHome: string, projectPath: string): Activity {
  const dir = join(claudeHome, 'projects', encodeClaudeProjectDir(projectPath))
  if (!existsSync(dir)) return { sessionCount: 0, lastSessionAt: null }
  let count = 0
  let last: number | null = null
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue
    try {
      const m = statSync(join(dir, name)).mtimeMs
      count++
      if (last === null || m > last) last = m
    } catch {
      // The file was deleted between scans: skip it
    }
  }
  return { sessionCount: count, lastSessionAt: last }
}
