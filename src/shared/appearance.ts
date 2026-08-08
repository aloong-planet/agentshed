// 外观:**模式**(明暗)×**配色**(强调色/纸感)两维正交。见 docs/specs/appearance.md。

export const APPEARANCE_SCHEMES = ['purple', 'blue', 'amber'] as const
export type AppearanceScheme = (typeof APPEARANCE_SCHEMES)[number]

export const DEFAULT_SCHEME: AppearanceScheme = 'purple'

export function isAppearanceScheme(v: unknown): v is AppearanceScheme {
  return typeof v === 'string' && (APPEARANCE_SCHEMES as readonly string[]).includes(v)
}

/**
 * 外观模式:用户对界面明暗的偏好。
 *
 * `'system'` 与语言偏好的「跟随系统」同构——是一条**持续生效的策略,不是选中当刻的
 * 明暗快照**;选 light / dark 即锁定,系统外观再变也不影响。由它与系统外观共同决定的
 * **生效明暗**才是最终渲染的值,生效明暗本身不被持久化。
 *
 * 取值刻意与 Electron `nativeTheme.themeSource` 的三态**同名**,故映射即恒等;
 * 两边取值域不再对齐时由 typecheck 拦下,机制见 src/main/appearance-mode.ts。
 */
export const APPEARANCE_MODES = ['system', 'light', 'dark'] as const
export type AppearanceMode = (typeof APPEARANCE_MODES)[number]

export const DEFAULT_MODE: AppearanceMode = 'system'

export function isAppearanceMode(v: unknown): v is AppearanceMode {
  return typeof v === 'string' && (APPEARANCE_MODES as readonly string[]).includes(v)
}

// 方案的展示名已随界面文案一并进入 i18n 字典(settings.scheme*),
// 此处不再保留单语标签表——它在本次改动中失去了唯一使用者。

// 偏好的组装与跨进程校验见 ./prefs —— 本文件只管外观方案本身。
