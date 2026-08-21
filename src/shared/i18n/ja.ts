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
    lead: 'この app 固有の設定です。インターフェース全体に適用され、どのエージェントサイドの設定にも書き込まれません。',
    sectionLanguage: '言語',
    interfaceLanguage: '表示言語',
    followSystem: 'システムに従う',
    languageFoot:
      '「システムに従う」を選ぶと、インターフェースは macOS の優先言語に従います。いずれも対応していない場合は英語になります。',
    sectionAppearance: '外観',
    mode: 'モード',
    modeLight: 'ライト',
    modeDark: 'ダーク',
    palette: 'テーマ',
    appearanceFoot:
      'モードを「システムに従う」にすると、明暗は macOS の外観に従います。ライトまたはダークを選ぶと固定され、システムが変わっても影響を受けません。テーマと明暗は独立していて自由に組み合わせられ、未選択の場合はパープルです。変更は保存不要で app 全体にすぐ反映されます。',
    themePurple: 'パープル',
    themeBlue: 'ミストブルー',
    themeAmber: 'アンバー'
  },

  menu: {
    about: 'Agentshed について', hide: 'Agentshed を隠す', hideOthers: 'ほかを隠す',
    unhide: 'すべてを表示', quit: 'Agentshed を終了',
    edit: '編集', undo: '取り消す', redo: 'やり直す', cut: 'カット', copy: 'コピー', paste: 'ペースト', selectAll: 'すべてを選択',
    view: '表示', reload: '再読み込み', toggleDevTools: '開発者ツール', resetZoom: '実際のサイズ',
    zoomIn: '拡大', zoomOut: '縮小', fullscreen: 'フルスクリーンにする',
    window: 'ウインドウ', minimize: 'しまう', close: '閉じる'
  },

  toast: {
    languageSwitched: (name) => `インターフェースの言語を ${name} に変更しました`,
    languageFollowSystem: (name) => `システムに従う設定にしました · 現在は ${name}`,
    saveThemeFailed: 'テーマの保存に失敗しました',
    saveModeFailed: '外観モードの保存に失敗しました',
    saveLanguageFailed: '言語の保存に失敗しました'
  },

  skillDeepHint: 'ベストプラクティスでは skill の参照深度は 2 未満です。この skill の見直しを検討してください',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  agents: {
    sideSummary: (projects, skills, subagents) => `${projects} プロジェクト · ${skills} グローバル skills · ${subagents} subagents`,
    tabCfg: '構成',
    notDetected: 'このマシンではどのエージェントサイドのデータディレクトリも検出されませんでした',
    notDetectedHint: (refreshLabel) =>
      `いずれかの agent をインストールして使ったあと、左下の「${refreshLabel}」を押すと全体像が見えます`,
    totalsNote: '失効プロジェクトを含む',
    archivedNote: (days, earliest) => `うち ${days} 日（最古 ${earliest}）は元のセッションファイルが agent により自動削除済みで、数値はローカルアーカイブ由来です（斜線の棒）`,
    byModel: 'モデル別（プロジェクト横断。Codex 側はセッションの主モデルの近似）',
    detected: '検出済み', undetected: '未検出',
    emptyGlobalLib: '各サイドのグローバルライブラリはいずれも空です',
    sideMismatch: (project) => `${project} はこの skill が属する agent サイドに属していません`,
    installed: (skill, project, side) => `${skill} を ${project}（${side}）にインストールしました。更新はこのプロジェクトのみです`,
    grokBorrowHint: 'Grok は実行時に Claude Code のグローバル skills / subagents / plugins / MCP を読み込みます。これらの借用コンポーネントは Claude サイドに属し、Grok のリストには入りません',
    skillsHint: '1 列に統合 · 行をクリックでパッケージ内ファイル · ファイルをクリックでプレビュー · サイド間 diff なし · プラグインは読み取り専用',
    levelPluginPkg: 'プラグインパッケージ', levelGlobalLib: 'グローバルライブラリ',
    installTo: 'インストール先…',
    pickTarget: '対象プロジェクトを選択（コピーして配置。失効プロジェクトは除外済み）',
    srcGlobalConfig: 'グローバル設定', srcPlugin: 'plugin 同梱',
    globalMcp: 'グローバル MCP',
    noGlobalMcp: 'グローバル MCP はありません（プロジェクト単位の .mcp.json はプロジェクト詳細にあります）',
    noMcpSection: 'config.toml に mcp_servers セクションがありません',
    cfgClaudeMd: 'グローバル CLAUDE.md', cfgAgentsMd: 'グローバル AGENTS.md', cfgToml: 'config.toml の要約',
    tomlMissing: 'config.toml が存在しません', fileMissing: 'ファイルが存在しません'
  },

  shell: {
    pickProject: 'プロジェクトを選択すると詳細が表示されます',
    scanning: '各エージェントサイドをスキャン中…'
  },
  skills: {
    searchPlaceholder: 'skill を検索…',
    noNameMatch: '名前が一致する skill はありません',
    listFailed: (detail) => `列挙に失敗しました：${detail}`,
    pillPlugin: 'プラグイン', pillProject: 'プロジェクト', pillGlobal: 'グローバル', pillSymlink: 'シンボリック',
    pkgSummary: (files, size) => `${files} ファイル · ${size}`,
    srcPluginPkg: 'プラグインパッケージ', srcProject: 'プロジェクト', srcGlobal: 'グローバルライブラリ',
    listing: '列挙中…',
    deeperPaths: (paths) => `より深いパスは未収録: ${paths}`,
    colFile: 'ファイル', colLines: '行数', colSize: 'サイズ', colMtime: '更新日時',
    noPreviewable: 'パッケージ内にプレビュー可能なテキストファイルがありません',
    tagEntry: 'エントリ', close: '閉じる', raw: '原文', preview: 'プレビュー',
    loading: '読み込み中…', emptyFile: '空のファイル',
    installMissing: 'インストール先ディレクトリがありません', pkgUnreadable: 'skill パッケージを読み取れません'
  },

  subagents: {
    noneGlobal: '両サイドとも subagent 定義がありません（~/.claude/agents と ~/.codex/agents）',
    globalHint: '両サイドを 1 列に統合 · 同名は 1 行（内容 diff は行いません）· 行をクリックで完全な定義',
    noDescription: '（description なし）',
    noneProject: 'プロジェクト単位・グローバルとも subagent 定義がありません',
    projectHint: '有効ビュー · Claude/Codex ともプロジェクト単位が上書き · 行をクリックで完全な定義',
    levelProject: 'プロジェクト単位', levelGlobal: 'グローバル',
    overridesBuiltin: '組み込みを上書き', shadows: '同名を上書き', shadowed: 'プロジェクト単位が優先',
    metaShadows: ' · 同名の下位定義を上書きします',
    metaShadowed: ' · プロジェクト単位の定義に上書きされています（適用されません）',
    noSideDef: 'このサイドに定義はありません', inherited: '—（継承）'
  },

  memory: {
    codexLegacy: 'Codex のメモリ機能は有効化されていません。上記はディレクトリに残っているファイルです。',
    codexEmpty: 'Codex のメモリは有効ですが、内容がありません。',
    codexDisabled: 'Codex のメモリ機能は有効化されていません —— Codex 内で /memories コマンド、または「設定 → パーソナライズ → Enable memories」で有効にできます（実験的）。',
    noneGlobal: 'どのプロジェクトにも自動メモリがありません',
    globalHint: '更新の新しい順 · 失効を含む（バッジ付き）· 行をクリックでファイル一覧、ファイルをクリックで内容',
    stale: '失効',
    codexGlobalDir: 'グローバルメモリのディレクトリ', noMainFile: 'MEMORY.md なし',
    noneProject: 'このプロジェクトにはまだ自動メモリがありません',
    claudeOnly: 'Memory は Claude 側の仕組みです（Codex のメモリはグローバルで、グローバルページの Memory タブを参照）',
    mainTitle: 'MEMORY.md（自動メモリの主ファイル）',
    noMain: 'MEMORY.md はありません（topic ファイルのみ）',
    topicsTitle: (n) => `topic ファイル（${n}）· クリックで表示`,
    noTopics: 'topic ファイルはありません',
    topicMeta: (ago) => `topic ファイル · ${ago}`,
    unreadable: (detail) => `ファイルを読み取れません：${detail}`,
    loading: '読み込み中…'
  },

  plugins: {
    projectMissing: '（プロジェクトが失効）',
    installMissing: 'インストール先ディレクトリがありません（キャッシュ削除済み）—— レジストリの記録のみ参照可能で、同梱コンポーネントは読み取れません',
    noBundled: '4 種類の同梱コンポーネントはいずれもありません',
    codexCacheEnum: 'キャッシュ列挙',
    cachedVersions: (n) => `（キャッシュ ${n} バージョン）`,
    cacheOnly: 'キャッシュ列挙のみ',
    codexFoot: 'Codex のグループはキャッシュに存在するプラグインのみを列挙します。有効/無効という区別はなく、同梱 skills はプレビューできますが Skills タブには統合されません',
    codexFootDetail: '。Codex のプラグインはグローバルに有効で、プロジェクト単位で有効化するという概念はありません',
    claudeGlobalHint: '有効判定の基準：user 層 · 行をクリックで同梱コンポーネントを展開',
    noPlugins: 'プラグインは 1 つもインストールされていません',
    enabled: '有効', notEnabled: '未有効化',
    claudeProjectHint: '有効判定の基準：本プロジェクトの有効集合（local > project > user）',
    enabledShort: '有効', disabledShort: '無効',
    noLayerMentions: 'どの層にも記載なし',
    verdictFrom: (verdict, layer) => `${verdict}判定の根拠：${layer}`,
    layerLocal: 'local 層', layerProject: 'project 層', layerUser: 'user 層'
  },
  session: {
    forkPoints: (n) =>
      `このセッションには **${n} 箇所の分岐**があります。最後のメッセージから親リンクをたどってルートまで遡った 1 本の鎖を表示しています —— つまり「この対話が最終的にどうなったか」です。破棄された分岐は表示しません。`,
    forkedFrom: 'このセッションの fork 元は',
    anotherSession: '別のセッション',
    parentTitle: (title) => `『${title}』`,
    forkedFromTail: '—— リプレイ部分は除去済みで、以下はこの fork 以降の新しい内容のみです。**それ以前の履歴はそのセッションを参照してください**。',
    stripUncertainOrphan:
      '**リプレイ除去に不確かさがあります**:このセッションは**スキャン対象外**の親から fork されており（親ファイルが削除済み、または未登録プロジェクト）、ヒューリスティックにしか除去できません —— **除去しすぎ（メッセージの欠落）や除去不足（重複）の可能性があります**。原文と照合してください。黙って誤らないことが、ここで保証できる唯一のことです。',
    stripUncertainMismatch: (parent) =>
      `**リプレイ除去に不確かさがあります**:リプレイ部分が親セッション『${parent}』と 1 件ずつ一致しません（親ログが書き換えられた可能性）。**検証を通った部分**のみ除去したため、冒頭が親と重複しているか欠けている可能性があります。原文と照合してください。`,
    fetching: '取得中…',
    rebuilding: 'インデックスの署名が不一致（ファイルが追記または書き換え）→ **このファイルのみ**インデックスを再構築中…',
    turnFailed: (detail) => `このターンを取得できませんでした：${detail}`,
    fetchedNote: (ms, bytes) =>
      `オンデマンド取得 ${ms} ms · このターンのバイト範囲 ${bytes} のみ読み取り（ファイル全体のサイズとは無関係）`,
    back: (project) => `${project} に戻る · セッション`,
    headMeta: (side, questions, tok, mb, ago) =>
      `${side} · 質問 ${questions} 件 · ${tok} tok · ${mb} · 最終アクティビティ ${ago}`,
    cannotOpen: (detail) => `セッションを開けません：${detail}`,
    loading: '読み込み中…',
    mainline: (n, days) => `質問（メインライン）· ${n} 件${days}`,
    dayCount: (n) => ` · ${n} 日`,
    expandAll: 'すべて展開',
    collapseAll: 'すべて折りたたみ',
    ascending: '昇順',
    descending: '降順',
    dayGroup: (day, n) => `${day} · ${n} 件`,
    foot: 'メインラインには人間の質問のみを載せ、harness のノイズは描画しません。質問は一度にすべて列挙します（本文はバイト範囲でオンデマンドに読むため、ファイルサイズとは無関係です）。質問をクリックするとその場でターン全体を展開します:本文、ツール呼び出し、subagent への委譲、推論ブロック。'
  },

  turn: {
    typeSeparator: '、',
    thinking: '思考',
    thinkingSum: (chars) => `${chars} 文字 · 平文が取得可能`,
    reasoning: '推論',
    reasoningSum: (n) => `小見出し ${n} 件のみ · 本文は取得不可`,
    reasoningNote:
      'Codex の推論本文は `encrypted_content` であり、**決して取得できません**。以下は記録に残る平文の小見出しのみです —— Claude 側の平文思考とは**対等ではなく**、同じであるかのようには扱いません。',
    input: '引数',
    output: '戻り値',
    empty: '（空）',
    noOutput: '（戻り値の記録なし）',
    truncatedNote:
      '戻り値が agent の 1 件あたりの上限を超えたため、transcript には**切り詰め版のみ**が保存されています。原文は `tool-results/` 配下（パスは上記）に併置されますが、本製品はそれを読みません —— ここに表示しているのは切り詰め版であり、完全であるとは主張しません。',
    subSteps: (n) => `${n} ステップ · 戻り値なし`,
    dispatchPrompt: '委譲 prompt',
    innerSteps: '内部ステップ',
    unlinkedNote:
      'この委譲の内部ステップは、記録上ここへ紐付けられる**安定した参照の連鎖がありません**（両サイドで実測）。表示せず、推測による対応付けも行いません。完全な転写は（あれば）独立したファイルにあります。',
    backToMain: 'メインセッションに戻る',
    noReturn: '（戻り値なし）',
    unknownRecords: (count, types) =>
      `このターンには**未識別の記録が ${count} 件**あります（種類：${types}）—— ソースファイルにはそのまま残っており、描画していません。通常は agent の更新で新しい記録種別が入ったことを意味します。`
  },
  detail: {
    notInSnapshot: 'このプロジェクトはスナップショットにありません（更新して再試行してください）',
    staleTag: '失効',
    tabOverview: '概要',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'セッション',
    tabCfg: '構成',
    tabArts: '成果物',
    loading: '読み込み中…',
    byModel: 'モデル別',
    recentSessions: '最近のセッション',
    noSessions: 'このプロジェクトにはまだセッションがありません',
    sessionCountNote: (n) => `全 ${n} セッション —— すべては「セッション」タブで確認できます。`,
    noSessionsHint: 'このプロジェクトにはまだセッションがありません。いずれかのエージェントサイドがこのディレクトリで会話すると自動的に表示されます。',
    searching: '検索中…',
    noHits: '該当なし。既定では質問のみを検索します。「全文」に切り替えてみてください。',
    hitsFound: (hits, sessions) => `${hits} 件 · ${sessions} セッション`,
    folded: (n) => ` · ${n} 件を折りたたみ（リプレイまたは破棄された分岐）`,
    recentFirst: '新しい順',
    oldestFirst: '古い順',
    forkUncertain: '除去不確実',
    hitCount: (n) => `${n} 件`,
    inBody: '本文',
    sortNote: (order, n) => `最終アクティビティ${order} · ${n} セッション`,
    descending: '降順',
    ascending: '昇順',
    forkTip: 'このセッションは別のセッションから fork されており、先頭のリプレイ部分は除去済みです',
    forkUncertainTip: '親セッションがスキャン対象外か検証に合致しないため、リプレイ部分はヒューリスティックにしか除去できていません（重複が残る可能性があります）',
    questionCount: (n) => `質問 ${n} 件`,
    sessionsFoot: '登録済みプロジェクトのセッションのみを一覧します。subagent とウォームアップのセッションは個別に載りませんが token は計上されます —— したがってこの件数と上の token カードの分母は同じものではありません。',
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
    noArtifacts: '規約どおりの蓄積がありません（8 ステップのプロジェクトではありません。エラーではありません）',
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
    staleTag: '失効',
  },
  token: {
    winAll: (note) => `累計 · 全期間${note ? `（${note}）` : ''}`,
    winToday: '本日',
    winD7: '直近 7 日',
    winD30: '直近 30 日',
    compCacheRead: 'キャッシュ読み取り',
    compUncached: '未ヒット入力',
    compOutput: '出力',
    compTipCacheRead: (v) => `${v} · キャッシュから供給され、再計算されなかった入力`,
    compTipUncached: (v) => `${v} · キャッシュ書き込みを含む：このターンでモデルが実際に読み込んだ入力`,
    compTipOutput: (v) => `${v} · モデルが生成したトークン`,
    byModelIn: (title, win) => `${title} · ${win}`,
    noUsageInWindow: '選択した期間には使用がありません',
    trendTitle: '直近 30 日の推移（ローカルタイムゾーン · 日単位）',
    legendNote: '棒の高さ＝その日の合計、各区分＝provider ごとの割合',
    legendDimNote: '、淡色＝選択期間の外',
    tipTotal: (label, total) => `${label} · 合計 ${total}`,
    tipArchived: ' · アーカイブ（元ファイルは削除済み）',
    tipNoUsage: '使用なし',
    noModelData: 'モデルのデータがありません'
  },
  /** The display names that vary by language (the rest, such as Anthropic / Claude, are proper nouns and
   * are not translated) */
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
    sessionNotIndexed: 'このセッションはインデックスにありません。先に「すべて更新」を実行してください',
    sessionFileUnreadable: 'セッションファイルが読み取れなくなりました（移動または削除？）',
    sessionMetaUnreadable: 'セッション先頭行のメタデータが読み取れないため、インデックスを再構築できません',
    sessionParseFailed: 'セッションファイルの解析に失敗しました',
    prefsStoreNotReady: '設定の保存領域が準備できていません',
    invalidPref: (field) => `設定値が不正です：${field}`,
    contractMissing: (path) => `契約に合わないペイロードを受信しました：${path} がありません`,
    contractType: (path, expect) => `契約に合わないペイロードを受信しました：${path} は ${expect} である必要があります`,
    contractEnum: (path, value) =>
      `契約に合わないペイロードを受信しました：${path} の値 ${value} は許容される値ではありません`,
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
