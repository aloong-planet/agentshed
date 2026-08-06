import { useEffect, useState } from 'react'
import type { Snapshot } from '@shared/domain'
import { DEFAULT_SCHEME, type AppearanceScheme } from '@shared/appearance'
import { ProjectsPane } from './ProjectsPane'
import { AgentsPane } from './AgentsPane'
import { DetailPane } from './DetailPane'
import { SessionPane } from './SessionPane'
import { SettingsPane } from './SettingsPane'
import { Toasts, toast } from './Toast'

type Dim = 'agents' | 'projects' | 'settings'

function applyScheme(scheme: AppearanceScheme): void {
  document.documentElement.dataset.scheme = scheme
}

export function App(): JSX.Element {
  const [dim, setDim] = useState<Dim>('agents')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  // 会话页视图态(票 04):非空时项目详情区整块换成会话页;换项目即退出
  const [openSession, setOpenSession] = useState<string | null>(null)
  // 票 08:搜索命中直达——打开会话页时定位到第几条提问(1 起;null = 不定位)
  const [openFocusQ, setOpenFocusQ] = useState<number | null>(null)
  // 从会话页返回时回到「会话」分栏(原型:‹ 返回 <项目> · 会话),而非概览
  const [backToSessions, setBackToSessions] = useState(false)
  const [scheme, setScheme] = useState<AppearanceScheme>(DEFAULT_SCHEME)
  const selectProject = (p: string | null): void => {
    setSelected(p)
    setOpenSession(null)
    setOpenFocusQ(null)
    setBackToSessions(false)
  }

  useEffect(() => {
    applyScheme(DEFAULT_SCHEME)
    let alive = true
    void window.agentshed.getPrefs().then((p) => {
      if (!alive) return
      setScheme(p.scheme)
      applyScheme(p.scheme)
    })
    void window.agentshed.getSnapshot().then((s) => {
      if (alive) setSnap(s)
    })
    const off = window.agentshed.onSnapshot((s) => setSnap(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  async function refresh(): Promise<void> {
    if (refreshing) return
    setRefreshing(true)
    try {
      setSnap(await window.agentshed.refresh())
    } finally {
      setRefreshing(false)
    }
  }

  async function onScheme(s: AppearanceScheme): Promise<void> {
    // 先本地生效再落盘:无「仅设置页换肤」的中间态,失败则回读或 toast
    setScheme(s)
    applyScheme(s)
    try {
      const p = await window.agentshed.setScheme(s)
      setScheme(p.scheme)
      applyScheme(p.scheme)
    } catch (e) {
      toast('err', `保存外观失败:${String(e)}`)
    }
  }

  return (
    <div className={`app dim-${dim}`}>
      <nav className="rail">
        <button
          className={`ri ${dim === 'agents' ? 'on' : ''}`}
          title="Agents"
          onClick={() => setDim('agents')}
        >
          🤖
        </button>
        <button
          className={`ri ${dim === 'projects' ? 'on' : ''}`}
          title="Projects"
          onClick={() => setDim('projects')}
        >
          📁
        </button>
        <button
          className={`ri grfr ${refreshing ? 'busy' : ''}`}
          title="全局刷新"
          onClick={() => void refresh()}
        >
          ↻
        </button>
        <button
          className={`ri set ${dim === 'settings' ? 'on' : ''}`}
          title="设置"
          onClick={() => setDim('settings')}
        >
          ⚙️
        </button>
      </nav>
      <main className="stage">
        {dim === 'settings' ? (
          <SettingsPane scheme={scheme} onScheme={(s) => void onScheme(s)} />
        ) : dim === 'agents' ? (
          snap === null ? (
            <ScanningHint />
          ) : (
            <AgentsPane snap={snap} />
          )
        ) : snap === null ? (
          <ScanningHint />
        ) : (
          <ProjectsPane
            snap={snap}
            selected={selected}
            onSelect={selectProject}
            detail={
              selected && openSession ? (
                <SessionPane
                  file={openSession}
                  focusQ={openFocusQ}
                  projectName={snap.projects.find((p) => p.path === selected)?.name ?? selected}
                  now={snap.scannedAt}
                  onBack={() => {
                    setOpenSession(null)
                    setOpenFocusQ(null)
                    setBackToSessions(true)
                  }}
                  onOpenSession={(f) => {
                    setOpenSession(f)
                    setOpenFocusQ(null)
                  }}
                />
              ) : selected ? (
                <DetailPane
                  snap={snap}
                  path={selected}
                  initialTab={backToSessions ? 'sessions' : undefined}
                  onOpenSession={(f, q) => {
                    setOpenSession(f)
                    setOpenFocusQ(q ?? null)
                    setBackToSessions(false)
                  }}
                />
              ) : (
                <div className="empty">
                  <div className="big">👈</div>
                  <div>选择一个项目查看详情</div>
                </div>
              )
            }
          />
        )}
      </main>
      <Toasts />
    </div>
  )
}

function ScanningHint(): JSX.Element {
  return (
    <div className="empty">
      <div className="big">🛖</div>
      <div>正在扫描 Claude Code / Codex…(扫描完成前不显示空列表)</div>
    </div>
  )
}
