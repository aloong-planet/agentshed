// IPC 契约:channel 名与载荷类型的单一出处。两端只从此处导入,禁止各自定义。

export const CMD = {
  /** 取当前快照(无则触发首扫) */
  getSnapshot: 'agentshed:get-snapshot',
  /** 全局刷新(rail 底部 ↻;进行中重复调用被去重) */
  refresh: 'agentshed:refresh',
  /** 手动隐藏/取消隐藏项目 */
  setHidden: 'agentshed:set-hidden',
  /** 按需拉取项目详情 */
  getProjectDetail: 'agentshed:get-project-detail',
  /** 会话页:提问索引 + 按区间现读的文本(票 04;区间读通路,不复用产物整读) */
  getSessionPage: 'agentshed:get-session-page',
  /** 会话索引是否与磁盘一致(票 05;只读谓词,渲染层据此展示重建中间态) */
  sessionFresh: 'agentshed:session-fresh',
  /** 按需取回一轮:提问下标 → 该轮区间现读 + 归一化块(票 05) */
  getSessionTurn: 'agentshed:get-session-turn',
  /** 本项目会话搜索:默认搜提问,可切全文(票 08;区间读粗筛,不建索引) */
  searchSessions: 'agentshed:search-sessions',
  /** 读产物 Markdown(仅限详情列出过的文件,主进程白名单校验) */
  readArtifact: 'agentshed:read-artifact',
  /** 外开产物(prototypes HTML → 系统默认打开;同白名单) */
  openArtifact: 'agentshed:open-artifact',
  /** 从全局库安装 skill 到项目(复制落地) */
  installSkill: 'agentshed:install-skill',
  /** 卸载项目级 skill 副本 */
  uninstallSkill: 'agentshed:uninstall-skill',
  /** 读 app 偏好(外观方案等) */
  getPrefs: 'agentshed:get-prefs',
  /** 设置外观方案(全 app) */
  setScheme: 'agentshed:set-scheme'
} as const

export const EVT = {
  /** 主进程推送新快照(刷新完成) */
  snapshot: 'agentshed:snapshot'
} as const

export interface SetHiddenArgs {
  projectPath: string
  hidden: boolean
}

export interface SessionTurnArgs {
  file: string
  /** 提问下标,0 起,对应会话页展示集合(getSessionPage.questions 的顺序) */
  i: number
}

export interface SearchSessionsArgs {
  /** 项目路径(会话集合由主进程按它取,渲染层给不了文件路径) */
  path: string
  needle: string
  fullText: boolean
}

export interface SkillOpArgs {
  skillName: string
  side: 'claude' | 'codex'
  targetProjectPath: string
}

export type SkillOpResult =
  | { ok: true }
  | { ok: false; reason: string; message: string }

export type { AppearanceScheme, Prefs } from './appearance'
