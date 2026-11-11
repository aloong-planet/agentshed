// A fixture home with sessions on every side, for the cases that run one scan two ways and compare (the scanner on
// the calling thread, and through the scan worker's protocol). Each side's lines are the measured shapes the
// engine's own cases use (token-stats.test.ts, search-sessions.test.ts); only what a scan reads is written.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeClaudeProjectDir } from '../providers/claude'
import type { ScanRoots } from '../providers/types'
import { callRecord, encodeTrajectoryMetadata, writeConversation } from './agy-fixture'
import { MEASURED_TRANSCRIPT, MEASURED_TRANSCRIPT_ID, writeTranscript } from './agy-transcript-fixture'

export interface ScanHome {
  roots: ScanRoots
  /** The one registered project, which every session below belongs to */
  project: string
  claude: {
    /** One question and one dated call of 15 tokens: listed */
    asked: string
    /** One call of 9 tokens with no timestamp and no question: counted, undated, not listed */
    silent: string
  }
  codex: {
    /** One question and one call of 42 tokens */
    parent: string
    /** A legacy fork replaying the parent's question and then asking FORK_TITLE: stripped, and titled by it */
    fork: string
  }
  /** One question and one call of 33 tokens */
  grok: string
  antigravity: {
    /** The measured main transcript's conversation, with one call of 110 tokens: listed */
    listed: string
    /** A zero-byte database: counted as unreadable */
    unreadable: string
  }
}

/** The question the fixture's fork asks after its replayed one: the title a stripped fork takes */
export const FORK_TITLE = 'child new question'

export function scanRoots(home: string): ScanRoots {
  return {
    claudeHome: join(home, '.claude'),
    claudeConfigFile: join(home, '.claude.json'),
    codexHome: join(home, '.codex'),
    geminiHome: join(home, '.gemini'),
    grokHome: join(home, '.grok'),
    antigravityHome: join(home, '.gemini', 'antigravity-cli'),
    agentsSkillsDir: join(home, '.agents', 'skills')
  }
}

export function mkScanHome(home: string): ScanHome {
  const roots = scanRoots(home)
  const project = join(home, 'work', 'p1')
  mkdirSync(project, { recursive: true })
  writeFileSync(roots.claudeConfigFile, JSON.stringify({ projects: { [project]: {} } }))

  // ── Claude ──
  const claudeDir = join(roots.claudeHome, 'projects', encodeClaudeProjectDir(project))
  mkdirSync(claudeDir, { recursive: true })
  const usage = (id: string, input: number, output: number, timestamp?: string): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp,
      message: { id, model: 'claude-fable-5', usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    })
  const asked = join(claudeDir, 'asked.jsonl')
  writeFileSync(
    asked,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-07-30T12:00:00Z', message: { role: 'user', content: 'a claude question' } }),
      usage('m-asked', 10, 5, '2026-07-30T12:00:01Z')
    ].join('\n') + '\n'
  )
  const silent = join(claudeDir, 'silent.jsonl')
  writeFileSync(silent, usage('m-silent', 7, 2) + '\n')

  // ── Codex: a parent and its legacy fork ──
  const codexDir = join(roots.codexHome, 'sessions', '2026', '07', '30')
  mkdirSync(codexDir, { recursive: true })
  const PARENT = '019f0000-aaaa-7000-8000-000000000041'
  const CHILD = '019f0000-bbbb-7000-8000-000000000042'
  const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: project, id, ...extra } })
  const question = (ts: string, message: string): string =>
    JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message } })
  const parent = join(codexDir, `rollout-${PARENT}.jsonl`)
  writeFileSync(
    parent,
    [
      meta('2026-07-30T12:00:00Z', PARENT),
      JSON.stringify({ timestamp: '2026-07-30T12:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: project } }),
      question('2026-07-30T12:00:01Z', 'a codex question'),
      JSON.stringify({
        timestamp: '2026-07-30T12:00:02Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 40, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, total_tokens: 42 },
            total_token_usage: { input_tokens: 40, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, total_tokens: 42 }
          }
        }
      })
    ].join('\n') + '\n'
  )
  const fork = join(codexDir, `rollout-${CHILD}.jsonl`)
  writeFileSync(
    fork,
    [
      meta('2026-07-30T13:00:00Z', CHILD, { forked_from_id: PARENT }),
      question('2026-07-30T13:00:00Z', 'a codex question'), // The replayed copy
      question('2026-07-30T13:00:05Z', FORK_TITLE)
    ].join('\n') + '\n'
  )

  // ── Grok ──
  const GROK = 'grok-session-1'
  const grokDir = join(roots.grokHome, 'sessions', encodeURIComponent(project), GROK)
  mkdirSync(grokDir, { recursive: true })
  writeFileSync(join(grokDir, 'summary.json'), JSON.stringify({ info: { id: GROK, cwd: project }, current_model_id: 'grok-4.5' }))
  const grokLine = (update: Record<string, unknown>): string =>
    JSON.stringify({ timestamp: Date.UTC(2026, 6, 30, 12) / 1000, method: '_x.ai/session/update', params: { sessionId: 's', update } })
  const grokUsage = { inputTokens: 30, outputTokens: 3, totalTokens: 33, cachedReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, modelCalls: 1, apiDurationMs: 1000, costUsdTicks: 1761648000 }
  const grok = join(grokDir, 'updates.jsonl')
  writeFileSync(
    grok,
    [
      grokLine({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'a grok question' }, _meta: { modelId: 'grok-4.5', promptIndex: 0 } }),
      grokLine({ sessionUpdate: 'turn_completed', prompt_id: 'p', stop_reason: 'end_turn', usage: { ...grokUsage, modelUsage: { 'grok-4.5-build': grokUsage }, numTurns: 1 } })
    ].join('\n') + '\n'
  )

  // ── Antigravity CLI ──
  const conversations = join(roots.antigravityHome, 'conversations')
  mkdirSync(conversations, { recursive: true })
  const AGY = MEASURED_TRANSCRIPT_ID.main
  const call = callRecord({
    conversationId: AGY,
    stepIdx: 1,
    genIdx: 0,
    usage: { messageId: 'm-agy', input: 100, output: 10 },
    createdAt: Date.UTC(2026, 9, 26, 12),
    completedAt: Date.UTC(2026, 9, 26, 12),
    responseModel: 'gemini-3.6-flash'
  })
  const listed = writeConversation(conversations, AGY, encodeTrajectoryMetadata({ folders: [project], conversationId: AGY }), {
    steps: [call.step],
    gens: [call.gen]
  }).file
  writeTranscript(roots.antigravityHome, AGY, MEASURED_TRANSCRIPT.main)
  const unreadable = join(conversations, 'broken.db')
  writeFileSync(unreadable, '')

  return { roots, project, claude: { asked, silent }, codex: { parent, fork }, grok, antigravity: { listed, unreadable } }
}
