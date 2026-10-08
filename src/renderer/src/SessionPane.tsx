import { StartupHint } from './StartupHint'
// The session page (ticket 04): open a session and list every real question — single-line index style,
// all at once.
// "Never read whole" is the data layer's business (the main process reads text live by byte range); the
// text arriving here is the full text,
// the single-line ellipsis is CSS display-layer truncation (a corollary of spec D2a), and expanding to
// fetch a whole turn is this page's on-demand action (ticket 05).
// The organising layer (ticket 06): day grouping with collapse + ascending/descending + the three tiers
// of banner at the top.
import { Fragment, useEffect, useState } from 'react'
import { SIDE_BADGE, SIDE_FULL_NAME } from './side-badge'
import type { SessionPage } from '@shared/domain'
import { fmtAgo } from './ProjectsPane'
import { fmtTok } from './TokenViz'
import { dayGroups, groupable, type QuestionOrder } from './question-groups'
import { BlockView } from './TurnBlocks'
import { errorText } from '@shared/error-text'
import { useDict, useLanguage } from './language'
import { RichText } from './RichText'
import { formatBytes } from '@shared/format'
import { Bot, ChevronLeft, ChevronRight, GitFork, Terminal } from './icons'
import { useSessionPageQuery } from './session-page-query'
import { useTurnContentQuery } from './turn-content-query'


function fmtHM(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}


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
  /** The baseline for relative times (the display clock, sharing its source with the list) */
  now: number
  onBack: () => void
  /** The banner's jump to the parent session (App switches session); without it the parent title is
   * plain text */
  onOpenSession?: (file: string) => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const result = useSessionPageQuery(file)

  return (
    <div className="pane">
      <header className="pane-head">
        <button className="sback" onClick={onBack}>
          <ChevronLeft size={12} />
          {t.session.back(projectName)}
        </button>
        {result.ok && (
          <>
            <div className="det-title">
              <span className={`badge ${SIDE_BADGE[result.page.side].cls}`}>
                {SIDE_BADGE[result.page.side].label}
              </span>
              <h1 className="stitle">{result.page.title}</h1>
              <StartupHint />
            </div>
            <div className="smeta">
              {t.session.headMeta(
                SIDE_FULL_NAME[result.page.side],
                result.page.questions.length,
                fmtTok(result.page.tokens),
                formatBytes(lang, result.page.bytes),
                fmtAgo(lang, result.page.at, now)
              )}
            </div>
          </>
        )}
      </header>
      <div className="pane-body">
        {result.ok ? (
          // Keyed by the session file (session-view P4): page-local state (expanded turns, sort,
          // folded days, the locating focus) starts fresh per session and survives a transfusion of
          // the same session (P5 — an automatic rescan refreshing an open page).
          <SessionPageBody key={result.page.file} page={result.page} focusQ={focusQ} onOpenSession={onOpenSession} />
        ) : (
          <div className="none">{t.session.cannotOpen(errorText(lang, result.error))}</div>
        )}
      </div>
    </div>
  )
}

/**
 * A single expanded turn (session-view sequence C, ADR-0028): mounted only while its question row is
 * open, so mounting *is* "fetch on demand" and unmounting is what "collapsing does not lose it" now
 * rests on — the query cache, not local state, is what makes reopening an already-fetched turn
 * instant. `rebuilding` is a plain local flag, reset by the remount on every reopen, set as a side
 * effect the moment the freshness check (inside the query) reports stale.
 */
function TurnContent({ file, i, revision }: { file: string; i: number; revision?: string }): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [rebuilding, setRebuilding] = useState(false)
  const { data } = useTurnContentQuery(file, i, () => setRebuilding(true), revision)

  return (
    <div className="turn">
      {data === undefined && !rebuilding && <div className="tnote">{t.session.fetching}</div>}
      {data === undefined && rebuilding && (
        <div className="tnote">
          <RichText text={t.session.rebuilding} />
        </div>
      )}
      {data?.ok === false && (
        <div className="tnote">{t.session.turnFailed(errorText(lang, data.error))}</div>
      )}
      {data?.ok && (
        <>
          {data.turn.blocks.map((b, bi) => (
            <BlockView b={b} key={bi} />
          ))}
          <div className="fetched">
            {t.session.fetchedNote(data.ms, formatBytes(lang, data.turn.bytesRead))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The question list (session-view sequence C, P4): fetches through the query layer above it for the
 * page itself; each expanded turn's content is TurnContent's own query.
 */
function SessionPageBody({
  page,
  focusQ,
  onOpenSession
}: {
  page: SessionPage
  /** Going straight to a search hit (ticket 08): after mounting, scroll to the question row with that
   * index; null or omitted means no locating */
  focusQ?: number | null
  /** The banner's jump to the parent session (App switches session); without it the parent title is
   * plain text */
  onOpenSession?: (file: string) => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  /** The expanded turns (array indices); 0 expanded by default — pre-expanding would defeat "fetch on
   * demand" */
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  /** The question sort (ticket 06): descending by default (the user's ruling 2026-08-06, newest question
   * first);
   * the index is always the original turn number, and the sort only changes the presentation order */
  const [order, setOrder] = useState<QuestionOrder>('desc')
  /** The collapsed day groups (keyed by group label); expansion state is independent of it — a turn
   * already expanded is still expanded when the day is reopened */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  /** The locating focus (ticket 08, prototype confirmed 2026-08-06): the row a search jumped to, whose
   * bar stays until any row is clicked. Initialised from the prop directly — this component remounts
   * per session (keyed by file), so the initial render already has the right value. */
  const [focused, setFocused] = useState<number | null>(focusQ ?? null)
  /** Whether the pulse has finished playing: once it has, only the bar remains — a remount such as a sort
   * change must not flash for another 10s */
  const [pulseDone, setPulseDone] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see #198
    setFocused(focusQ ?? null)
    setPulseDone(false)
    // Clicking another hit within the same session page (this component does not remount) must
    // relocate too; a session change instead remounts the whole component (keyed by file above).
  }, [focusQ])

  const toggle = (i: number): void => {
    // Clicking any question row counts as attention moving on: clear the locating bar (the clearing
    // moment confirmed by the prototype)
    setFocused(null)
    setOpen((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
    // The fetch itself is driven by TurnContent mounting below (only rendered while a row is open),
    // not by this handler: collapsing unmounts it and reopening remounts it, and the query cache is
    // what makes an already-fetched turn instant on reopen and a previously-failed one retry.
  }

  const row = (q: SessionPage['questions'][number], idx: number): JSX.Element => {
    const on = open.has(idx)
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
        {on && <TurnContent key={q.revision} file={page.file} i={idx} revision={q.revision} />}
      </Fragment>
    )
  }

  const grouped = groupable(page.questions)
  const groups = grouped ? dayGroups(lang, page.questions, order) : []

  return (
    <>
      <Banners page={page} onOpenSession={onOpenSession} />
      <div className="qbar">
        <span className="grp-t">
          {t.session.mainline(page.questions.length, grouped ? t.session.dayCount(groups.length) : '')}
        </span>
        <span className="qctl">
          {grouped && (
            <span
              className="lnk"
              onClick={() =>
                setFolded(folded.size === groups.length ? new Set() : new Set(groups.map((g) => g.id)))
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
      <div className="note">{t.session.foot}</div>
    </>
  )
}
