import { useEffect, useState } from 'react'
import type { Snapshot } from '@shared/domain'
import { ProjectsPane } from './ProjectsPane'
import { AgentsPane } from './AgentsPane'

type Dim = 'agents' | 'projects'

export function App(): JSX.Element {
  const [dim, setDim] = useState<Dim>('agents')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
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

  return (
    <div className="app">
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
      </nav>
      <main className="stage">
        {dim === 'agents' ? (
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
            onSelect={setSelected}
            detail={
              <div className="empty">
                <div className="big">👈</div>
                <div>{selected ? `已选中 ${selected}(详情:票 03)` : '选择一个项目查看详情'}</div>
              </div>
            }
          />
        )}
      </main>
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
