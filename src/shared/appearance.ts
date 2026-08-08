// 外观方案:全 app UI 强调色/纸感;与昼夜(系统)正交。见 docs/specs/appearance.md。

export const APPEARANCE_SCHEMES = ['purple', 'blue', 'amber'] as const
export type AppearanceScheme = (typeof APPEARANCE_SCHEMES)[number]

export const DEFAULT_SCHEME: AppearanceScheme = 'purple'

export function isAppearanceScheme(v: unknown): v is AppearanceScheme {
  return typeof v === 'string' && (APPEARANCE_SCHEMES as readonly string[]).includes(v)
}

/** 设置页方案卡标题(中文) */
export const SCHEME_LABEL: Record<AppearanceScheme, string> = {
  purple: '紫',
  blue: '雾蓝',
  amber: '琥珀褐'
}

// 偏好的组装与跨进程校验见 ./prefs —— 本文件只管外观方案本身。
