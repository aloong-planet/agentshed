// 外观方案:全 app UI 强调色/纸感;与昼夜(系统)正交。见 docs/specs/appearance.md。

export const APPEARANCE_SCHEMES = ['purple', 'blue', 'amber'] as const
export type AppearanceScheme = (typeof APPEARANCE_SCHEMES)[number]

export const DEFAULT_SCHEME: AppearanceScheme = 'purple'

export function isAppearanceScheme(v: unknown): v is AppearanceScheme {
  return typeof v === 'string' && (APPEARANCE_SCHEMES as readonly string[]).includes(v)
}

export interface Prefs {
  scheme: AppearanceScheme
}

/** IPC/preload 入口:把 unknown 收成 Prefs;不合契约返回 null(不抛,由调用方决定文案)。 */
export function parsePrefs(raw: unknown): Prefs | null {
  if (typeof raw !== 'object' || raw === null) return null
  const scheme = (raw as Record<string, unknown>)['scheme']
  if (!isAppearanceScheme(scheme)) return null
  return { scheme }
}
