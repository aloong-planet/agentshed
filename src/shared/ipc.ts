// IPC 契约:channel 名与载荷类型的单一出处。两端只从此处导入,禁止各自定义。

export const CMD = {
  /** 取当前快照(无则触发首扫) */
  getSnapshot: 'agentshed:get-snapshot',
  /** 全局刷新(rail 底部 ↻;进行中重复调用被去重) */
  refresh: 'agentshed:refresh',
  /** 手动隐藏/取消隐藏项目 */
  setHidden: 'agentshed:set-hidden'
} as const

export const EVT = {
  /** 主进程推送新快照(刷新完成) */
  snapshot: 'agentshed:snapshot'
} as const

export interface SetHiddenArgs {
  projectPath: string
  hidden: boolean
}
