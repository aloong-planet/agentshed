import { contextBridge, ipcRenderer } from 'electron'
import { CMD, EVT, type SetHiddenArgs } from '@shared/ipc'
import type { Snapshot } from '@shared/domain'
import { validateSnapshot } from '@shared/validate'

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
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const listener = (_e: unknown, snap: unknown): void => cb(checked(snap))
    ipcRenderer.on(EVT.snapshot, listener)
    return () => ipcRenderer.removeListener(EVT.snapshot, listener)
  }
}

export type AgentshedApi = typeof api
contextBridge.exposeInMainWorld('agentshed', api)
