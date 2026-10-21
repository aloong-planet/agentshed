// The demo dimensions every prototype page shares; demo-dimensions.js carries them (see its header).
// The settings prototype (appearance/) sets every dimension and the gallery's settings set the general
// ones (the language and light/dark). Each value is what the product renders: the language and the
// light/dark in effect, never a "follow system" preference.
// This registry is the prototypes' own list of each dimension's values and their order: the baseline the
// app follows, not generated from the app's source and not checked against it. A language's fallback is
// what a page shows when it is not drawn in the language chosen.
// The defaults are what the untouched settings prototype shows: its language and light/dark preferences
// start on Follow system, so those two default to the dimension's fallback, or its first value where it
// has none; the palette starts on purple.
window.DEMO_DIMENSIONS = {
  language: { label: '界面语言', default: 'en', fallback: 'en', values: ['zh', 'en'], general: true },
  mode: { label: '明暗', default: 'light', values: ['light', 'dark'], general: true },
  theme: { label: '配色', default: 'purple', values: ['purple', 'blue', 'amber'] }
}
// The note a page shows when it is not drawn in the value chosen
window.DEMO_DIMENSIONS_FALLBACK_NOTE = 'Demo · 本页未画{label} {chosen}，按 {shown} 显示'
