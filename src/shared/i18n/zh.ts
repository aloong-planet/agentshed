// The source language (Simplified Chinese) — the single source of truth for UI copy.
//
// This object is declared `as const`, which makes its **structure** — the key set, whether a value is a
// string or a function, each function's signature, the nesting — the contract the other five languages
// must satisfy; see the Dict mapping in ./types.ts.
// New copy lands here first, and typecheck stays red until the other five follow: there is no "leave it
// blank for now".
//
// The **values** are Chinese because this is the source language; the comments are English like the rest of
// the repository (ADR-0017), and the working-language gate allows only the values.
export const zh = {
  /** The language written in its own script, for the language selector. Independent of the current UI
   * language — always that language's own spelling */
  languageName: '简体中文',
  /** The language's English name, as a secondary cue in the selector: a second route when its own script
   * is one you cannot read */
  languageNameEn: 'Chinese (Simplified)',
  /** The html lang attribute value, which doubles as the Intl locale tag */
  htmlLang: 'zh-CN',

  /** The rail's hover tooltips */
  rail: {
    agents: 'Agents',
    projects: 'Projects',
    settings: '设置'
  },

  settings: {
    title: '设置',
    lead: '本 app 偏好,对整个界面生效。不写入任何 agent 侧的配置。',
    sectionLanguage: '语言',
    interfaceLanguage: '界面语言',
    followSystem: '跟随系统',
    languageFoot: '选择「跟随系统」时,界面语言随 macOS 的偏好语言变化;偏好语言均不在支持范围内时使用英文。',
    sectionAppearance: '外观',
    mode: '模式',
    modeLight: '浅色',
    modeDark: '深色',
    palette: '主题',
    appearanceFoot:
      '模式选「跟随系统」时,明暗随 macOS 外观变化;选浅色或深色即锁定,系统再变也不影响。主题与明暗彼此独立、可任意组合,未选择时用紫。切换后立即对整个 app 生效,无需保存。',
    themePurple: '紫',
    themeBlue: '雾蓝',
    themeAmber: '琥珀褐'
  },

  /** The application menu (ticket 13). The application name Agentshed is the same in every language
   * (ADR-0013) */
  menu: {
    about: '关于 Agentshed',
    hide: '隐藏 Agentshed',
    hideOthers: '隐藏其他',
    unhide: '全部显示',
    quit: '退出 Agentshed',
    edit: '编辑',
    undo: '撤销', redo: '重做', cut: '剪切', copy: '拷贝', paste: '粘贴', selectAll: '全选',
    view: '显示',
    reload: '重新载入', toggleDevTools: '开发者工具', resetZoom: '实际大小',
    zoomIn: '放大', zoomOut: '缩小', fullscreen: '进入全屏幕',
    window: '窗口', minimize: '最小化', close: '关闭'
  },

  toast: {
    /** Switching to a specific language */
    languageSwitched: (name: string) => `界面语言已切换为 ${name}`,
    /** Switching to "follow system" — this has to name the language it currently resolves to, or the user
     * cannot see what actually changed */
    languageFollowSystem: (name: string) => `已设为跟随系统 · 当前为 ${name}`,
    /** The preference failed to persist (the UI has already switched; a restart reverts it) */
    saveThemeFailed: '保存主题失败',
    saveModeFailed: '保存外观模式失败',
    saveLanguageFailed: '保存语言失败'
  },

  /**
   * The wording for cross-process failures (see ADR-0015). The keys correspond one to one with the error
   * codes in shared/errors.ts.
   * Parameters carry only language-independent things (channel names, field names, paths, numbers); the
   * sentence is assembled here.
   */
  /** Placeholder wording the renderer supplies when the main process sends null (ticket 07) */
  /** The skill reference-depth hint (ticket 07: the main process sends only the verdict, the wording lives
   * here) */
  skillDeepHint: '按照最佳实践,skill 引用深度不宜 ≥ 2,建议改造该 skill',
  /** The Codex config.toml summary: the main process sends only the fields, the sentence is assembled here
   * (ticket 07) */
  codexConfig: (model: string, projects: number, mcp: number) =>
    `model = ${model}\nprojects: ${projects} 条\nmcp_servers: ${mcp} 段`,
  /** The global Agents page and the application shell (ticket 11) */
  agents: {
    sideSummary: (projects: number, skills: number, subagents: number) =>
      `${projects} 项目 · ${skills} 全局 skills · ${subagents} subagents`,
    tabCfg: '配置',
    notDetected: '本机未检测到任何 agent 侧的数据目录',
    notDetectedHint: '安装并使用任一 agent 后,下次自动扫描即可看到全景(切回本窗口会触发扫描)',
    archivedNote: (days: number, earliest: string) =>
      `其中 ${days} 天(最早 ${earliest})源会话文件已被 agent 自动清理,数值来自本地归档(斜纹柱)`,
    byModel: '按模型拆分(跨项目;Codex 侧为会话主模型近似)',
    detected: '已检测',
    undetected: '未检测到',
    emptyGlobalLib: '各侧全局库均为空',
    sideMismatch: (project: string) => `${project} 不属于该 skill 所在的 agent 侧`,
    installed: (skill: string, project: string, side: string) =>
      `已安装 ${skill} → ${project}(${side})`,
    grokBorrowHint: 'Grok 运行时会读取 Claude Code 的全局 skills / subagents / plugins / MCP;这些借入组件归属 Claude 侧,不并入 Grok 的清单',
    skillsHint: '合并单列 · 点行展开包内文件 · 点文件预览 · 无跨侧 diff · 插件只读',
    levelPluginPkg: '插件包',
    levelGlobalLib: '全局库',
    installTo: '安装到…',
    pickTarget: '选择目标项目(复制落地;失效项目已排除)',
    srcGlobalConfig: '全局配置',
    srcPlugin: 'plugin 自带',
    globalMcp: '全局 MCP',
    noGlobalMcp: '无全局 MCP(项目级 .mcp.json 的归属在项目详情)',
    noMcpSection: 'config.toml 无 mcp_servers 段',
    cfgClaudeMd: '全局 CLAUDE.md',
    cfgAgentsMd: '全局 AGENTS.md',
    cfgToml: 'config.toml 摘要',
    tomlMissing: 'config.toml 不存在',
    fileMissing: '文件不存在'
  },

  /** The application shell (ticket 11) */
  shell: {
    pickProject: '选择一个项目查看详情',
    scanning: '正在扫描各 agent 侧…'
  },
  /** Skills package preview and the file drawer (ticket 10) */
  skills: {
    searchPlaceholder: '搜索 skill…',
    /** A different sentence from agents.emptyGlobalLib / detail.noSkills: those two say "there are none
     *  at all", this one says "there are some, but no name matched". Reusing either would state
     *  something false */
    noNameMatch: '没有名字匹配的 skill',
    listFailed: (detail: string) => `列举失败:${detail}`,
    pillPlugin: '插件',
    pillProject: '项目级',
    pillGlobal: '全局',
    pillSymlink: '软链',
    pkgSummary: (files: number, size: string) => `${files} 个文件 · ${size}`,
    srcPluginPkg: '插件包',
    srcProject: '项目',
    srcGlobal: '全局库',
    listing: '列举中…',
    deeperPaths: (paths: string) => `更深路径未列入: ${paths}`,
    colFile: '文件',
    colLines: '行数',
    colSize: '大小',
    colMtime: '修改日期',
    noPreviewable: '包内无可预览文本文件',
    tagEntry: '入口',
    close: '关闭',
    raw: '原文',
    preview: '预览',
    loading: '加载中…',
    emptyFile: '空文件',
    installMissing: '安装目录缺失',
    pkgUnreadable: 'skill 包不可读'
  },

  /** The Subagents view (ticket 10) */
  subagents: {
    noneGlobal: '两侧均无 subagent 定义(~/.claude/agents 与 ~/.codex/agents)',
    globalHint: '双端合并单列 · 同名一行(不做内容 diff) · 点条目看完整定义',
    noDescription: '(无 description)',
    noneProject: '项目级与全局层均无 subagent 定义',
    projectHint: '生效视图 · Claude/Codex 均为项目级遮蔽 · 点条目看完整定义',
    levelProject: '项目级',
    levelGlobal: '全局',
    overridesBuiltin: '覆盖内置',
    shadows: '遮蔽同名',
    shadowed: '被项目级遮蔽',
    metaShadows: ' · 压过同名低层定义',
    metaShadowed: ' · 被项目级定义遮蔽(未生效)',
    noSideDef: '该侧无定义',
    inherited: '—(继承)'
  },

  /** The Memory view (ticket 10) */
  memory: {
    codexLegacy: 'Codex 记忆功能当前未开启,上方为目录中的遗留文件。',
    codexEmpty: 'Codex 记忆已开启,暂无内容。',
    codexDisabled:
      'Codex 记忆功能未开启——可在 Codex 内用 /memories 命令,或「设置 → 个性化 → Enable memories」开启(实验性)。',
    noneGlobal: '所有项目均无自动记忆',
    globalHint: '按最近修改倒序 · 含失效(带徽标) · 点行展开文件列表,点文件看内容',
    stale: '失效',
    codexGlobalDir: '全局记忆目录',
    noMainFile: '无 MEMORY.md',
    noneProject: '该项目暂无自动记忆',
    claudeOnly: 'Memory 为 Claude 侧机制(Codex 记忆是全局的,见全局页 Memory 分栏)',
    mainTitle: 'MEMORY.md(自动记忆主文件)',
    noMain: '无 MEMORY.md(仅 topic 文件)',
    topicsTitle: (n: number) => `Topic 文件(${n}) · 点击查看`,
    noTopics: '无 topic 文件',
    topicMeta: (ago: string) => `topic 文件 · ${ago}`,
    unreadable: (detail: string) => `文件不可读:${detail}`,
    loading: '读取中…'
  },

  /** The Plugins view (ticket 10) */
  plugins: {
    projectMissing: '(项目已失效)',
    installMissing: '安装目录缺失(缓存已清理)——仅注册表记录可见,内含组件无法读取',
    noBundled: '四类内含组件均无',
    codexCacheEnum: '缓存枚举',
    cachedVersions: (n: number) => `(${n} 个版本缓存)`,
    cacheOnly: '仅缓存枚举',
    codexFoot: 'Codex 组仅列缓存中存在的插件;无启用态语义,内含 skills 可预览但不并入 Skills 分栏',
    codexFootDetail: ';Codex 插件为全局生效,无项目级启用语义',
    claudeGlobalHint: '启用口径:user 层 · 点条目展开内含组件',
    noPlugins: '未安装任何 plugin',
    enabled: '已启用',
    notEnabled: '未启用',
    claudeProjectHint: '启用口径:本项目有效启用集(local > project > user)',
    enabledShort: '启用',
    disabledShort: '禁用',
    noLayerMentions: '任何层均未提及',
    verdictFrom: (verdict: string, layer: string) => `${verdict}判定来自 ${layer}`,
    layerLocal: 'local 层',
    layerProject: 'project 层',
    layerUser: 'user 层'
  },
  /** The session page and its in-turn blocks (ticket 09). The ** and ` markers are rich-text markup — see
   * RichText */
  session: {
    forkPoints: (n: number) =>
      `本会话有 **${n} 处分叉**。已按最后一条消息沿父链回溯到根渲染这一条链——即「这次对话最终长什么样」;被放弃的分支不显示。`,
    forkedFrom: '本会话 fork 自',
    anotherSession: '另一会话',
    /** The quotation marks around a parent session title: paired punctuation is copy, so each language
     * supplies its own. The fork banner and the uncertain-strip warning can appear on the same screen, so
     * the two must agree */
    parentTitle: (title: string) => `《${title}》`,
    forkedFromTail: '——重放前缀已剥离,下面只展示本次 fork 之后的新内容。**更早的历史见该会话**。',
    stripUncertainOrphan:
      '**重放前缀剥离不确定**:本会话 fork 自一个**不在扫描集内**的父会话(父文件已被清理,或属未注册项目),只能按启发式剥离——**可能多剥(丢消息)或少剥(重复)**,请对照原文核对。不静默剥错是这里唯一能给的保证。',
    stripUncertainMismatch: (parent: string) =>
      `**重放前缀剥离不确定**:重放段与父会话《${parent}》没有逐条对上(父日志可能被重写),只剥掉了**能通过校验的部分**——开头可能与父会话重复或缺失,请对照原文核对。`,
    fetching: '取回中…',
    rebuilding: '索引签名不符(文件被追加或重写)→ 正在**只重建该文件**的索引…',
    turnFailed: (detail: string) => `这一轮取不回来:${detail}`,
    fetchedNote: (ms: number, bytes: string) =>
      `按需取回 ${ms} ms · 只读本轮区间 ${bytes},与文件总大小无关`,
    back: (project: string) => `返回 ${project} · 会话`,
    headMeta: (side: string, questions: number, tok: string, mb: string, ago: string) =>
      `${side} · ${questions} 提问 · ${tok} tok · ${mb} · 最后活动 ${ago}`,
    cannotOpen: (detail: string) => `会话打不开:${detail}`,
    loading: '读取中…',
    mainline: (n: number, days: string) => `提问(主干)· ${n} 条${days}`,
    dayCount: (n: number) => ` · ${n} 天`,
    expandAll: '全部展开',
    collapseAll: '全部收起',
    ascending: '正序',
    descending: '倒序',
    dayGroup: (day: string, n: number) => `${day} · ${n} 条`,
    foot: '主干只列人类提问,harness 噪声不进渲染;提问一次列全(文本按字节区间现读,与文件大小无关)。点提问就地展开整轮:正文、工具调用、subagent 派发与推理块。'
  },

  /** In-turn blocks (ticket 09) */
  turn: {
    typeSeparator: '、',
    thinking: '思考',
    thinkingSum: (chars: number) => `${chars} 字 · 明文可得`,
    reasoning: '推理',
    reasoningSum: (n: number) => `仅 ${n} 条小标题 · 正文不可得`,
    reasoningNote:
      'Codex 的推理正文是 `encrypted_content`,**永远拿不到**。下面是记录里仅有的明文小标题——与 Claude 侧的明文思考**不对等**,不假装一致。',
    input: '入参',
    output: '返回',
    empty: '(空)',
    noOutput: '(无返回记录)',
    truncatedNote:
      '返回超过 agent 的单条上限,transcript 里**只存了截断版**;原文旁挂在 `tool-results/` 下(路径见上文),本产品不读它——这里展示的就是截断版,不谎称完整。',
    subSteps: (n: number) => `${n} 步 · 未返回`,
    dispatchPrompt: '派发 prompt',
    innerSteps: '内部步骤',
    unlinkedNote:
      '这次派发的内部步骤在记录中**没有稳定引用链**可归位到此处(两侧实测皆然)——未展示,不做猜测性配对;完整转写在其独立文件中(如有)。',
    backToMain: '返回主会话',
    noReturn: '(未返回)',
    unknownRecords: (count: number, types: string) =>
      `本轮有 **${count} 条未识别记录**(类型:${types})——原样保留在源文件中,未渲染。这通常意味着 agent 更新引入了新记录类型。`
  },
  /** The project detail tabs (ticket 08) */
  detail: {
    notInSnapshot: '项目不在快照中(刷新后重试)',
    staleTag: '失效',
    /** The stale note page (spec project-detail sequence S). `{sides}` is the chip slot — one
     * complete sentence per language, the slot moving with each language's word order (the RichText
     * rule applied to a node slot); the cause takes the side count for languages that inflect on it */
    staleCause: (_n: number) => '失效原因:项目目录已不存在(被删除或移动),而 {sides} 的注册表仍记录着它。',
    staleFx: '从注册表移除该记录后,此行将从列表消失;token 累计与趋势不受影响(统计独立于注册表)。',
    staleSend: '把这句话分别发给 {sides},由它自己删除:',
    stalePrompt: (p: string) => `我的项目 "${p}" 已经失效(目录已不存在),请帮我从你的配置中移除它的记录。`,
    staleCopy: '复制',
    staleCopied: '已复制',
    staleCopyFailed: '复制失败',
    tabOverview: '概览',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: '会话',
    tabCfg: '配置',
    tabArts: '产物',
    loading: '读取中…',
    byModel: '按模型拆分',
    recentSessions: '最近会话',
    noSessions: '该项目暂无会话',
    sessionCountNote: (n: number) => `共 ${n} 个会话 —— 全部见「会话」分栏。`,
    noSessionsHint: '该项目暂无会话。任一 agent 侧在此目录下开过对话后会自动出现。',
    searching: '搜索中…',
    noHits: '没有命中。默认只搜提问,试试切到「全文」。',
    hitsFound: (hits: number, sessions: number) => `找到 ${hits} 条 · ${sessions} 个会话`,
    folded: (n: number) => ` · 已折叠 ${n} 条重放或被放弃分支上的命中`,
    recentFirst: '最近在前',
    oldestFirst: '最早在前',
    forkUncertain: '剥离存疑',
    hitCount: (n: number) => `${n} 条命中`,
    inBody: '正文',
    sortNote: (order: string, n: number) => `按最近活动时间${order} · ${n} 个会话`,
    descending: '倒序',
    ascending: '正序',
    forkTip: '本会话 fork 自另一个会话,开头的重放前缀已剥离',
    forkUncertainTip: '父会话不在扫描集内或与父校验不符,重放前缀只能按启发式剥离——可能少剥(重复)',
    questionCount: (n: number) => `${n} 提问`,
    sessionsFoot: '只列已注册项目的会话;subagent 与预热会话不单独入列,但 token 仍计入统计——故此处条数与上方 token 卡的分母不是同一个。',
    sessionsFoot2: '「最近活动」取文件内最大时间戳,与项目列表的活跃度(取文件 mtime)是两条管线。',
    searchPlaceholder: (n: number) => `在本项目的 ${n} 个会话里搜索…`,
    scopeQuestions: '提问',
    scopeFullText: '全文',
    levelPlugin: '插件包',
    levelProject: '项目级',
    levelGlobal: '全局层',
    uninstall: '卸载',
    uninstalled: (name: string) => `已卸载 ${name}`,
    uninstallFailed: (detail: string) => `卸载失败:${detail}`,
    secClaudeProject: '项目级 · .claude/skills',
    secClaudeGlobal: '全局层 · Claude',
    secCodexProject: '项目级 · .agents/skills',
    secCodexGlobal: '全局层 · Codex',
    secPlugin: '插件内含 · 本项目有效启用(命名空间调用,只读)',
    noSkills: '该项目无生效 skills',
    confirmTitle: '卸载项目级 skill?',
    confirmBody: '将删除以下目录(项目 git 状态由你自行处理;不做副本差异检测):',
    cancel: '取消',
    del: '删除',
    mcpTitle: '项目级 · .mcp.json(enabled/disabled 来自项目设置)',
    noMcp: '项目无 .mcp.json;全局 MCP 见 Agents 页',
    mcpEnabled: '已启用',
    mcpDisabled: '已禁用',
    mcpDefault: '默认',
    filterAll: '全部',
    noArtifacts: '未按约定沉淀(非八步项目;不视为错误)',
    noArtifactsOfType: '该类无产物',
    openInBrowser: 'HTML → 浏览器',
    settingsSummary: 'settings 摘要',
    noSettings: '项目键无可展示设置',
    fileMissing: '文件不存在'
  },
  /** The project list (ticket 08) */
  projects: {
    searchPlaceholder: '搜索项目…',
    filterAll: '全部',
    showStale: '显示失效项目',
    staleFiltered: (n: number) => `已过滤 ${n} 个失效`,
    noMatch: '无匹配项目',
    staleTag: '失效'
  },
  /** Token statistics and the trend chart (ticket 08) */
  token: {
    /** The four time windows. Each card shows that window's total and selecting it scopes the page. */
    winAll: '累计总量 · 全部历史',
    winToday: '本日',
    winD7: '近 7 天',
    winD30: '近 30 天',
    /* "last 7 / 30 days" rather than "last week / month": the window is a rolling N days, while
       "a month" sits ambiguously between a calendar month and 30 days. Naming the days tells no lie
       and matches the trend chart's own span. */
    /** The composition: the three buckets that carry one meaning on every side and sum to the total */
    compCacheRead: 'cache 读',
    compUncached: '未命中输入',
    compOutput: '输出',
    compTipCacheRead: (v: string) => `${v} · 命中缓存、不必重算的输入`,
    /* Cache writes are counted inside "uncached input", which the label cannot convey on its own —
       and "where did cache creation go" is the first question this bar provokes. */
    compTipUncached: (v: string) => `${v} · 含 cache 写:都是这一轮真读进模型的输入`,
    compTipOutput: (v: string) => `${v} · 模型生成的 token`,
    /** The window is appended to whichever by-model title the page uses — the two pages carry
     *  different caveats in that title, so it is passed in rather than written here */
    byModelIn: (title: string, win: string) => `${title} · ${win}`,
    noUsageInWindow: '选中的时间窗口内没有用量',
    trendTitle: '近 30 天趋势(本地时区 · 日粒度)',
    legendNote: '柱高=当日总量,分段=各 provider 占比',
    /** Appended to the legend note when a window narrower than the chart is selected */
    legendDimNote: ';压暗段=选中窗口之外',
    tipTotal: (label: string, total: string) => `${label} · 合计 ${total}`,
    tipArchived: ' · 归档(源文件已清理)',
    tipNoUsage: '无用量',
    noModelData: '暂无模型数据'
  },
  /** The display names that vary by language (the rest, such as Anthropic / Claude, are proper nouns and
   * are not translated) */
  label: {
    providerOther: '其他',
    trendTotal: '合计'
  },

  placeholder: {
    unreadableLine: '(该行已无法读取)',
    untitledSession: '(无标题会话)',
    unknownTool: '(未知工具)',
    unknown: '(未知)',
    notSet: '未设置',
    codexGlobalMemory: '(Codex 全局记忆)',
    truncated: '…(已截断)'
  },

  errors: {
    badArgs: (channel: string, field: string) =>
      field ? `调用参数不合契约:${channel}(字段 ${field})` : `调用参数不合契约:${channel}`,
    sessionNotWhitelisted: '会话路径不在白名单,请先打开项目详情',
    engineNotReady: '扫描引擎未就绪,请稍候再试',
    turnOutOfRange: (i: number, total: number) => `轮次下标越界:${i}(共 ${total} 轮)`,
    artifactNotWhitelisted: '产物路径不在白名单',
    pluginRootNotRegistered: '插件包根不在登记集,请先刷新或打开详情',
    projectNotOpened: '项目未打开,请先打开项目详情',
    skillPackageUnavailable: 'skill 包不可用或不在允许根下',
    skillFileNotWhitelisted: 'skill 文件路径不在白名单',
    skillFileUnreadable: 'skill 文件不可读',
    sessionNotIndexed: '会话不在索引中,下次扫描后重试',
    sessionFileUnreadable: '会话文件已不可读(被移动或删除?)',
    sessionMetaUnreadable: '会话首行元数据不可读,无法重建索引',
    sessionParseFailed: '会话文件解析失败',
    prefsStoreNotReady: '偏好存储未就绪',
    invalidPref: (field: string) => `偏好取值不合契约:${field}`,
    contractMissing: (path: string) => `收到不合契约的载荷:缺少 ${path}`,
    contractType: (path: string, expect: string) => `收到不合契约的载荷:${path} 应为 ${expect}`,
    contractEnum: (path: string, value: string) =>
      `收到不合契约的载荷:${path} 的取值 ${value} 不在允许范围内`,
    untrustedSender: (sender: string) => `IPC 调用方不可信:${sender}`,
    linkProtocolUnsupported: '不支持的链接协议',
    linkOutOfScope: '链接目标不在可读范围',
    skillBadName: '非法 skill 名',
    skillStaleTarget: '目标是失效项目(目录不存在)',
    skillMissingSource: (name: string) => `全局库无此 skill:${name}`,
    skillCopyMissing: '项目级副本不存在',
    skillConflict: '目标已有同名项目级 skill,已阻止不覆盖',
    skillCopyFailed: (detail: string) => `复制失败已清理:${detail}`,
    skillDeleteFailed: (detail: string) => `删除失败:${detail}`,
    registryProjectsInvalid: '注册表的 projects 键缺失或不是对象',
    registryParseFailed: (detail: string) => `注册表解析失败:${detail}`,
    subagentUnreadable: '文件不可读(权限或 IO 异常)',
    subagentTomlFailed: (detail: string) => `toml 解析失败:${detail}`,
    subagentMissingName: '缺有效 name 字段(Codex 不加载此文件)'
  },

  /** A failure to read a subagent definition file, delivered with the snapshot as a **data field** rather
   * than thrown as an error */
  subagentError: {
    unreadable: '不可读',
    parseFailed: '解析失败',
    detail: (msg: string) => `${msg};其余条目不受影响。`
  }
} as const
