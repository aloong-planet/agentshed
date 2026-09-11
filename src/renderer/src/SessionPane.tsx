// The session page (ticket 04): open a session and list every real question — single-line index style,
// all at once.
// "Never read whole" is the data layer's business (the main process reads text live by byte range); the
// text arriving here is the full text,
// the single-line ellipsis is CSS display-layer truncation (a corollary of spec D2a), and expanding to
// fetch a whole turn is this page's on-demand action (ticket 05).
// The organising layer (ticket 06): day grouping with collapse + ascending/descending + the three tiers
// of banner at the top.
import { Fragment, useEffect, useRef, useState } from 'react'
import { SIDE_BADGE, SIDE_FULL_NAME } from './side-badge'
import type { SessionPage, SessionTurn } from '@shared/domain'
import { fmtAgo } from './ProjectsPane'
import { fmtTok } from './TokenViz'
import { dayGroups, groupable, type QuestionOrder } from './question-groups'
import { BlockView } from './TurnBlocks'
import { errorText } from '@shared/error-text'
import { useDict, useLanguage } from './language'
import { RichText } from './RichText'
import { formatBytes } from '@shared/format'
import { Bot, ChevronLeft, ChevronRight, GitFork, Terminal } from './icons'


function fmtHM(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}


/** A single turn's fetch state in the UI (ticket 05): expanded in place, reading only the turn clicked */
type TurnState =
  | { s: 'loading' }
  | { s: 'rebuilding' }
  | { s: 'ready'; turn: SessionTurn; ms: number }
  // Held as the **raw error** rather than a finished sentence: composition happens at render time,
  // so after a language switch the same error re-renders in the new language (the spec's "switching
  // languages" section)
  | { s: 'error'; raw: unknown }

/** The three tiers of top banner (ticket 06): two info kinds and one risk kind; the copy follows what the
 * data actually says and offers no false certainty */
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
        <span className="bi">
          <GitFork size={12} />
        </span>
        <span>
          <RichText text={t.session.forkPoints(page.forkPoints)} />
        </span>
      </div>
    )
  }
  if (page.side === 'codex' && page.forkState === 'stripped') {
    return (
      <div className="banner info">
        <span className="bi">
          <GitFork size={12} />
        </span>
        <span>
          {t.session.forkedFrom}{' '}
          {page.forkParentFile !== null && onOpenSession ? (
            <a onClick={() => onOpenSession(page.forkParentFile as string)}>
              {t.session.parentTitle(page.forkParentTitle ?? t.session.anotherSession)}
            </a>
          ) : (
            <>{t.session.parentTitle(page.forkParentTitle ?? t.session.anotherSession)}</>
          )}
          <RichText text={t.session.forkedFromTail} />
        </span>
      </div>
    )
  }
  if (page.side === 'codex' && page.forkState === 'uncertain') {
    return (
      <div className="banner risk">
        <span className="bi">
          <GitFork size={12} />
        </span>
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
  /** Going straight to a search hit (ticket 08): after loading, scroll to the question row with that
   * index; null or omitted means no locating */
  focusQ?: number | null
  projectName: string
  /** The baseline for relative times (the snapshot time, sharing its source with the list) */
  now: number
  onBack: () => void
  /** The banner's jump to the parent session (App switches session); without it the parent title is
   * plain text */
  onOpenSession?: (file: string) => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [page, setPage] = useState<SessionPage | null>(null)
  // As above: store the raw error and compose the sentence at render time
  const [err, setErr] = useState<{ raw: unknown } | null>(null)
  /** The expanded turns (array indices); 0 expanded by default — pre-expanding would defeat "fetch on
   * demand" */
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const [turns, setTurns] = useState<ReadonlyMap<number, TurnState>>(new Map())
  /** The question sort (ticket 06): descending by default (the user's ruling 2026-08-06, newest question
   * first);
   * the index is always the original turn number, and the sort only changes the presentation order */
  const [order, setOrder] = useState<QuestionOrder>('desc')
  /** The collapsed day groups (keyed by group label); expansion state is independent of it — a turn
   * already expanded is still expanded when the day is reopened */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  /** The locating focus (ticket 08, prototype confirmed 2026-08-06): the row a search jumped to, whose
   * bar stays until any row is clicked */
  const [focused, setFocused] = useState<number | null>(null)
  /** Whether the pulse has finished playing: once it has, only the bar remains — a remount such as a sort
   * change must not flash for another 10s */
  const [pulseDone, setPulseDone] = useState(false)
  // A fetch still in flight after switching session must not land in the new session's state
  const fileRef = useRef(file)
  fileRef.current = file

  useEffect(() => {
    setFocused(focusQ ?? null)
    setPulseDone(false)
    // focusQ is a dependency: clicking another hit within the same session page (file unchanged) must
    // relocate too
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
      // Ask "is the index still fresh" first: if not, show "rebuilding" — the user sees a process rather
      // than a blank wait
      const fresh = await window.agentshed.sessionFresh(f)
      if (fileRef.current !== f) return
      if (!fresh) setTurn(i, { s: 'rebuilding' })
      const t0 = performance.now()
      const turn = await window.agentshed.getSessionTurn({ file: f, i })
      if (fileRef.current !== f) return
      setTurn(i, { s: 'ready', turn, ms: Math.max(1, Math.round(performance.now() - t0)) })
    } catch (e) {
      if (fileRef.current !== f) return
      // A single turn's failure only hurts itself: that turn shows an error without affecting the others
      // or dragging down the page
      setTurn(i, { s: 'error', raw: e })
    }
  }

  const toggle = (i: number): void => {
    // Clicking any question row counts as attention moving on: clear the locating bar (the clearing
    // moment confirmed by the prototype)
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
    // Already fetched turns are shown directly (collapsing does not lose them); in-flight ones are not
    // re-sent
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
                  // Going straight to a search hit: scroll to the row after mounting
                  el?.scrollIntoView({ block: 'center' })
                }
              : undefined
          }
        >
          <i className="cv">
            <ChevronRight size={10} />
          </i>
          <span className="idx">{String(q.i).padStart(2, '0')}</span>
          <span className="txt">{q.text}</span>
          <span className="c" style={q.tools === 0 ? { opacity: 0.45 } : undefined}>
            {q.tools} <Terminal size={11} />
          </span>
          {q.subagents > 0 && (
            <span className="c">
              {q.subagents} <Bot size={11} />
            </span>
          )}
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
                  {t.session.fetchedNote(st.ms, formatBytes(lang, st.turn.bytesRead))}
                </div>
              </>
            )}
          </div>
        )}
      </Fragment>
    )
  }

  const grouped = page !== null && groupable(page.questions)
  const groups = page !== null && grouped ? dayGroups(lang, page.questions, order) : []

  return (
    <div className="pane">
      <header className="pane-head">
        <button className="sback" onClick={onBack}>
          <ChevronLeft size={12} />
          {t.session.back(projectName)}
        </button>
        {page && (
          <>
            <div className="det-title">
              <span className={`badge ${SIDE_BADGE[page.side].cls}`}>{SIDE_BADGE[page.side].label}</span>
              <h1 className="stitle">{page.title}</h1>
            </div>
            <div className="smeta">
              {t.session.headMeta(
                SIDE_FULL_NAME[page.side],
                page.questions.length,
                fmtTok(page.tokens),
                formatBytes(lang, page.bytes),
                fmtAgo(lang, page.at, now)
              )}
            </div>
          </>
        )}
      </header>
      <div className="pane-body">
        {err !== null ? (
          <div className="none">{t.session.cannotOpen(errorText(lang, err.raw))}</div>
        ) : page === null ? null : ( // While the page loads nothing is drawn: a transient label here only flickered on a session switch (removed 2026-09-11 at the user's ruling)
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
                          <i className="cv">
                            <ChevronRight size={9} />
                          </i>
                          {t.session.dayGroup(g.day, g.items.length)}
                        </div>
                        {/* Collapsing only hides the presentation: expansion and fetch state are kept
                            as they were, so reopening the day still shows it expanded */}
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
