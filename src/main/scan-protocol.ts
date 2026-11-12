// What the main process and the scan worker say to each other (ADR-0043), and the worker's side of it. The
// main process's side is scan-client.ts; the thread itself is scan-worker.ts.
import type { Scanner } from './providers/scanner'
import type { ScanRoots } from './providers/types'

/** The scanner as either side asks it: on the scan worker, or on the main process once the worker has failed */
export type Scans = Pick<Scanner, 'scan' | 'sessionQuestions' | 'isFresh'>

/** A session's question index, as TokenEngine.sessionQuestions gives it */
export type SessionIndex = Awaited<ReturnType<Scanner['sessionQuestions']>>

/** One thing asked of the scanner */
export type ScanAsk =
  | { op: 'scan'; roots: ScanRoots; holdMs: number }
  | { op: 'questions'; roots: ScanRoots; file: string }
  | { op: 'fresh'; file: string }

export type ScanRequest = (ScanAsk & { id: number }) | { op: 'stop' }

/** A failure carries its message alone: an application error's code and parameters are encoded in it (ADR-0015) */
export type ScanReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string }

/** What the scan worker is started with */
export interface ScanWorkerData {
  /** Where the token cache file lives */
  cacheDir: string
  /** The built parse-worker entry, which the scanner's parse pool starts */
  parseScript: string
  poolSize: number
}

/** The part of its port the worker's side uses */
export interface ScanPort {
  on(event: 'message', listener: (request: ScanRequest) => void): unknown
  postMessage(reply: ScanReply): void
}

/** One ask answered by a scanner: the same call on the worker and on the main process */
export async function answerScan(scans: Scans, ask: ScanAsk): Promise<unknown> {
  switch (ask.op) {
    case 'scan':
      return scans.scan(ask.roots, ask.holdMs)
    case 'questions':
      return scans.sessionQuestions(ask.roots, ask.file)
    case 'fresh':
      return scans.isFresh(ask.file)
  }
}

/**
 * The worker's side: every request is started as it arrives, so a question-index read is answered while a scan
 * waits between two of its steps or for its parses, not after it. `stop` ends the thread; it is called from a
 * message, which the thread only takes between two steps, so no cache write is cut short.
 */
export function answerScans(port: ScanPort, scans: Scans, stop: () => void): void {
  port.on('message', (request) => {
    if (request.op === 'stop') {
      stop()
      return
    }
    const { id } = request
    answerScan(scans, request).then(
      (value) => port.postMessage({ id, ok: true, value }),
      (error: unknown) => port.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) })
    )
  })
}
