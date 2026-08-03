import { contextBridge, ipcRenderer } from 'electron'
import { CMD, EVT, type SetHiddenArgs, type SkillOpArgs, type SkillOpResult } from '@shared/ipc'
import type { ProjectDetail, Snapshot } from '@shared/domain'
import { validateSnapshot, validateProjectDetail } from '@shared/validate'

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
  readArtifact: (file: string): Promise<string> =>
    ipcRenderer.invoke(CMD.readArtifact, file) as Promise<string>,
  openArtifact: (file: string): Promise<void> => ipcRenderer.invoke(CMD.openArtifact, file),
  installSkill: (args: SkillOpArgs): Promise<SkillOpResult> =>
    ipcRenderer.invoke(CMD.installSkill, args) as Promise<SkillOpResult>,
  uninstallSkill: (args: SkillOpArgs): Promise<SkillOpResult> =>
    ipcRenderer.invoke(CMD.uninstallSkill, args) as Promise<SkillOpResult>,
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const listener = (_e: unknown, snap: unknown): void => cb(checked(snap))
    ipcRenderer.on(EVT.snapshot, listener)
    return () => ipcRenderer.removeListener(EVT.snapshot, listener)
  }
}

export type AgentshedApi = typeof api
contextBridge.exposeInMainWorld('agentshed', api)
