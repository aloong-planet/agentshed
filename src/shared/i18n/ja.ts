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
  detail: {
    notInSnapshot: 'このプロジェクトはスナップショットにありません（更新して再試行してください）',
    staleTag: '失効',
    tabOverview: '概要',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'セッション',
    tabCfg: '設定',
    tabArts: '成果物',
    loading: '読み込み中…',
    byModel: 'モデル別',
    recentSessions: '最近のセッション',
    noSessions: 'このプロジェクトにはまだセッションがありません',
    sessionCountNote: (n) => `全 ${n} セッション —— すべては「セッション」タブで確認できます。`,
    noSessionsHint: 'このプロジェクトにはまだセッションがありません。どちらかの agent がこのディレクトリで会話すると自動的に表示されます。',
    searching: '検索中…',
    noHits: '該当なし。既定では質問のみを検索します。「全文」に切り替えてみてください。',
    hitsFound: (hits, sessions) => `${hits} 件 · ${sessions} セッション`,
    folded: (n) => ` · ${n} 件を折りたたみ（リプレイまたは破棄された分岐）`,
    recentFirst: '新しい順',
    oldestFirst: '古い順',
    forkUncertain: '⑂? 除去に疑い',
    hitCount: (n) => `${n} 件`,
    inBody: '本文',
    sortNote: (order, n) => `最終アクティビティ${order} · ${n} セッション`,
    descending: '降順',
    ascending: '昇順',
    forkTip: 'このセッションは別のセッションから fork されており、先頭のリプレイ部分は除去済みです',
    forkUncertainTip: '親セッションがスキャン対象外か検証に合致しないため、リプレイ部分はヒューリスティックにしか除去できていません（重複が残る可能性があります）',
    questionCount: (n) => `${n} 質問`,
    sessionsFoot: '登録済みプロジェクトのセッションのみを一覧します。subagent とウォームアップのセッションは個別に載りませんが token は計上されます —— したがってこの件数と上の token カードの母数は同じものではありません。',
    sessionsFoot2: '「最終アクティビティ」はファイル内の最大タイムスタンプを取り、プロジェクト一覧のアクティビティ（ファイルの mtime）とは別系統です。',
    searchPlaceholder: (n) => `このプロジェクトの ${n} セッションから検索…`,
    scopeQuestions: '質問',
    scopeFullText: '全文',
    levelPlugin: 'プラグインパッケージ',
    levelProject: 'プロジェクト単位',
    levelGlobal: 'グローバル',
    uninstall: 'アンインストール',
    uninstalled: (name) => `${name} をアンインストールしました（このプロジェクトのみ更新）`,
    uninstallFailed: (detail) => `アンインストールに失敗しました：${detail}`,
    secClaudeProject: 'プロジェクト単位 · .claude/skills',
    secClaudeGlobal: 'グローバル · Claude',
    secCodexProject: 'プロジェクト単位 · .agents/skills',
    secCodexGlobal: 'グローバル · Codex',
    secPlugin: 'プラグイン同梱 · 本プロジェクトで有効（名前空間付き、読み取り専用）',
    noSkills: 'このプロジェクトで有効な skills はありません',
    confirmTitle: 'プロジェクト単位の skill をアンインストールしますか？',
    confirmBody: '次のディレクトリを削除します（プロジェクトの git 状態はご自身で扱ってください。コピー差分の検出は行いません）：',
    cancel: 'キャンセル',
    del: '削除',
    mcpTitle: 'プロジェクト単位 · .mcp.json（enabled/disabled はプロジェクト設定由来）',
    noMcp: 'このプロジェクトに .mcp.json はありません。グローバル MCP は Agents ページを参照してください',
    mcpEnabled: '有効',
    mcpDisabled: '無効',
    mcpDefault: '既定',
    filterAll: 'すべて',
    noArtifacts: '規約どおりの蓄積がありません（八ステップのプロジェクトではありません。エラーではありません）',
    noArtifactsOfType: 'この種類の成果物はありません',
    openInBrowser: 'HTML → ブラウザ',
    settingsSummary: 'settings の要約',
    noSettings: 'プロジェクトキーに表示できる設定がありません',
    fileMissing: 'ファイルが存在しません'
  },
  projects: {
    searchPlaceholder: 'プロジェクトを検索…',
    filterAll: 'すべて',
    showStale: '失効したプロジェクトを表示',
    staleFiltered: (n) => `失効 ${n} 件を除外しました`,
    noMatch: '一致するプロジェクトがありません',
    hiddenCount: (n) => `非表示 ${n} 件`,
    expandHint: '（クリックで展開）',
    collapseHint: '（クリックで折りたたみ）',
    staleTag: '失効',
    restore: '復元',
    hide: '非表示'
  },
  token: {
    totalCard: (note) => `累計（両サイド合計${note ? ` · ${note}` : ''}）`,
    inOut: '入力 / 出力',
    inOutNote: 'サイドごとに各自の基準で表示',
    cacheCard: 'うちキャッシュ（ccusage 基準で合計に算入済み）',
    cacheReadWrite: (read, write) => `読み ${read} · 書き ${write}`,
    trendTitle: '直近 30 日の推移（ローカルタイムゾーン · 日単位）',
    legendNote: '棒の高さ＝その日の合計、区切り＝provider ごとの割合',
    tipTotal: (label, total) => `${label} · 合計 ${total}`,
    tipArchived: ' · アーカイブ（元ファイルは削除済み）',
    tipNoUsage: '使用なし',
    noModelData: 'モデルのデータがありません'
  },
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
