// The demo dimensions every prototype page shares; demo-dimensions.js carries them (see its header).
// The settings prototype (appearance/) sets them, and each value is what the product renders: the effective
// language and the effective light/dark, never a "follow system" preference — that resolves on the
// settings prototype, against the system it simulates.
// Each value list is the product's own list, in the product's order, and scripts/check-shared-ui.mjs
// compares the two: language with LANGUAGES (src/shared/i18n), mode with APPEARANCE_MODES less 'system'
// and theme with APPEARANCE_THEMES (src/shared/appearance.ts); the language fallback with
// FALLBACK_LANGUAGE, which is what the product shows when it has no copy in the language asked for.
// The defaults are what the settings prototype resolves to when it has never been touched.
window.DEMO_DIMENSIONS = {
  language: { label: '界面语言', default: 'zh', fallback: 'en', values: ['zh', 'en', 'fr', 'es', 'ru', 'ja'] },
  mode: { label: '明暗', default: 'light', values: ['light', 'dark'] },
  theme: { label: '配色', default: 'purple', values: ['purple', 'blue', 'amber'] }
}
// The note a page shows when it is not drawn in the value chosen on the settings prototype
window.DEMO_DIMENSIONS_FALLBACK_NOTE = '演示 · 本页未画{label} {chosen}，按 {shown} 显示'
