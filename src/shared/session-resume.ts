// The session ID and the resume command (session-view::US-001). Shared: the main process reads a page's
// session ID with the first function, and so does the display copy's restore of a page saved before IDs were
// kept (session-view::CON-003).
import type { AgentSide } from './domain'

/**
 * The session ID a side's own resume takes, where that side names the session's files by it: Claude Code's
 * session file is `<id>.jsonl`, a Grok session is the directory `<id>/` holding its update stream, and an Antigravity
 * CLI conversation is the database `<id>.db` (19 of 19 measured, the id agy's own summaries record). A Codex
 * session's ID is in its record, not in its path (a thread written in segments names each file by the thread
 * and the segment), so it is not read here: null.
 */
export function sessionIdFromPath(side: AgentSide, file: string): string | null {
  const parts = file.split('/')
  const last = parts[parts.length - 1]
  const name =
    side === 'claude' ? last?.replace(/\.jsonl$/, '') : side === 'grok' ? parts[parts.length - 2] : side === 'antigravity' ? last?.replace(/\.db$/, '') : undefined
  return name ? name : null
}

/** A shell word in single quotes, a single quote inside it closed, escaped and reopened */
const quoted = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * The resume command (session-view::US-001/AC-04): change into the project's directory, then resume by the
 * session ID in the tool of the session's own side, named by its bare command (session-view::CON-001). Agent
 * data enters only quoted (session-view::CON-002): the directory always, the ID unless it is made of letters,
 * digits, '-', '_' and '.' — so a pasted line runs the cd and the resume and nothing else.
 */
export function resumeCommand(side: AgentSide, sessionId: string, projectDir: string): string {
  const id = /^[A-Za-z0-9._-]+$/.test(sessionId) ? sessionId : quoted(sessionId)
  return `cd ${quoted(projectDir)} && ${RESUME[side](id)}`
}

/** Each side's own resume, keyed by every side: a side added later fails the typecheck until it has one, rather
 * than falling through to another side's tool */
const RESUME: Record<AgentSide, (id: string) => string> = {
  claude: (id) => `claude --resume ${id}`,
  codex: (id) => `codex resume ${id}`,
  grok: (id) => `grok --resume ${id}`,
  antigravity: (id) => `agy --conversation ${id}`
}
