// Global search's question corpus (ADR-0034): the displayed question texts of every listed session in
// every project, read into memory on first demand and kept for the run. Nothing of it is written to disk —
// the accounting and question-index cache holds offsets, never text (session-view D2a).
//
// - What is listed is the project list's set, stale projects included, each with the sessions its Sessions
//   tab lists (global-search REQ-001). The questions are the question index's displayed set, read through
//   the shared range reader (a cold rollout in one streaming pass) and parsed exactly as the session page
//   parses them, so a hit's number and text are the ones that page shows.
// - Degradation only hurts itself: a session whose questions cannot be read is left out, and the others
//   are listed (REQ-003/AC-03).
import type { GlobalSearchResult, GlobalSearchSession, ProjectEntry, ProjectStats, SessionMeta } from '@shared/domain'
import { mergeKey } from '@shared/path-key'
import { statSync } from 'node:fs'
import { questionTextOfRange, type QuestionRec } from './question-index'
import { mapLimit, readRanges, type ByteRange } from './range-read'
import type { TokenEngine } from './token-stats'
import type { ScanRoots } from './types'

/** One project of the project list, with the sessions its Sessions tab lists */
export interface CorpusProject {
  path: string
  name: string
  stale: boolean
  sessions: readonly SessionMeta[]
}

/** What the corpus reads from: the scan roots and the listed set as they stand */
export interface CorpusListing {
  roots: ScanRoots
  projects: readonly CorpusProject[]
}

export interface CorpusOptions {
  /** The range reader; the shared one by default */
  read?: (file: string, ranges: readonly ByteRange[], limit: number) => Promise<{ texts: string[] }>
  /** Awaited before every reading pass — the e2e fetch-delay seam holds the reading open with it */
  pause?: () => Promise<void>
}

/** One session's displayed questions that could be read, numbered as the session page numbers them */
interface SessionTexts {
  /** The question-index identity they were read for */
  identity: string
  questions: Array<{ i: number; text: string; at: number | null }>
}

type SessionIndex = Awaited<ReturnType<TokenEngine['sessionQuestions']>>

/** Sessions read at once — the shared bounded concurrency (session-view D2b); one range at a time within each */
const READ_CONCURRENCY = 4

export class QuestionCorpus {
  private readonly texts = new Map<string, SessionTexts>()
  /** The listed set the texts were last read for, which a search walks */
  private projects: readonly CorpusProject[] = []

  constructor(
    private readonly engine: Pick<TokenEngine, 'sessionQuestions'>,
    private readonly listing: () => CorpusListing,
    private readonly opts: CorpusOptions = {}
  ) {}

  /** The texts follow the listed set of the last pass that completed */
  private ready = false
  /** Reading has been asked for: from then on every scan brings the texts up to date */
  private wanted = false
  /** A pass is due — set by a scan arriving while one is under way, so the newer listing is read too */
  private dirty = false
  /** The reading under way, which every caller joins */
  private loop: Promise<void> | null = null

  /** Start reading the question texts, or join the reading under way; resolves once they are read */
  load(): Promise<void> {
    this.wanted = true
    if (this.loop) return this.loop
    if (this.ready) return Promise.resolve()
    return this.schedule()
  }

  /** After a scan: bring the texts up to date; a corpus never asked for is not built */
  refresh(): Promise<void> {
    return this.wanted ? this.schedule() : Promise.resolve()
  }

  private schedule(): Promise<void> {
    this.dirty = true
    if (this.loop) return this.loop
    this.loop = (async () => {
      try {
        while (this.dirty) {
          this.dirty = false
          await this.pass()
        }
        this.ready = true
      } catch (error) {
        // A reading that fails as a whole is read again by the next load or scan
        this.ready = false
        throw error
      } finally {
        this.loop = null
      }
    })()
    return this.loop
  }

  /**
   * One pass over the listed set: a session keeps its texts while its question-index identity is unchanged
   * and is read again otherwise; a session no longer listed leaves (REQ-004/AC-02).
   */
  private async pass(): Promise<void> {
    await this.opts.pause?.()
    const { roots, projects } = this.listing()
    const sessions = projects.flatMap((p) => p.sessions)
    const listed = new Set(sessions.map((s) => s.file))
    await mapLimit(sessions, READ_CONCURRENCY, async (s) => {
      try {
        const q = await this.engine.sessionQuestions(roots, s.file)
        const identity = indexIdentity(s.file, q.questions)
        if (this.texts.get(s.file)?.identity === identity) return
        this.texts.set(s.file, await this.read(s.file, q, identity))
      } catch {
        // An unreadable session only hurts itself: it is left out of the results and the counts
        this.texts.delete(s.file)
      }
    })
    for (const file of [...this.texts.keys()]) if (!listed.has(file)) this.texts.delete(file)
    this.projects = projects
  }

  /** The listed sessions with a question containing the keyword, ignoring case; every hit, in question order */
  async search(needle: string): Promise<GlobalSearchResult> {
    // A search waits for a reading under way, and starts one when the texts were never read
    await this.load()
    const k = needle.trim().toLowerCase()
    const sessions: GlobalSearchSession[] = []
    if (k === '') return { sessions }
    for (const p of this.projects) {
      for (const s of p.sessions) {
        const hits = this.texts.get(s.file)?.questions.filter((q) => q.text.toLowerCase().includes(k)) ?? []
        if (hits.length === 0) continue
        sessions.push({
          project: { path: p.path, name: p.name, stale: p.stale },
          file: s.file,
          title: s.title,
          side: s.side,
          forkState: s.forkState,
          at: s.at,
          hits: hits.map((h) => ({ i: h.i, text: h.text, at: h.at }))
        })
      }
    }
    return { sessions }
  }

  private async read(file: string, q: SessionIndex, identity: string): Promise<SessionTexts> {
    const { texts } = await (this.opts.read ?? readRanges)(file, q.questions.map((r) => ({ start: r[0], end: r[1] })), 1)
    const questions: SessionTexts['questions'] = []
    q.questions.forEach((rec, idx) => {
      const text = questionTextOfRange(q.side, texts[idx])
      // An unreadable question cannot match anything; the session's other questions still can
      if (text !== null) questions.push({ i: idx + 1, text, at: rec[3] })
    })
    return { identity, questions }
  }
}

/**
 * A session's question-index identity: the file (device and inode, so a file replaced under the same path
 * is a new one) and the byte ranges of its displayed questions. An answer appended to a session leaves it
 * unchanged; a new question, a rewritten index or a different set after fork stripping changes it.
 */
function indexIdentity(file: string, questions: readonly QuestionRec[]): string {
  const st = statSync(file)
  return `${st.dev}:${st.ino}|${questions.map((r) => `${r[0]}-${r[1]}`).join(',')}`
}

/** The project list's projects, stale ones included, each with the sessions its Sessions tab lists */
export function corpusProjects(projects: readonly ProjectEntry[], stats: ReadonlyMap<string, ProjectStats>): CorpusProject[] {
  return projects.map((p) => ({ path: p.path, name: p.name, stale: p.stale, sessions: stats.get(mergeKey(p.path))?.sessions ?? [] }))
}
