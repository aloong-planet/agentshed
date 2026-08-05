// 会话页(票 04):打开一个会话,列出全部真实提问——单行索引式,一次列全。
// 「不整读」是数据层的事(主进程按字节区间现读文本);这里拿到的 text 是全文,
// 单行省略是 CSS 显示层截断(spec D2a 推论),展开取整轮是本页的按需动作(票 05)。
import { Fragment, useEffect, useRef, useState } from 'react'
import type { SessionPage, SessionTurn } from '@shared/domain'
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

/** 轮内脚注的读取量:B 级精确显示(小轮次常在几百字节,进位会显得像整读) */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** 单轮取回的界面状态(票 05):就地展开,取哪轮读哪轮 */
type TurnState =
  | { s: 'loading' }
  | { s: 'rebuilding' }
  | { s: 'ready'; turn: SessionTurn; ms: number }
  | { s: 'error'; msg: string }

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
  /** 已展开的轮次(数组下标);默认 0 轮展开——预展开等于把「按需取」作废 */
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const [turns, setTurns] = useState<ReadonlyMap<number, TurnState>>(new Map())
  // 换会话后仍在飞的取回不得落进新会话的状态里
  const fileRef = useRef(file)
  fileRef.current = file

  useEffect(() => {
    let alive = true
    setPage(null)
    setErr(null)
    setOpen(new Set())
    setTurns(new Map())
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

  const setTurn = (i: number, st: TurnState): void => {
    setTurns((m) => {
      const n = new Map(m)
      n.set(i, st)
      return n
    })
  }

  const fetchTurn = async (i: number): Promise<void> => {
    const f = file
    setTurn(i, { s: 'loading' })
    try {
      // 先问一句"索引还新鲜吗":不新鲜就亮出"重建中"——用户看到的是过程,不是干等
      const fresh = await window.agentshed.sessionFresh(f)
      if (fileRef.current !== f) return
      if (!fresh) setTurn(i, { s: 'rebuilding' })
      const t0 = performance.now()
      const turn = await window.agentshed.getSessionTurn({ file: f, i })
      if (fileRef.current !== f) return
      setTurn(i, { s: 'ready', turn, ms: Math.max(1, Math.round(performance.now() - t0)) })
    } catch (e) {
      if (fileRef.current !== f) return
      // 单轮失败只自伤:该轮显示错误,不连累其余轮次、不拖垮整页
      setTurn(i, { s: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  const toggle = (i: number): void => {
    const was = open.has(i)
    setOpen((prev) => {
      const n = new Set(prev)
      if (was) n.delete(i)
      else n.add(i)
      return n
    })
    if (was) return
    const st = turns.get(i)
    // 已取回的直接展示(收起不丢);在飞的不重发
    if (st && st.s !== 'error') return
    void fetchTurn(i)
  }

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
              {page.questions.map((q, idx) => {
                const on = open.has(idx)
                const st = turns.get(idx)
                return (
                  <Fragment key={q.i}>
                    <div className={`q${on ? ' open' : ''}`} onClick={() => toggle(idx)}>
                      <i className="cv">{on ? '▾' : '▸'}</i>
                      <span className="idx">{String(q.i).padStart(2, '0')}</span>
                      <span className="txt">{q.text}</span>
                      <span className="c" style={q.tools === 0 ? { opacity: 0.45 } : undefined}>
                        {q.tools} 🔧
                      </span>
                      {q.subagents > 0 && <span className="c">{q.subagents} 🤖</span>}
                      <span className="tm">{fmtHM(q.at)}</span>
                    </div>
                    {on && (
                      <div className="turn">
                        {(!st || st.s === 'loading') && <div className="tnote">取回中…</div>}
                        {st?.s === 'rebuilding' && (
                          <div className="tnote">
                            索引签名不符(文件被追加或重写)→ 正在<b>只重建该文件</b>的索引…
                          </div>
                        )}
                        {st?.s === 'error' && <div className="tnote">这一轮取不回来:{st.msg}</div>}
                        {st?.s === 'ready' && (
                          <>
                            {st.turn.blocks.map((b, bi) => (
                              <div className="ans" key={bi}>
                                {b.body}
                              </div>
                            ))}
                            <div className="fetched">
                              ⚡ 按需取回 {st.ms} ms · 只读本轮区间 {fmtBytes(st.turn.bytesRead)}
                              ,与文件总大小无关
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
            <div className="note">
              主干只列人类提问,harness 噪声不进渲染;提问一次列全(文本按字节区间现读,
              与文件大小无关)。点提问就地展开该轮回答;工具调用与 subagent 过程是下一步功能。
            </div>
          </>
        )}
      </div>
    </div>
  )
}
