// The Memory section (spec: subagents-memory-plugin, sequences C/D).
// The global summary: a row expands its file list inline and clicking a file opens a drawer; contents do
// not enter the snapshot and are read on demand through the allow-listed channel (C8).
import { useEffect, useMemo, useState } from 'react'
import type { MemoryFileMeta, MemorySummaryEntry, ProjectDetail, Snapshot } from '@shared/domain'
import { renderMarkdown } from './md'
import { dirOf, handleMdClick } from './md-links'
import { toast } from './Toast'
import { fmtAgo } from './ProjectsPane'
import { errorText } from '@shared/error-text'
import { appError } from '@shared/errors'
import { useLanguage, useDict } from './language'

/** C6's three states: not enabled → how to enable it; enabled but empty → nothing yet; has content → an
 * entry row (in the list) */
function CodexMemoryNote({ snap }: { snap: Snapshot }): JSX.Element | null {
  const t = useDict()
  const hasRow = snap.global.memory.some((m) => m.side === 'codex')
  if (hasRow) {
    return snap.global.codexMemoriesEnabled ? null : (
      <div className="none" style={{ textAlign: 'left', padding: '4px 2px' }}>
        {t.memory.codexLegacy}
      </div>
    )
  }
  return (
    <div className="none" style={{ textAlign: 'left', padding: '4px 2px' }}>
      {snap.global.codexMemoriesEnabled
        ? t.memory.codexEmpty
        : t.memory.codexDisabled}
    </div>
  )
}

export function GlobalMemoryTab({ snap }: { snap: Snapshot }): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  // The expansion key = side + project path: an expanded row does not shift when a snapshot refresh
  // reorders the list (review-code refactor item #4)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<{ entry: MemorySummaryEntry; file: MemoryFileMeta } | null>(null)
  if (snap.global.memory.length === 0)
    return (
      <div>
        <div className="none">{t.memory.noneGlobal}</div>
        <CodexMemoryNote snap={snap} />
      </div>
    )

  function toggle(key: string): void {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }

  return (
    <div>
      <div className="grp-t">{t.memory.globalHint}</div>
      <div className="card">
        {snap.global.memory.map((m) => {
          const key = `${m.side}-${m.projectPath ?? 'codex'}`
          return (
          <div key={key}>
            <button className="it row-btn" onClick={() => toggle(key)}>
              <span className="nm mono">{m.projectName ?? t.placeholder.codexGlobalMemory}</span>
              <span className={`badge ${m.side === 'claude' ? 'cl' : 'cx'}`}>
                {m.side === 'claude' ? 'CC' : 'CX'}
              </span>
              {m.stale && <span className="pill warn">{t.memory.stale}</span>}
              <span className="ds">
                {m.side === 'codex'
                  ? t.memory.codexGlobalDir
                  : m.hasMain
                    ? 'MEMORY.md'
                    : t.memory.noMainFile}{' '}
                ·{' '}
                {m.files.filter((f) => f.name !== 'MEMORY.md').length} topic
              </span>
              <span className="src mono">{fmtAgo(lang, m.lastModified, snap.scannedAt)}</span>
            </button>
            {expanded.has(key) && (
              <div className="sub-list">
                {m.files.map((f) => (
                  <button className="it row-btn" key={f.file} onClick={() => setOpen({ entry: m, file: f })}>
                    <span className="nm mono" style={{ flex: 1 }}>
                      {f.name}
                    </span>
                    <span className="src mono">{fmtAgo(lang, f.mtimeMs, snap.scannedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>
      <CodexMemoryNote snap={snap} />
      {open && (
        <MemoryFileDrawer
          title={open.file.name}
          meta={`${open.entry.projectName ?? t.placeholder.codexGlobalMemory} · ${fmtAgo(lang, open.file.mtimeMs, snap.scannedAt)}`}
          file={open.file.file}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** The detail page's Memory tab: MEMORY.md's body is rendered directly (the same pattern as the
 * Configuration tab) and topics open in a drawer (sequence D) */
export function ProjectMemoryTab({
  detail,
  hasClaudeSide,
  anchor
}: {
  detail: ProjectDetail
  hasClaudeSide: boolean
  anchor: number
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [open, setOpen] = useState<MemoryFileMeta | null>(null)
  const html = useMemo(
    () =>
      detail.memory.main === null
        ? null
        : renderMarkdown(
            detail.memory.main.truncated
              ? `${detail.memory.main.text}\n${t.placeholder.truncated}`
              : detail.memory.main.text
          ),
    [detail]
  )
  // The main file and topics share a directory; the topic paths are that directory's readable list
  const mainDir = detail.memory.topics[0] ? dirOf(detail.memory.topics[0].file) : ''
  if (detail.memory.main === null && detail.memory.topics.length === 0) {
    return (
      <div className="none">
        {hasClaudeSide
          ? t.memory.noneProject
          : t.memory.claudeOnly}
      </div>
    )
  }
  return (
    <div>
      <div className="grp-t">{t.memory.mainTitle}</div>
      {html === null ? (
        <div className="none">{t.memory.noMain}</div>
      ) : (
        <div
          className="md"
          onClick={(e) =>
            handleMdClick(
              e,
              { baseDir: mainDir, readable: detail.memory.topics.map((t) => t.file) },
              {
                internal: (file) => {
                  const t = detail.memory.topics.find((x) => x.file === file)
                  if (t) setOpen(t)
                },
                unresolved: (code) => toast('err', errorText(lang, appError(code)))
              }
            )
          }
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <div className="grp-t">{t.memory.topicsTitle(detail.memory.topics.length)}</div>
      {detail.memory.topics.length === 0 ? (
        <div className="none">{t.memory.noTopics}</div>
      ) : (
        <div className="card">
          {detail.memory.topics.map((t) => (
            <button className="it row-btn" key={t.file} onClick={() => setOpen(t)}>
              <span className="nm mono" style={{ flex: 1 }}>
                {t.name}
              </span>
              <span className="src mono">{fmtAgo(lang, t.mtimeMs, anchor)}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <MemoryFileDrawer
          title={open.name}
          meta={t.memory.topicMeta(fmtAgo(lang, open.mtimeMs, anchor))}
          file={open.file}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** The file contents drawer: read on demand through the allow-listed channel; a read failure reports
 * inside the drawer without crashing (C8) */
export function MemoryFileDrawer({
  title,
  meta,
  file,
  onClose
}: {
  title: string
  meta: string
  file: string
  onClose: () => void
}): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  const [content, setContent] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    let alive = true
    window.agentshed
      .readArtifact(file)
      .then((raw) => {
        if (alive) setContent(raw.truncated ? `${raw.text}\n${t.placeholder.truncated}` : raw.text)
      })
      .catch((e: unknown) => {
        if (alive) setErr(t.memory.unreadable(errorText(lang, e)))
      })
    return () => {
      alive = false
    }
  }, [file])
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="drawer">
        <h2 className="mono">{title}</h2>
        <div className="meta">{meta}</div>
        {err !== null ? (
          <div className="none">{err}</div>
        ) : content === null ? (
          <div className="none">{t.memory.loading}</div>
        ) : (
          <div className="raw mono">{content}</div>
        )}
      </div>
    </>
  )
}
