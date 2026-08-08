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
    skillDeleteFailed: (detail: string) => `删除失败:${detail}`
  },

  /** subagent 定义文件的读取失败,作为**数据字段**随快照下发(不是抛出的错误) */
  subagentError: {
    unreadable: '不可读',
    parseFailed: '解析失败'
  }
} as const
