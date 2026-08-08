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

  skillDeepHint: 'ベストプラクティスでは skill の参照深度は 2 未満です。この skill の見直しを検討してください',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects：${projects}\nmcp_servers：${mcp}`,
  /** 随语言变化的展示名(其余如 Anthropic / Claude 是专有名词,不译) */
  label: {
    providerOther: 'その他',
    trendTotal: '合計'
  },

  placeholder: {
    unreadableLine: '（この行は読み取れません）',
    untitledSession: '（無題のセッション）',
    unknownTool: '（不明なツール）',
    unknown: '（不明）',
    notSet: '未設定',
    codexGlobalMemory: '（Codex グローバルメモリ）',
    truncated: '…（切り詰めました）'
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
    invalidPref: (field) => `設定値が不正です：${field}`,
    contractMissing: (path) => `契約に合わないペイロードを受信しました：${path} がありません`,
    contractType: (path, expect) => `契約に合わないペイロードを受信しました：${path} は ${expect} である必要があります`,
    contractEnum: (path, value) =>
      `契約に合わないペイロードを受信しました：${path} の値 ${value} は許容範囲外です`,
    untrustedSender: (sender) => `信頼できない IPC 呼び出し元：${sender}`,
    linkProtocolUnsupported: 'サポートされていないリンクプロトコルです',
    linkOutOfScope: 'リンク先が読み取り可能な範囲外です',
    skillBadName: '不正な skill 名です',
    skillStaleTarget: '対象は失効したプロジェクトです（ディレクトリが存在しません）',
    skillMissingSource: (name) => `グローバルライブラリにその skill はありません：${name}`,
    skillCopyMissing: 'プロジェクト単位のコピーが存在しません',
    skillConflict: '対象には同名のプロジェクト単位 skill が既にあります。上書きせず中止しました',
    skillCopyFailed: (detail) => `コピーに失敗し、後始末しました：${detail}`,
    skillDeleteFailed: (detail) => `削除に失敗しました：${detail}`,
    registryProjectsInvalid: 'レジストリの projects キーが無いか、オブジェクトではありません',
    registryParseFailed: (detail) => `レジストリの解析に失敗しました：${detail}`,
    subagentUnreadable: 'ファイルを読み取れません（権限または I/O エラー）',
    subagentTomlFailed: (detail) => `toml の解析に失敗しました：${detail}`,
    subagentMissingName: '有効な name フィールドがありません（Codex はこのファイルを読み込みません）'
  },

  subagentError: {
    unreadable: '読み取り不可',
    parseFailed: '解析失敗',
    detail: (msg) => `${msg}。他の項目には影響ありません。`
  }
}
