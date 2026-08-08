// 外观方案:全 app UI 强调色/纸感;与昼夜(系统)正交。见 docs/specs/appearance.md。

export const APPEARANCE_SCHEMES = ['purple', 'blue', 'amber'] as const
export type AppearanceScheme = (typeof APPEARANCE_SCHEMES)[number]

export const DEFAULT_SCHEME: AppearanceScheme = 'purple'

export function isAppearanceScheme(v: unknown): v is AppearanceScheme {
  return typeof v === 'string' && (APPEARANCE_SCHEMES as readonly string[]).includes(v)
}

// 方案的展示名已随界面文案一并进入 i18n 字典(settings.scheme*),
// 此处不再保留单语标签表——它在本次改动中失去了唯一使用者。

// 偏好的组装与跨进程校验见 ./prefs —— 本文件只管外观方案本身。
