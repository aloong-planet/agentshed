// An independently versioned presentation copy. Accounting never consumes this file (ADR-0029).
//
// When it is written (agents-overview::REQ-008, ADR-0044): a change is recorded as it arrives, without copying the data,
// and written while the window has no focus — when the window loses focus, when a change arrives while it has none, and
// at quit. The engine module (ADR-0045) serialises it and writes it, at that moment; the copy is read here at launch,
// without the module, so a build whose module will not load still restores the copy last written.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyDisplayData, parseDisplayData, type DisplayData, type SavedInstructionPaths } from '@shared/display-data'
import { loadEngineModule, type EngineSource } from './engine-module'

/** Writes the envelope to the file as JSON, atomically, reading it as it stands when called (EngineModule.writeDisplayCopy) */
export type DisplayWrite = (file: string, envelope: { version: 1; data: DisplayData }) => Promise<void>

/** The engine module's writer, loaded on the first write; a module that will not load fails every write. Whatever fails,
 * the write rejects; the module reads the envelope during the call, before the first await */
export function engineWrite(source: EngineSource): DisplayWrite {
  return async (file, envelope) => loadEngineModule(source).writeDisplayCopy(file, envelope)
}

export interface DisplayStoreOptions {
  /** How the copy is written; without one, a change is recorded and never written */
  write?: DisplayWrite
  /** Where the global instruction files are, for a snapshot saved before instruction entries carried their paths (see
   * parseDisplayData) */
  savedInstructionPaths?: SavedInstructionPaths
}

export class DisplayStore {
  private data: DisplayData = emptyDisplayData()
  /** A change was recorded that no write has taken yet */
  private pending = false
  /** A moment that writes the copy came — the window losing focus, a change without it — since the last write began: a
   * write is owed, whatever the focus is by the time it runs */
  private owed = false
  /** Whether the window has focus; none before the window first gains it, nor once it is gone */
  private focused = false
  /** Quits flushing: while one runs, focus holds nothing back */
  private flushing = 0
  private writing: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly file: string
  private readonly write: DisplayWrite | undefined

  constructor(dir: string, options: DisplayStoreOptions = {}) {
    this.file = join(dir, 'display-cache.json')
    this.write = options.write
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (typeof raw === 'object' && raw !== null && 'version' in raw && raw.version === 1 && 'data' in raw) {
        this.data = parseDisplayData(raw.data, options.savedInstructionPaths)
      }
    } catch { /* A missing or corrupt envelope is a cold start. */ }
  }

  /** The copy as last recorded, or as restored at launch */
  get(): DisplayData { return this.data }

  /** A change: `data` is kept as it is, not copied, and is written as it stands at the moment it is written */
  record(data: DisplayData): void {
    this.data = data
    this.pending = true
    if (!this.focused) this.owe()
  }

  /** The window gained focus, or lost it — to another application or window, or by being hidden, minimised or closed */
  focusChanged(focused: boolean): void {
    this.focused = focused
    if (!focused && this.pending) this.owe()
  }

  /** Writes every change not yet written, whatever the focus: the quit's write. A write under way finishes first. */
  async flush(): Promise<void> {
    this.flushing++
    try {
      if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
      // A write under way that fails leaves its changes pending, for the run below
      while (this.writing) await this.writing.catch(() => {})
      await this.run()
    } finally {
      this.flushing--
    }
  }

  /** A write is owed: it runs on the next turn, so that the changes of one turn go in one write, or after the write
   * under way */
  private owe(): void {
    this.owed = true
    if (this.timer !== null || this.writing) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.run().catch((error: unknown) => console.error('[display-cache] save failed:', error))
    }, 0)
  }

  /**
   * Writes while changes are pending and a write is owed, or a quit is flushing. Each write reads the copy as it stands
   * then, so a change made while one is under way goes in the next. One that fails leaves its changes pending and the
   * copy on disk as it was; the run goes on only for a moment that came while it was under way, and otherwise the next
   * moment writes them (agents-overview::REQ-008/AC-05).
   */
  private run(): Promise<void> {
    const write = this.write
    if (!write) return Promise.resolve()
    this.writing ??= (async () => {
      // Before anything else, so that `writing` holds this run before its end clears it, even when nothing is pending or
      // the writer throws at once
      await Promise.resolve()
      try {
        while (this.pending && (this.owed || this.flushing > 0)) {
          this.pending = false
          this.owed = false
          try {
            await write(this.file, { version: 1, data: this.data })
          } catch (error) {
            this.pending = true
            if (!this.owed) throw error
            console.error('[display-cache] save failed:', error)
          }
        }
      } finally {
        this.writing = null
      }
    })()
    return this.writing
  }
}
