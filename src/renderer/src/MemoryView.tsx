import { useDisplayClock } from './DisplayClock'
import { useArtifactContentQuery } from './artifact-content-query'
// The Memory section (spec: subagents-memory-plugin, sequences C/D).
// The global summary: a row expands its file list inline and clicking a file opens a drawer; contents do
// not enter the snapshot and are read on demand through the allow-listed channel (C8).
import { useState } from 'react'
import type { AgentSide, MemoryFileMeta, MemorySummaryEntry, ProjectDetail, Snapshot } from '@shared/domain'
import { MarkdownBody } from './MarkdownBody'
import { FileDrawer } from './FileDrawer'
import { dirOf } from './md-links'
import { toast } from './Toast'
import { fmtAgo } from './ProjectsPane'
import { errorText } from '@shared/error-text'
import { appError } from '@shared/errors'
import { useLanguage, useDict } from './language'
import { SIDE_BADGE, SIDE_SHORT_NAME } from './side-badge'

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
  const now = useDisplayClock()
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
              <span className={`badge ${SIDE_BADGE[m.side].cls}`}>
                {SIDE_BADGE[m.side].label}
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
              <span className="src mono">{fmtAgo(lang, m.lastModified, now)}</span>
            </button>
            {expanded.has(key) && (
              <div className="sub-list">
                {m.files.map((f) => (
                  <button className="it row-btn" key={f.file} onClick={() => setOpen({ entry: m, file: f })}>
                    <span className="nm mono" style={{ flex: 1 }}>
                      {f.name}
                    </span>
                    <span className="src mono">{fmtAgo(lang, f.mtimeMs, now)}</span>
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
          owner={open.entry.projectName ?? t.placeholder.codexGlobalMemory}
          side={open.entry.side}
          file={open.file}
          files={open.entry.files}
          now={now}
          onOpenFile={(f) => setOpen({ entry: open.entry, file: f })}
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
  projectName,
  hasClaudeSide,
  anchor
}: {
  detail: ProjectDetail
  projectName: string
  hasClaudeSide: boolean
  anchor: number
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [open, setOpen] = useState<MemoryFileMeta | null>(null)
  const mainText =
    detail.memory.main === null
      ? null
      : detail.memory.main.truncated
        ? `${detail.memory.main.text}\n${t.placeholder.truncated}`
        : detail.memory.main.text
  // The main file and topics share a directory: together they are its readable list, for the main file's links
  // and for the drawer's
  const dirFiles = [...(detail.memory.mainFile ? [detail.memory.mainFile] : []), ...detail.memory.topics]
  const mainDir = dirFiles[0] ? dirOf(dirFiles[0].file) : ''
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
      {mainText === null ? (
        <div className="none">{t.memory.noMain}</div>
      ) : (
        <MarkdownBody
          className="md"
          text={mainText}
          links={{
            baseDir: mainDir,
            readable: dirFiles.map((f) => f.file),
            onInternal: (file) => {
              const f = dirFiles.find((x) => x.file === file)
              if (f) setOpen(f)
            },
            onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
          }}
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
          owner={projectName}
          side="claude"
          file={open}
          files={dirFiles}
          now={anchor}
          onOpenFile={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** A memory file in the shared file drawer (spec memory-view::US-001): the memory's owner over side · file ·
 * modification time, read on demand through the allow-listed channel (a read failure reports inside the drawer
 * without crashing, C8); a link to another file of the same directory switches the drawer to it */
export function MemoryFileDrawer({
  owner,
  side,
  file,
  files,
  now,
  onOpenFile,
  onClose
}: {
  owner: string
  side: AgentSide
  file: MemoryFileMeta
  /** The directory's listed files — the readable set for relative links (fail-closed beyond it) */
  files: MemoryFileMeta[]
  now: number
  onOpenFile: (f: MemoryFileMeta) => void
  onClose: () => void
}): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  const { data } = useArtifactContentQuery(file.file)
  const text = data?.ok ? (data.text.truncated ? `${data.text.text}\n${t.placeholder.truncated}` : data.text.text) : null
  const err = data?.ok === false ? t.memory.unreadable(errorText(lang, data.error)) : null
  return (
    <FileDrawer
      title={owner}
      meta={`${SIDE_SHORT_NAME[side]} · ${file.name} · ${fmtAgo(lang, file.mtimeMs, now)}`}
      fileName={file.name}
      fileKey={file.file}
      text={text}
      error={err}
      loadingText={t.memory.loading}
      links={{
        baseDir: dirOf(file.file),
        readable: files.map((f) => f.file),
        onInternal: (target) => {
          const f = files.find((x) => x.file === target)
          if (f) onOpenFile(f)
        },
        onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
      }}
      onClose={onClose}
    />
  )
}
