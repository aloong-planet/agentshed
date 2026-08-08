import type { Locale } from './types'

export const ja: Locale = {
  languageName: '日本語',
  languageNameEn: 'Japanese',
  htmlLang: 'ja',

  rail: {
    agents: 'Agents',
    projects: 'Projects',
    refresh: 'すべて更新',
    settings: '設定'
  },

  settings: {
    title: '設定',
    lead: 'この app 固有の設定です。インターフェース全体に適用され、Claude や Codex の設定には書き込まれません。',
    sectionLanguage: '言語',
    interfaceLanguage: 'インターフェースの言語',
    followSystem: 'システムに従う',
    languageFoot:
      '「システムに従う」を選ぶと、インターフェースは macOS の優先言語に従います。いずれも対応していない場合は英語になります。',
    sectionAppearance: '外観',
    mode: 'モード',
    modeLight: 'ライト',
    modeDark: 'ダーク',
    palette: 'パレット',
    appearanceFoot:
      'モードを「システムに従う」にすると、明暗は macOS の外観に従います。ライトまたはダークを選ぶと固定され、システムが変わっても影響を受けません。パレットと明暗は独立していて自由に組み合わせられ、未選択の場合はパープルです。変更は保存不要で app 全体にすぐ反映されます。',
    schemePurple: 'パープル',
    schemeBlue: 'ミストブルー',
    schemeAmber: 'アンバー'
  },

  toast: {
    languageSwitched: (name) => `インターフェースの言語を ${name} に変更しました`,
    languageFollowSystem: (name) => `システムに従う設定にしました · 現在は ${name}`
  }
}
