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
    badgeDefault: 'デフォルト',
    appearanceFoot:
      'ライト / ダークは macOS のシステム外観に従います。スキームの変更は保存不要で、app 全体にすぐ反映されます。',
    schemePurple: 'パープル',
    schemeBlue: 'ミストブルー',
    schemeAmber: 'アンバー',
    schemePurpleDesc:
      'ブランドカラーのパープル。インストール直後の既定の外観で、以前のバージョンと同じです。',
    schemeBlueDesc:
      '暖かみのあるグレーの紙地に、落ち着いたブルーのアクセント。長時間の閲覧に向きます。',
    schemeAmberDesc: '暖かい紙地に、ブラウンのアクセント。紙の本に近い質感です。'
  },

  toast: {
    languageSwitched: (name) => `インターフェースの言語を ${name} に変更しました`,
    languageFollowSystem: (name) => `システムに従う設定にしました · 現在は ${name}`
  }
}
