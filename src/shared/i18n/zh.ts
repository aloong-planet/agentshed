// 源语言(简体中文)——界面文案的唯一真相。
//
// 这份对象用 `as const` 定义,于是它的**结构**(key 集合、值是字符串还是函数、
// 函数签名、嵌套层次)成为其余五语必须对齐的契约,见 ./types.ts 的 Dict 映射。
// 新增文案先落这里,其余五语不补齐则 typecheck 失败——不存在「暂时留空」。
export const zh = {
  /** 该语言的母语书写,用于语言选择器;与界面当前语言无关,恒为该语言自身的写法 */
  languageName: '简体中文',
  /** 该语言的英文名,作为选择器的次要线索:母语文字不认识时仍有第二条路 */
  languageNameEn: 'Chinese (Simplified)',
  /** html lang 属性值,同时用作 Intl 的 locale tag */
  htmlLang: 'zh-CN',

  /** 侧边栏悬停提示 */
  rail: {
    agents: 'Agents',
    projects: 'Projects',
    refresh: '全局刷新',
    settings: '设置'
  },

  settings: {
    title: '设置',
    lead: '本 app 偏好,对整个界面生效。不写入 Claude / Codex 配置。',
    sectionLanguage: '语言',
    interfaceLanguage: '界面语言',
    followSystem: '跟随系统',
    languageFoot: '选择「跟随系统」时,界面语言随 macOS 的偏好语言变化;偏好语言均不在支持范围内时使用英文。',
    sectionAppearance: '外观',
    mode: '模式',
    modeLight: '浅色',
    modeDark: '深色',
    palette: '配色',
    appearanceFoot:
      '模式选「跟随系统」时,明暗随 macOS 外观变化;选浅色或深色即锁定,系统再变也不影响。配色与明暗彼此独立、可任意组合,未选择时用紫。切换后立即对整个 app 生效,无需保存。',
    schemePurple: '紫',
    schemeBlue: '雾蓝',
    schemeAmber: '琥珀褐'
  },

  toast: {
    /** 切到某个具体语言 */
    languageSwitched: (name: string) => `界面语言已切换为 ${name}`,
    /** 切到「跟随系统」——必须说明当前解析成了哪种语言,否则用户看不出实际效果 */
    languageFollowSystem: (name: string) => `已设为跟随系统 · 当前为 ${name}`,
    /** 偏好落盘失败(界面已切换,重启后恢复) */
    saveSchemeFailed: '保存配色失败',
    saveModeFailed: '保存外观模式失败',
    saveLanguageFailed: '保存语言失败'
  },

  /**
   * 跨进程失败的措辞(见 ADR-0015)。键与 shared/errors.ts 的错误码一一对应。
   * 参数只承载语言无关的东西(通道名、字段名、路径、数字),措辞在这里成句。
   */
  /** 主进程传 null 时由渲染层补的占位措辞(票 07) */
  /** skill 引用深度提示(票 07:主进程只传判定结果,文案在这里) */
  skillDeepHint: '按照最佳实践,skill 引用深度不宜 ≥ 2,建议改造该 skill',
  /** Codex config.toml 摘要:主进程只传字段,这里组装成句(票 07) */
  codexConfig: (model: string, projects: number, mcp: number) =>
    `model = ${model}\nprojects: ${projects} 条\nmcp_servers: ${mcp} 段`,
  /** Skills 包预览与文件抽屉(票 10) */
  skills: {
    listFailed: (detail: string) => `列举失败:${detail}`,
    pillPlugin: '插件',
    pillProject: '项目级',
    pillGlobal: '全局',
    pillSymlink: '⤷ 软链',
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

  /** Subagents 视图(票 10) */
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

  /** Memory 视图(票 10) */
  memory: {
    codexLegacy: 'Codex 记忆功能当前未开启,上方为目录中的遗留文件。',
    codexEmpty: 'Codex 记忆已开启,暂无内容。',
    codexDisabled:
      'Codex 记忆功能未开启——可在 Codex 内用 /memories 命令,或「设置 → 个性化 → Enable memories」开启(实验性)。',
    noneGlobal: '所有项目均无自动记忆',
    globalHint: '按最近修改倒序 · 含失效/已隐藏(带徽标) · 点行展开文件列表,点文件看内容',
    stale: '失效',
    hidden: '已隐藏',
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

  /** Plugins 视图(票 10) */
  plugins: {
    projectMissing: '(项目已失联)',
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
  /** 会话页与轮内块(票 09)。带 ** 与 ` 的是富文本标记,见 RichText */
  session: {
    forkPoints: (n: number) =>
      `本会话有 **${n} 处分叉**。已按最后一条消息沿父链回溯到根渲染这一条链——即「这次对话最终长什么样」;被放弃的分支不显示。`,
    forkedFrom: '本会话 fork 自',
    anotherSession: '另一会话',
    forkedFromTail: '——重放前缀已剥离,下面只展示本次 fork 之后的新内容。**更早的历史见该会话**。',
    stripUncertainOrphan:
      '**重放前缀剥离不确定**:本会话 fork 自一个**不在扫描集内**的父会话(父文件已被清理,或属未注册项目),只能按启发式剥离——**可能多剥(丢消息)或少剥(重复)**,请对照原文核对。不静默剥错是这里唯一能给的保证。',
    stripUncertainMismatch: (parent: string) =>
      `**重放前缀剥离不确定**:重放段与父会话《${parent}》没有逐条对上(父日志可能被重写),只剥掉了**能通过校验的部分**——开头可能与父会话重复或缺失,请对照原文核对。`,
    fetching: '取回中…',
    rebuilding: '索引签名不符(文件被追加或重写)→ 正在**只重建该文件**的索引…',
    turnFailed: (detail: string) => `这一轮取不回来:${detail}`,
    fetchedNote: (ms: number, bytes: string) =>
      `⚡ 按需取回 ${ms} ms · 只读本轮区间 ${bytes},与文件总大小无关`,
    back: (project: string) => `‹ 返回 ${project} · 会话`,
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

  /** 轮内块(票 09) */
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
      `▧ 本轮有 **${count} 条未识别记录**(类型:${types})——原样保留在源文件中,未渲染。这通常意味着 agent 更新引入了新记录类型。`
  },
  /** 项目详情各分栏(票 08) */
  detail: {
    notInSnapshot: '项目不在快照中(刷新后重试)',
    staleTag: '失效',
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
    noSessionsHint: '该项目暂无会话。两侧 agent 在此目录下开过对话后会自动出现。',
    searching: '搜索中…',
    noHits: '没有命中。默认只搜提问,试试切到「全文」。',
    hitsFound: (hits: number, sessions: number) => `找到 ${hits} 条 · ${sessions} 个会话`,
    folded: (n: number) => ` · 已折叠 ${n} 条重放或被放弃分支上的命中`,
    recentFirst: '最近在前',
    oldestFirst: '最早在前',
    forkUncertain: '⑂? 剥离存疑',
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
    uninstalled: (name: string) => `已卸载 ${name}(仅局部刷新该项目)`,
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
  /** 项目列表(票 08) */
  projects: {
    searchPlaceholder: '搜索项目…',
    filterAll: '全部',
    showStale: '显示失效项目',
    staleFiltered: (n: number) => `已过滤 ${n} 个失效`,
    noMatch: '无匹配项目',
    hiddenCount: (n: number) => `已隐藏 ${n} 项`,
    expandHint: '(点击展开)',
    collapseHint: '(点击收起)',
    staleTag: '失效',
    restore: '恢复',
    hide: '隐藏'
  },
  /** 随语言变化的展示名(其余如 Anthropic / Claude 是专有名词,不译) */
  /** Token 统计与趋势图(票 08) */
  token: {
    totalCard: (note: string) => `累计总量(两侧合计${note ? ` · ${note}` : ''})`,
    inOut: '输入 / 输出',
    inOutNote: '各侧原生口径分列',
    cacheCard: '其中 cache(ccusage 口径已计入总量)',
    cacheReadWrite: (read: string, write: string) => `读 ${read} · 写 ${write}`,
    trendTitle: '近 30 天趋势(本地时区 · 日粒度)',
    legendNote: '柱高=当日总量,分段=各 provider 占比',
    tipTotal: (label: string, total: string) => `${label} · 合计 ${total}`,
    tipArchived: ' · 归档(源文件已清理)',
    tipNoUsage: '无用量',
    noModelData: '暂无模型数据'
  },
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
    sessionNotWhitelisted: '会话路径不在白名单,请先打开项目详情或全局刷新',
    engineNotReady: '扫描引擎未就绪,请稍候再试',
    turnOutOfRange: (i: number, total: number) => `轮次下标越界:${i}(共 ${total} 轮)`,
    artifactNotWhitelisted: '产物路径不在白名单',
    pluginRootNotRegistered: '插件包根不在登记集,请先刷新或打开详情',
    projectNotOpened: '项目未打开,请先打开项目详情',
    skillPackageUnavailable: 'skill 包不可用或不在允许根下',
    skillFileNotWhitelisted: 'skill 文件路径不在白名单',
    skillFileUnreadable: 'skill 文件不可读',
    sessionNotIndexed: '会话不在索引中,请先全局刷新',
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

  /** subagent 定义文件的读取失败,作为**数据字段**随快照下发(不是抛出的错误) */
  subagentError: {
    unreadable: '不可读',
    parseFailed: '解析失败',
    detail: (msg: string) => `${msg};其余条目不受影响。`
  }
} as const
