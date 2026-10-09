// The scan engine entry point (seam 1): given the data roots → the overview snapshot.
// Ticket 02: the registry union (badges / staleness / path normalisation). Session activity, skills and
// the rest land in this layer incrementally in later tickets.
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { AgentSide, ProjectEntry, Snapshot } from '@shared/domain'
import { emptySnapshot } from '@shared/domain'
import { mergeKey, normalizePath } from '@shared/path-key'
import type { ScanRoots } from './types'
import { readClaudeRegistry, readClaudeActivity } from './claude'
import { readCodexRegistry, readCodexSessions, type CodexSessionMeta } from './codex'
import { readGrokRegistry, readGrokSessions, type GrokSessionMeta } from './grok'
import { readGlobalLayer } from './global'
import { readMemorySummary } from './memory'

export interface ScanDeps {
  /** An injected clock, controllable in tests */
  now: () => number
  /** The scan's one session walk, shared with TokenEngine.build; walked here when absent */
  sessions?: SessionWalk
}

/**
 * The Codex and Grok session lists. Walking them reads every Codex rollout's first line and every Grok
 * session's summary, so a scan walks once and hands the result to both scan() and TokenEngine.build
 * (#160) — which also gives the two one shared set of sessions instead of two walks a moment apart.
 */
export interface SessionWalk {
  codex: CodexSessionMeta[]
  grok: GrokSessionMeta[]
}

export function walkSessions(roots: ScanRoots): SessionWalk {
  return { codex: readCodexSessions(roots.codexHome), grok: readGrokSessions(roots.grokHome) }
}

// Every reader below is synchronous; the Promise is the seam's shape, which both callers await.
export function scan(roots: ScanRoots, deps: ScanDeps): Promise<Snapshot> {
  const snap = emptySnapshot(deps.now())

  const claude = readClaudeRegistry(roots.claudeConfigFile)
  const codex = readCodexRegistry(roots.codexHome)
  const grok = readGrokRegistry(roots.grokHome)
  snap.sides.claude.detected = claude.detected
  if (claude.error) snap.sides.claude.error = claude.error
  snap.sides.codex.detected = codex.detected
  if (codex.error) snap.sides.codex.error = codex.error
  snap.sides.grok.detected = grok.detected
  if (grok.error) snap.sides.grok.error = grok.error

  const byKey = new Map<string, ProjectEntry>()
  const add = (rawPath: string, side: AgentSide): void => {
    const path = normalizePath(rawPath)
    const key = mergeKey(path)
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.sides.includes(side)) existing.sides.push(side)
      return
    }
    byKey.set(key, {
      path,
      name: basename(path),
      sides: [side],
      stale: !existsSync(path),
      lastSessionAt: null,
      sessionCount: 0
    })
  }
  for (const p of claude.paths) add(p, 'claude')
  for (const p of codex.paths) add(p, 'codex')
  for (const p of grok.paths) add(p, 'grok')

  // Activity: Claude uses a readdir of the encoded directory; Codex attributes by the rollout's
  // first-line cwd; Grok by the session store's percent-encoded directory name (subagents excluded
  // on every side). B9: sessions count from every side that has them, including one that did not
  // register the directory — the enrichment loop below touches registered entries only, which is
  // also what keeps A7 true (sessions alone never create an entry or raise the side count).
  const walked = deps.sessions ?? walkSessions(roots)
  const codexSessions = walked.codex
  const byKeyAgg = (sessions: Array<{ cwd: string; subagent: boolean; mtimeMs: number }>): Map<string, { count: number; last: number | null }> => {
    const m = new Map<string, { count: number; last: number | null }>()
    for (const s of sessions) {
      if (s.subagent) continue
      const key = mergeKey(s.cwd)
      const agg = m.get(key) ?? { count: 0, last: null }
      agg.count++
      if (agg.last === null || s.mtimeMs > agg.last) agg.last = s.mtimeMs
      m.set(key, agg)
    }
    return m
  }
  const codexByKey = byKeyAgg(codexSessions)
  const grokByKey = byKeyAgg(walked.grok)
  for (const [key, entry] of byKey) {
    const cl = readClaudeActivity(roots.claudeHome, entry.path)
    const cx = codexByKey.get(key)
    const gk = grokByKey.get(key)
    entry.sessionCount = cl.sessionCount + (cx?.count ?? 0) + (gk?.count ?? 0)
    const candidates = [cl.lastSessionAt, cx?.last ?? null, gk?.last ?? null].filter(
      (v): v is number => v !== null
    )
    entry.lastSessionAt = candidates.length ? Math.max(...candidates) : null
  }

  snap.projects = [...byKey.values()]
  snap.global = readGlobalLayer(roots)
  // The memory summary depends on the project registry (C5), so it is filled in separately after projects
  snap.global.memory = readMemorySummary(roots, snap.projects)
  return Promise.resolve(snap)
}
