// 会话页(票 04):打开一个会话,列出全部真实提问——单行索引式,一次列全。
// 「不整读」是数据层的事(主进程按字节区间现读文本);这里拿到的 text 是全文,
// 单行省略是 CSS 显示层截断(spec D2a 推论),展开取整轮是下一票(05)的事。
import { useEffect, useState } from 'react'
import type { SessionPage } from '@shared/domain'
import { fmtAgo } from './ProjectsPane'
import { fmtTok } from './TokenViz'

function fmtMB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtHM(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function SessionPane({
  file,
  projectName,
  now,
  onBack
}: {
  file: string
  projectName: string
  /** 相对时间的基准(快照时间,与列表同源) */
  now: number
  onBack: () => void
}): JSX.Element {
  const [page, setPage] = useState<SessionPage | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPage(null)
    setErr(null)
    window.agentshed.getSessionPage(file).then(
      (p) => {
        if (alive) setPage(p)
      },
      (e: unknown) => {
        if (alive) setErr(e instanceof Error ? e.message : String(e))
      }
    )
    return () => {
      alive = false
    }
  }, [file])

  return (
    <div className="pane">
      <header className="pane-head">
        <button className="sback" onClick={onBack}>
          ‹ 返回 {projectName} · 会话
        </button>
        {page && (
          <>
            <div className="det-title">
              <span className={`badge ${page.side === 'claude' ? 'cl' : 'cx'}`}>
                {page.side === 'claude' ? 'CC' : 'CX'}
              </span>
              <h1 className="stitle">{page.title}</h1>
            </div>
            <div className="smeta">
              {page.side === 'claude' ? 'Claude Code' : 'Codex'} · {page.questions.length} 提问 ·{' '}
              {fmtTok(page.tokens)} tok · {fmtMB(page.bytes)} · 最后活动 {fmtAgo(page.at, now)}
            </div>
          </>
        )}
      </header>
      <div className="pane-body">
        {err !== null ? (
          <div className="none">会话打不开:{err}</div>
        ) : page === null ? (
          <div className="none">读取中…</div>
        ) : (
          <>
            <div className="qbar">
              <span className="grp-t">提问(主干)· {page.questions.length} 条</span>
            </div>
            <div className="card qlist">
              {page.questions.map((q) => (
                <div className="q" key={q.i}>
                  <span className="idx">{String(q.i).padStart(2, '0')}</span>
                  <span className="txt">{q.text}</span>
                  <span className="c" style={q.tools === 0 ? { opacity: 0.45 } : undefined}>
                    {q.tools} 🔧
                  </span>
                  {q.subagents > 0 && <span className="c">{q.subagents} 🤖</span>}
                  <span className="tm">{fmtHM(q.at)}</span>
                </div>
              ))}
            </div>
            <div className="note">
              主干只列人类提问,harness 噪声不进渲染;提问一次列全(文本按字节区间现读,
              与文件大小无关)。点提问查看该轮回答与工具调用是下一步功能。
            </div>
          </>
        )}
      </div>
    </div>
  )
}
