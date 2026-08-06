// app 自有偏好(userData/prefs.json)。绝不写 agent 配置。原子写同 HiddenStore。
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SCHEME,
  isAppearanceScheme,
  type AppearanceScheme,
  type Prefs
} from '@shared/appearance'

export type { Prefs }

export class PrefsStore {
  private readonly file: string
  private readonly dir: string
  private prefs: Prefs

  constructor(storeDir: string) {
    this.dir = storeDir
    this.file = join(storeDir, 'prefs.json')
    this.prefs = this.load()
  }

  get(): Prefs {
    return { ...this.prefs }
  }

  setScheme(scheme: AppearanceScheme): Prefs {
    this.prefs = { scheme }
    this.persist()
    return this.get()
  }

  private load(): Prefs {
    if (!existsSync(this.file)) return { scheme: DEFAULT_SCHEME }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (typeof raw !== 'object' || raw === null) return { scheme: DEFAULT_SCHEME }
      const scheme = (raw as Record<string, unknown>)['scheme']
      if (isAppearanceScheme(scheme)) return { scheme }
      return { scheme: DEFAULT_SCHEME }
    } catch {
      return { scheme: DEFAULT_SCHEME }
    }
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.prefs.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(this.prefs, null, 2))
    renameSync(tmp, this.file)
  }
}
