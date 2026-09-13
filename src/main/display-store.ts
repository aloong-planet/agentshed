// An independently versioned presentation copy. Accounting never consumes this file (ADR-0029).
import { readFileSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyDisplayData, parseDisplayData, type DisplayData } from '@shared/display-data'

export class DisplayStore {
  private data: DisplayData = emptyDisplayData()
  private dirty = false
  private writing: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly file: string

  constructor(private readonly dir: string) {
    this.file = join(dir, 'display-cache.json')
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (typeof raw === 'object' && raw !== null && 'version' in raw && raw.version === 1 && 'data' in raw) {
        this.data = parseDisplayData(raw.data)
      }
    } catch { /* A missing or corrupt envelope is a cold start. */ }
  }

  get(): DisplayData { return this.data }

  save(data: DisplayData): void {
    this.data = structuredClone(data)
    this.dirty = true
    if (this.timer === null) this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch((error: unknown) => console.error('[display-cache] save failed:', error))
    }, 0)
  }

  async flush(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
    if (this.writing) return this.writing
    this.writing = (async () => {
      while (this.dirty) {
        this.dirty = false
        const text = JSON.stringify({ version: 1, data: this.data })
        const tmp = join(this.dir, `.display-cache.json.tmp-${process.pid}`)
        try {
          await mkdir(this.dir, { recursive: true })
          await writeFile(tmp, text, { mode: 0o600 })
          await rename(tmp, this.file)
        } catch (error) {
          this.dirty = true
          await unlink(tmp).catch(() => {})
          throw error
        }
      }
    })()
    try { await this.writing } finally { this.writing = null }
  }
}
