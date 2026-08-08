// 会话页(票 04):打开一个会话,列出全部真实提问——单行索引式,一次列全。
// 「不整读」是数据层的事(主进程按字节区间现读文本);这里拿到的 text 是全文,
// 单行省略是 CSS 显示层截断(spec D2a 推论),展开取整轮是本页的按需动作(票 05)。
// 组织层(票 06):日期分组折叠 + 正序/倒序 + 顶部三档横幅。
import { Fragment, useEffect, useRef, useState } from 'react'
import type { SessionPage, SessionTurn } from '@shared/domain'
import { fmtAgo } from './ProjectsPane'
import { fmtTok } from './TokenViz'
import { dayGroups, groupable, type QuestionOrder } from './question-groups'
import { BlockView } from './TurnBlocks'
import { errorText } from '@shared/error-text'
import { useDict, useLanguage } from './language'
import { RichText } from './RichText'

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
  // 以**原始错误**持有而不是已成句的字符串:成句发生在渲染时,
  // 语言切换后同一个错误会按新语言重新渲染(spec「切换语言」节)
  | { s: 'error'; raw: unknown }

/** 顶部横幅三档(票 06):info 两种、risk 一种;文案按数据实情写,不给假确定感 */
function Banners({
  page,
  onOpenSession
}: {
  page: SessionPage
  onOpenSession?: (file: string) => void
}): JSX.Element | null {
  const t = useDict()
  if (page.side === 'claude' && page.forkPoints > 0) {
    return (
      <div className="banner info">
        <span className="bi">⑂</span>
        <span>
          <RichText text={t.session.forkPoints(page.forkPoints)} />
        </span>
      </div>
    )
  }
  if (page.side === 'codex' && page.forkState === 'stripped') {
    return (
      <div className="banner info">
        <span className="bi">⑂</span>
        <span>
          {t.session.forkedFrom}{' '}
          {page.forkParentFile !== null && onOpenSession ? (
            <a onClick={() => onOpenSession(page.forkParentFile as string)}>
              《{page.forkParentTitle ?? t.session.anotherSession}》
            </a>
          ) : (
            <>《{page.forkParentTitle ?? t.session.anotherSession}》</>
          )}
          <RichText text={t.session.forkedFromTail} />
        </span>
      </div>
    )
  }
  if (page.side === 'codex' && page.forkState === 'uncertain') {
    return (
      <div className="banner risk">
        <span className="bi">⑂?</span>
        {page.forkParentFile === null ? (
          <span>
            <RichText text={t.session.stripUncertainOrphan} />
          </span>
        ) : (
          <span>
            <RichText
              text={t.session.stripUncertainMismatch(
                page.forkParentTitle ?? t.session.anotherSession
              )}
            />
          </span>
        )}
      </div>
    )
  }
  return null
}

export function SessionPane({
  file,
  focusQ,
  projectName,
  now,
  onBack,
  onOpenSession
}: {
  file: string
  /** 搜索命中直达(票 08):加载后滚动定位到该序号的提问行;null/未传不定位 */
  focusQ?: number | null
  projectName: string
  /** 相对时间的基准(快照时间,与列表同源) */
  now: number
  onBack: () => void
  /** 横幅里的父会话跳转(App 层换会话);不传则父标题为纯文本 */
  onOpenSession?: (file: string) => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [page, setPage] = useState<SessionPage | null>(null)
  // 同上:存原始错误,渲染时才成句
  const [err, setErr] = useState<{ raw: unknown } | null>(null)
  /** 已展开的轮次(数组下标);默认 0 轮展开——预展开等于把「按需取」作废 */
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const [turns, setTurns] = useState<ReadonlyMap<number, TurnState>>(new Map())
  /** 提问排序(票 06):默认倒序(2026-08-06 用户裁定,最新提问先见);
   * 序号恒原始轮次号,排序只换呈现顺序 */
  const [order, setOrder] = useState<QuestionOrder>('desc')
  /** 已折叠的日期组(键 = 组标签);展开状态与它独立——重开该天仍是展开的 */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  /** 定位焦点(票 08,2026-08-06 原型确认):搜索直达的行,竖条常驻到点击任意行 */
  const [focused, setFocused] = useState<number | null>(null)
  /** 脉冲是否已播完:播完只留竖条——切排序等重挂载时不得再闪一次 10s */
  const [pulseDone, setPulseDone] = useState(false)
  // 换会话后仍在飞的取回不得落进新会话的状态里
  const fileRef = useRef(file)
  fileRef.current = file

  useEffect(() => {
    setFocused(focusQ ?? null)
    setPulseDone(false)
    // 依赖含 focusQ:同一会话页内点另一条命中(file 不变)也要重新定位
  }, [file, focusQ])

  useEffect(() => {
    let alive = true
    setPage(null)
    setErr(null)
    setOpen(new Set())
    setTurns(new Map())
    setOrder('desc')
    setFolded(new Set())
    window.agentshed.getSessionPage(file).then(
      (p) => {
        if (alive) setPage(p)
      },
      (e: unknown) => {
        if (alive) setErr({ raw: e })
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
      setTurn(i, { s: 'error', raw: e })
    }
  }

  const toggle = (i: number): void => {
    // 点击任意提问行即视为注意力转移:清定位竖条(原型确认的清除时机)
    setFocused(null)
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

  const row = (q: SessionPage['questions'][number], idx: number): JSX.Element => {
    const on = open.has(idx)
    const st = turns.get(idx)
    return (
      <Fragment key={q.i}>
        <div
          className={`q${on ? ' open' : ''}${
            focused === q.i ? `${pulseDone ? '' : ' located'} focused` : ''
          }`}
          onClick={() => toggle(idx)}
          onAnimationEnd={focused === q.i ? (): void => setPulseDone(true) : undefined}
          ref={
            focusQ != null && q.i === focusQ
              ? (el): void => {
                  // 搜索直达:挂载后滚到该行
                  el?.scrollIntoView({ block: 'center' })
                }
              : undefined
          }
        >
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
            {(!st || st.s === 'loading') && <div className="tnote">{t.session.fetching}</div>}
            {st?.s === 'rebuilding' && (
              <div className="tnote">
                <RichText text={t.session.rebuilding} />
              </div>
            )}
            {st?.s === 'error' && (
              <div className="tnote">{t.session.turnFailed(errorText(lang, st.raw))}</div>
            )}
            {st?.s === 'ready' && (
              <>
                {st.turn.blocks.map((b, bi) => (
                  <BlockView b={b} key={bi} />
                ))}
                <div className="fetched">
                  {t.session.fetchedNote(st.ms, fmtBytes(st.turn.bytesRead))}
                </div>
              </>
            )}
          </div>
        )}
      </Fragment>
    )
  }

  const grouped = page !== null && groupable(page.questions)
  const groups = page !== null && grouped ? dayGroups(page.questions, order) : []

  return (
    <div className="pane">
      <header className="pane-head">
        <button className="sback" onClick={onBack}>
          {t.session.back(projectName)}
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
              {t.session.headMeta(
                page.side === 'claude' ? 'Claude Code' : 'Codex',
                page.questions.length,
                fmtTok(page.tokens),
                fmtMB(page.bytes),
                fmtAgo(page.at, now)
              )}
            </div>
          </>
        )}
      </header>
      <div className="pane-body">
        {err !== null ? (
          <div className="none">{t.session.cannotOpen(errorText(lang, err.raw))}</div>
        ) : page === null ? (
          <div className="none">{t.session.loading}</div>
        ) : (
          <>
            <Banners page={page} onOpenSession={onOpenSession} />
            <div className="qbar">
              <span className="grp-t">
                {t.session.mainline(
                  page.questions.length,
                  grouped ? t.session.dayCount(groups.length) : ''
                )}
              </span>
              <span className="qctl">
                {grouped && (
                  <span
                    className="lnk"
                    onClick={() =>
                      setFolded(
                        folded.size === groups.length
                          ? new Set()
                          : new Set(groups.map((g) => g.id))
                      )
                    }
                  >
                    {folded.size === groups.length ? t.session.expandAll : t.session.collapseAll}
                  </span>
                )}
                <span className="seg">
                  <button className={order === 'asc' ? 'on' : ''} onClick={() => setOrder('asc')}>
                    {t.session.ascending}
                  </button>
                  <button className={order === 'desc' ? 'on' : ''} onClick={() => setOrder('desc')}>
                    {t.session.descending}
                  </button>
                </span>
              </span>
            </div>
            <div className="card qlist">
              {grouped
                ? groups.map((g) => {
                    const isFolded = folded.has(g.id)
                    return (
                      <div className={`daygrp${isFolded ? ' fold' : ''}`} key={g.id}>
                        <div
                          className="dayhd"
                          onClick={() =>
                            setFolded((prev) => {
                              const n = new Set(prev)
                              if (n.has(g.id)) n.delete(g.id)
                              else n.add(g.id)
                              return n
                            })
                          }
                        >
                          <i className="cv" />
                          {t.session.dayGroup(g.day, g.items.length)}
                        </div>
                        {/* 折叠只藏呈现:展开/取回状态原样保留,重开该天仍是展开的 */}
                        {!isFolded && g.items.map(({ q, idx }) => row(q, idx))}
                      </div>
                    )
                  })
                : (order === 'asc'
                    ? page.questions.map((q, idx) => ({ q, idx }))
                    : page.questions.map((q, idx) => ({ q, idx })).reverse()
                  ).map(({ q, idx }) => row(q, idx))}
            </div>
            <div className="note">
              {t.session.foot}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
