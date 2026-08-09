// Persisting manual hiding: the app's own storage (hidden.json under userData), never the agent
// configuration.
// Atomic writes: a temporary file + rename, so an interruption leaves no half file. Paths match by the
// merge key (trailing slash removed, lowercased).
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mergeKey } from '@shared/path-key'

export class HiddenStore {
  private readonly file: string
  private readonly dir: string
  private keys: Set<string>

  constructor(storeDir: string) {
    this.dir = storeDir
    this.file = join(storeDir, 'hidden.json')
    this.keys = this.load()
  }

  private load(): Set<string> {
    if (!existsSync(this.file)) return new Set()
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (Array.isArray(raw)) return new Set(raw.filter((v): v is string => typeof v === 'string'))
      return new Set()
    } catch {
      // Corrupt storage: degrade to an empty set (a hiding preference can be rebuilt, and is not worth
      // crashing the app over)
      return new Set()
    }
  }

  isHidden(projectPath: string): boolean {
    return this.keys.has(mergeKey(projectPath))
  }

  setHidden(projectPath: string, hidden: boolean): void {
    const key = mergeKey(projectPath)
    if (hidden) this.keys.add(key)
    else this.keys.delete(key)
    this.persist()
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.hidden.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify([...this.keys], null, 2))
    renameSync(tmp, this.file)
  }
}
