import { contextBridge, ipcRenderer } from 'electron'
import {
  CMD,
  EVT,
  type SessionTurnArgs,
  type SetHiddenArgs,
  type SkillOpArgs,
  type SkillOpResult,
  type Prefs,
  type AppearanceScheme
} from '@shared/ipc'
import type { ProjectDetail, SessionPage, SessionTurn, Snapshot } from '@shared/domain'
import {
  validateSnapshot,
  validateProjectDetail,
  validateSessionPage,
  validateSessionTurn
} from '@shared/validate'

// renderer 入口处的契约校验:主进程发来的快照不合契约就抛,不静默渲染 undefined
function checked(snap: unknown): Snapshot {
  const r = validateSnapshot(snap)
  if (!r.ok) throw new Error(`收到不合契约的快照 — ${r.error}`)
  return snap as Snapshot
}

const api = {
  getSnapshot: async (): Promise<Snapshot> => checked(await ipcRenderer.invoke(CMD.getSnapshot)),
  refresh: async (): Promise<Snapshot> => checked(await ipcRenderer.invoke(CMD.refresh)),
  setHidden: (args: SetHiddenArgs): Promise<void> => ipcRenderer.invoke(CMD.setHidden, args),
  // 与快照同规矩:两端各校验一次。主进程那次抓"我们生成错了",这一次抓 IPC
  // 传输本身的损耗——结构化克隆会丢掉 undefined 属性,主进程看着对、渲染层收到
  // 的却缺字段,只有入口这一侧看得见。
  getProjectDetail: async (path: string): Promise<ProjectDetail> => {
    const d: unknown = await ipcRenderer.invoke(CMD.getProjectDetail, path)
    const r = validateProjectDetail(d)
    if (!r.ok) throw new Error(`收到不合契约的项目详情 — ${r.error}`)
    return d as ProjectDetail
  },
  // 会话页:与快照/详情同规矩,两端各校验一次(这一侧抓结构化克隆的损耗)
  getSessionPage: async (file: string): Promise<SessionPage> => {
    const p: unknown = await ipcRenderer.invoke(CMD.getSessionPage, file)
    const r = validateSessionPage(p)
    if (!r.ok) throw new Error(`收到不合契约的会话页 — ${r.error}`)
    return p as SessionPage
  },
  // 票 05:轮次按需取回。fresh 是只读谓词(要不要先亮"重建中"),取回本身在主进程侧
  // 完成签名校验与必要的单文件重建
  sessionFresh: (file: string): Promise<boolean> =>
    ipcRenderer.invoke(CMD.sessionFresh, file) as Promise<boolean>,
  getSessionTurn: async (args: SessionTurnArgs): Promise<SessionTurn> => {
    const t: unknown = await ipcRenderer.invoke(CMD.getSessionTurn, args)
    const r = validateSessionTurn(t)
    if (!r.ok) throw new Error(`收到不合契约的单轮载荷 — ${r.error}`)
    return t as SessionTurn
  },
  readArtifact: (file: string): Promise<string> =>
    ipcRenderer.invoke(CMD.readArtifact, file) as Promise<string>,
  openArtifact: (file: string): Promise<void> => ipcRenderer.invoke(CMD.openArtifact, file),
  installSkill: (args: SkillOpArgs): Promise<SkillOpResult> =>
    ipcRenderer.invoke(CMD.installSkill, args) as Promise<SkillOpResult>,
  uninstallSkill: (args: SkillOpArgs): Promise<SkillOpResult> =>
    ipcRenderer.invoke(CMD.uninstallSkill, args) as Promise<SkillOpResult>,
  getPrefs: (): Promise<Prefs> => ipcRenderer.invoke(CMD.getPrefs) as Promise<Prefs>,
  setScheme: (scheme: AppearanceScheme): Promise<Prefs> =>
    ipcRenderer.invoke(CMD.setScheme, scheme) as Promise<Prefs>,
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const listener = (_e: unknown, snap: unknown): void => cb(checked(snap))
    ipcRenderer.on(EVT.snapshot, listener)
    return () => ipcRenderer.removeListener(EVT.snapshot, listener)
  }
}

export type AgentshedApi = typeof api
contextBridge.exposeInMainWorld('agentshed', api)
