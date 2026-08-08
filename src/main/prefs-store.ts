// app 自有偏好(userData/prefs.json)。绝不写 agent 配置。原子写同 HiddenStore。
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_MODE,
  DEFAULT_SCHEME,
  isAppearanceMode,
  isAppearanceScheme,
  type AppearanceMode,
  type AppearanceScheme
} from '@shared/appearance'
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  isLanguagePreference,
  type LanguagePreference
} from '@shared/i18n'
import { DEFAULT_PREFS, type Prefs } from '@shared/prefs'

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
    this.prefs = { ...this.prefs, scheme }
    this.persist()
    return this.get()
  }

  setLanguage(language: LanguagePreference): Prefs {
    this.prefs = { ...this.prefs, language }
    this.persist()
    return this.get()
  }

  setMode(mode: AppearanceMode): Prefs {
    this.prefs = { ...this.prefs, mode }
    this.persist()
    return this.get()
  }

  /**
   * 读取时**逐字段降级**:某一项非法只回落该项,不牵连其他偏好。
   * 这是「降级只准自伤」不变量在偏好上的落地——早先只有一个字段时,
   * 「整份回默认」与「逐字段回默认」表现相同,加了第二个字段后两者就分道扬镳了。
   */
  private load(): Prefs {
    if (!existsSync(this.file)) return { ...DEFAULT_PREFS }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS }
      const r = raw as Record<string, unknown>
      const scheme = r['scheme']
      const language = r['language']
      const mode = r['mode']
      return {
        scheme: isAppearanceScheme(scheme) ? scheme : DEFAULT_SCHEME,
        language: isLanguagePreference(language) ? language : DEFAULT_LANGUAGE_PREFERENCE,
        mode: isAppearanceMode(mode) ? mode : DEFAULT_MODE
      }
    } catch {
      return { ...DEFAULT_PREFS }
    }
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.prefs.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(this.prefs, null, 2))
    renameSync(tmp, this.file)
  }
}
