// The parse pool (#159): session files parsed on worker threads, several at once, so a scan's JSON.parse
// work leaves the main process free to answer IPC and uses more than one core. TokenEngine decides what
// to parse and assembles the results in scan order; the pool only runs jobs.
//
// Workers start when there is work and stop after IDLE_MS without any, so a scan that hits the cache for
// every file starts none, and nothing stays resident between scans (rescans are minutes apart).
// A worker that fails — the script will not load, it crashes, it exits — never loses a file: that job is
// parsed on the main thread instead, exactly as a pool-less engine would.
import { Worker } from 'node:worker_threads'
import { runParseJob, type ParseJob, type ParseResult, type ParseRunner } from './providers/token-stats'

/** How long an idle worker lives: long enough to serve one scan's parses back to back */
const IDLE_MS = 10_000

interface Task {
  job: ParseJob
  resolve: (result: ParseResult) => void
}

export class ParsePool implements ParseRunner {
  readonly concurrency: number
  private readonly script: string
  private readonly idleMs: number
  private readonly idle: Array<{ worker: Worker; timer: NodeJS.Timeout }> = []
  private readonly queue: Task[] = []
  private live = 0
  private warned = false

  /** `script`: the built parse-worker entry; `size`: the most workers at once; `idleMs` for tests */
  constructor(script: string, size: number, idleMs = IDLE_MS) {
    this.script = script
    this.concurrency = Math.max(1, size)
    this.idleMs = idleMs
  }

  run(job: ParseJob): Promise<ParseResult> {
    return new Promise((resolve) => {
      this.queue.push({ job, resolve })
      this.pump()
    })
  }

  /** Stops every idle worker; a busy one finishes its job first and stops when its idle time runs out */
  close(): void {
    for (const { worker, timer } of this.idle.splice(0)) {
      clearTimeout(timer)
      this.live--
      void worker.terminate()
    }
  }

  private pump(): void {
    for (;;) {
      const task = this.queue[0]
      if (!task) return
      const held = this.idle.pop()
      if (held) {
        clearTimeout(held.timer)
        this.queue.shift()
        this.dispatch(held.worker, task)
        continue
      }
      if (this.live >= this.concurrency) return
      this.live++
      this.queue.shift()
      this.dispatch(new Worker(this.script), task)
    }
  }

  private dispatch(worker: Worker, task: Task): void {
    const settle = (result: ParseResult | undefined, failed: boolean): void => {
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      if (failed) {
        this.live--
        void worker.terminate()
        if (!this.warned) {
          this.warned = true
          console.warn('[parse-pool] a parse worker failed; its file is parsed on the main thread')
        }
        void runParseJob(task.job).then(task.resolve)
      } else {
        task.resolve(result ?? null)
        this.release(worker)
      }
      this.pump()
    }
    const onMessage = (result: ParseResult): void => settle(result, false)
    const onError = (): void => settle(undefined, true)
    const onExit = (): void => settle(undefined, true)
    worker.once('message', onMessage)
    worker.once('error', onError)
    worker.once('exit', onExit)
    worker.postMessage(task.job)
  }

  private release(worker: Worker): void {
    const timer = setTimeout(() => {
      const i = this.idle.findIndex((h) => h.worker === worker)
      if (i === -1) return
      this.idle.splice(i, 1)
      this.live--
      void worker.terminate()
    }, this.idleMs)
    timer.unref()
    this.idle.push({ worker, timer })
  }
}
