// An Antigravity CLI transcript's question index as a scan gives it, for the unit cases of the question index and the
// turn reader. Kept apart from agy-transcript-fixture.ts, which the e2e specs import too: this one parses through the
// engine module, which only a thread that loaded it can reach (src/main/testing/load-engine.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { QuestionRec } from '../providers/question-index'
import { runParseJob } from '../providers/token-stats'
import { encodeTrajectoryMetadata, writeConversation } from './agy-fixture'
import { transcriptFile } from './agy-transcript-fixture'

/**
 * `text` written as a transcript under a fresh agy data root beside the conversation it belongs to, and that
 * conversation parsed through `runParseJob`, which hands it to the engine module. `use` is given the index, the title
 * the conversation falls back to (its first question, clipped) and the transcript's path, before the data root is
 * removed.
 */
export async function withIndexedTranscript<T>(
  text: string | Buffer,
  use: (indexed: { questions: QuestionRec[]; title: string | null; transcript: string }) => Promise<T> | T
): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), 'agy-indexed-'))
  try {
    const id = 'conv-indexed'
    const conversations = join(home, 'conversations')
    mkdirSync(conversations)
    const { file } = writeConversation(conversations, id, encodeTrajectoryMetadata({ folders: ['/work/p'], conversationId: id }))
    const transcript = transcriptFile(home, id)
    mkdirSync(join(transcript, '..'), { recursive: true })
    writeFileSync(transcript, text)
    const parsed = await runParseJob({ kind: 'antigravity', file, transcript })
    if (parsed?.agg.kind !== 'antigravity' || parsed.agg.unreadable) throw new Error('the conversation did not read')
    return await use({ questions: parsed.agg.questions, title: parsed.agg.title, transcript })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}
