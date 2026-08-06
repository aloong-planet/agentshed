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
