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
    languageFollowSystem: (name) => `システムに従う設定にしました · 現在は ${name}`,
    saveSchemeFailed: 'パレットの保存に失敗しました',
    saveModeFailed: '外観モードの保存に失敗しました',
    saveLanguageFailed: '言語の保存に失敗しました'
  },

  errors: {
    badArgs: (channel, field) =>
      field ? `呼び出し引数が不正です：${channel}（フィールド ${field}）` : `呼び出し引数が不正です：${channel}`,
    sessionNotWhitelisted:
      'このセッションは許可リストにありません。先にプロジェクトの詳細を開くか、更新してください',
    engineNotReady: 'スキャンエンジンの準備ができていません。少し待って再試行してください',
    turnOutOfRange: (i, total) => `ターン番号が範囲外です：${i}（全 ${total} ターン）`,
    artifactNotWhitelisted: 'この成果物のパスは許可リストにありません',
    pluginRootNotRegistered:
      'このプラグインのパッケージルートは登録されていません。先に更新するか詳細を開いてください',
    projectNotOpened: 'プロジェクトが開かれていません。先に詳細を開いてください',
    skillPackageUnavailable: 'skill パッケージが利用できないか、許可されたルートの外にあります',
    skillFileNotWhitelisted: 'この skill ファイルのパスは許可リストにありません',
    skillFileUnreadable: 'skill ファイルを読み取れません',
    sessionNotIndexed: 'このセッションはインデックスにありません。先に全体を更新してください',
    sessionFileUnreadable: 'セッションファイルが読み取れなくなりました（移動または削除？）',
    sessionMetaUnreadable: 'セッションの先頭行が読み取れないため、インデックスを再構築できません',
    sessionParseFailed: 'セッションファイルの解析に失敗しました',
    prefsStoreNotReady: '設定の保存領域が準備できていません',
    invalidPref: (field) => `設定値が不正です：${field}`
  },

  subagentError: {
    unreadable: '読み取り不可',
    parseFailed: '解析失敗'
  }
}
