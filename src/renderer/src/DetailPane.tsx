import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownBody } from './MarkdownBody'
import type { ArtifactEntry, ArtifactType, ProjectDetail, ProjectSkillEntry, Snapshot, SearchResult } from '@shared/domain'
import { ARTIFACT_ORDER, PROJECT_SKILLS_DIR, emptyTokenStats } from '@shared/domain'
import { SIDE_BADGE } from './side-badge'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'
import { ProjectSubagentsTab } from './SubagentsView'
import { ProjectMemoryTab } from './MemoryView'
import { dirOf } from './md-links'
import { ProjectPluginsTab } from './PluginsView'
import { fmtAgo } from './ProjectsPane'
import { toast } from './Toast'
import { SkillExpandBlock } from './SkillExpandBlock'
import { SkillSearch } from './SkillSearch'
import { filterByName } from './skill-filter'
import { errorText } from '@shared/error-text'
import { appError } from '@shared/errors'
import { useLanguage, useDict } from './language'
import { GitFork } from './icons'

type Tab = 'ov' | 'skills' | 'subagents' | 'plugins' | 'mcp' | 'memory' | 'sessions' | 'cfg' | 'arts'

export function DetailPane({
  snap,
  path,
  initialTab,
  onOpenSession
}: {
  snap: Snapshot
  path: string
  /** Returning from a session page lands on the "Sessions" section (the prototype's rule); normally not
   * passed, landing on the overview */
  initialTab?: Tab
  /** Open a session page (ticket 04; since ticket 08 it can carry focusQ to go straight to a question) */
  onOpenSession: (file: string, focusQ?: number) => void
}): JSX.Element {
  const t = useDict()
  const [tab, setTab] = useState<Tab>(initialTab ?? 'ov')
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [reload, setReload] = useState(0)
  const entry = snap.projects.find((p) => p.path === path)

  // Transfusion updates (project-detail A3): the loading state appears only when switching project; a
  // snapshot update (manual refresh / automatic refresh)
  // and a partial refresh silently replace the rendered content, so a section's local state (expansion,
  // search, scroll) survives the refresh
  useEffect(() => {
    setDetail(null)
  }, [path])
  useEffect(() => {
    let alive = true
    void window.agentshed.getProjectDetail(path).then((d) => {
      if (alive) setDetail(d)
    })
    return () => {
      alive = false
    }
  }, [path, snap.scannedAt, reload])

  if (!entry) return <div className="empty">{t.detail.notInSnapshot}</div>

  return (
    <div className="pane">
      <header className="pane-head">
        <div className="det-title">
          <h1>{entry.name}</h1>
          {entry.sides.includes('claude') && <span className="badge cl">CLAUDE</span>}
          {entry.sides.includes('codex') && <span className="badge cx">CODEX</span>}
          {entry.stale && <span className="stale-tag">{t.detail.staleTag}</span>}
        </div>
        <div className="det-path mono">{entry.path}</div>
        <nav className="tabs">
          {(
            [
              ['ov', t.detail.tabOverview],
              ['skills', 'Skills'],
              ['subagents', 'Subagents'],
              ['plugins', 'Plugins'],
              ['mcp', 'MCP'],
              ['memory', 'Memory'],
              ['sessions', t.detail.tabSessions],
              ['cfg', t.detail.tabCfg],
              ['arts', t.detail.tabArts]
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="pane-body">
        {detail === null ? (
          <div className="none">{t.detail.loading}</div>
        ) : (
          <>
            {tab === 'ov' && (
              <OverviewTab detail={detail} snap={snap} onOpenSession={onOpenSession} />
            )}
            {tab === 'skills' && (
              // Keyed by project so switching to another one is a **different** section rather than the
              // same one handed new data: the filter keyword belongs to the list being looked at, and
              // carrying it across would filter the new project's skills by a word typed for the old
              // one — a populated project then looks empty, with the box scrolled out of view.
              //
              // A refresh of the *same* project keeps the key, so the keyword survives that, which is
              // the intended asymmetry (a refresh is not a change of subject).
              <SkillsTab
                key={detail.path}
                detail={detail}
                onChanged={() => setReload((v) => v + 1)}
              />
            )}
            {tab === 'subagents' && <ProjectSubagentsTab detail={detail} />}
            {tab === 'plugins' && <ProjectPluginsTab detail={detail} snap={snap} />}
            {tab === 'mcp' && <McpTab detail={detail} />}
            {tab === 'memory' && (
              <ProjectMemoryTab
                detail={detail}
                hasClaudeSide={entry.sides.includes('claude')}
                anchor={snap.scannedAt}
              />
            )}
            {tab === 'sessions' && <SessionsTab detail={detail} snap={snap} onOpenSession={onOpenSession} />}
            {tab === 'cfg' && <CfgTab detail={detail} />}
            {tab === 'arts' && <ArtifactsTab detail={detail} snap={snap} />}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The overview shows only the most recent few; everything is in the "Sessions" section (a project can
 * have hundreds of sessions).
 * The 5 matches the confirmed prototype (the overview session card in docs/prototypes/project-detail),
 * not a number picked at random — changing it changes a confirmed UI, and the prototype must be updated
 * with it.
 */
const OVERVIEW_SESSIONS = 5

function OverviewTab({
  detail,
  snap,
  onOpenSession
}: {
  detail: ProjectDetail
  snap: Snapshot
  onOpenSession: (file: string) => void
}): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  const stats = detail.stats ?? { tokens: emptyTokenStats(), sessions: [] }
  return (
    <div>
      <TotalsCards stats={stats.tokens} />
      <TrendChart stats={stats.tokens} anchor={snap.scannedAt} archivedDays={snap.archivedDays} />
      <div className="grp-t">{t.detail.byModel}</div>
      <ModelBars stats={stats.tokens} />
      <div className="grp-t">{t.detail.recentSessions}</div>
      {stats.sessions.length === 0 ? (
        <div className="none">{t.detail.noSessions}</div>
      ) : (
        <>
          <div className="card">
            {stats.sessions.slice(0, OVERVIEW_SESSIONS).map((s) => (
              <button className="se row-btn" key={s.file} onClick={() => onOpenSession(s.file)}>
                <span className={`badge ${SIDE_BADGE[s.side].cls}`}>{SIDE_BADGE[s.side].label}</span>
                <span className="t">{s.title ?? t.placeholder.untitledSession}</span>
                <span className="tok">{fmtTok(s.tokens)}</span>
                <span className="d">{fmtAgo(lang, s.at, snap.scannedAt)}</span>
              </button>
            ))}
          </div>
          <div className="note">
            {t.detail.sessionCountNote(stats.sessions.length)}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The sessions section's sort choice, living for this run only.
 *
 * Why a module-level variable rather than component state: the tabs are conditionally rendered, so
 * switching away unmounts and
 * useState cannot hold it. Why not lift it to DetailPane: that would start the parent holding each
 * section's
 * internal state, and the next section wanting to keep state would add another field. Why not persist
 * it: it is a habit of this browsing
 * session, not a setting. Why no store: the repository has neither a store nor Context, and one
 * boolean with one consumer makes a store premature abstraction.
 *
 * When a **second** view preference needs to survive unmounting, promote this into a view-prefs module
 * (still without a store library). Until then it should be exactly this small.
 * The cost: it survives switching project too — the sort is a way of looking, not a property of a
 * project, and that is deliberate.
 */
let sessionsRecentFirst = true

/**
 * The sessions section: all of this project's sessions, most recent activity first by default.
 * The sort only changes the presentation order — the provider layer already sorted by `at` descending,
 * and ascending is its reverse rather than a re-sort,
 * so the UI and the provider do not each hold their own comparator (including how a null `at` is handled)
 * and quietly diverge.
 */
function SessionsTab({
  detail,
  snap,
  onOpenSession
}: {
  detail: ProjectDetail
  snap: Snapshot
  onOpenSession: (file: string, focusQ?: number) => void
}): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  const [recentFirst, setRecentFirst] = useState(sessionsRecentFirst)
  const choose = (v: boolean): void => {
    sessionsRecentFirst = v
    setRecentFirst(v)
  }
  const sessions = detail.stats?.sessions ?? []
  const list = recentFirst ? sessions : [...sessions].reverse()
  // Ticket 08: search. Questions only by default (small, clean, precise hits); full text is an optional
  // toggle — the reason
  // the toggle exists is hit quality (full text hits tool output noise), not performance, and the copy
  // must not imply it is slow
  const [needle, setNeedle] = useState('')
  const [fullText, setFullText] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    const k = needle.trim()
    if (k === '') {
      setResult(null)
      return
    }
    const mine = ++seq.current
    const t = setTimeout(() => {
      window.agentshed.searchSessions({ path: detail.path, needle: k, fullText }).then(
        (r) => {
          if (seq.current === mine) setResult(r)
        },
        () => {
          if (seq.current === mine) setResult(null)
        }
      )
    }, 200)
    return () => clearTimeout(t)
  }, [needle, fullText, detail.path])

  if (sessions.length === 0) {
    return <div className="none">{t.detail.noSessionsHint}</div>
  }
  const searching = needle.trim() !== ''
  const groups = result === null ? [] : recentFirst ? result.groups : [...result.groups].reverse()
  if (searching) {
    return (
      <div>
        <SearchBar
          needle={needle}
          setNeedle={setNeedle}
          fullText={fullText}
          setFullText={setFullText}
          count={sessions.length}
        />
        {result === null ? (
          <div className="shead">{t.detail.searching}</div>
        ) : result.totalHits === 0 ? (
          <div className="shead">{t.detail.noHits}</div>
        ) : (
          <>
            <div className="shead">
              <span>
                {t.detail.hitsFound(result.totalHits, result.sessionCount)}
                {result.folded > 0 && (
                  <>
                    {' '}
                    {t.detail.folded(result.folded)}
                  </>
                )}
              </span>
              <span className="seg">
                <button className={recentFirst ? 'on' : ''} onClick={() => choose(true)}>
                  {t.detail.recentFirst}
                </button>
                <button className={recentFirst ? '' : 'on'} onClick={() => choose(false)}>
                  {t.detail.oldestFirst}
                </button>
              </span>
            </div>
            {groups.map((g) => (
              <div className="grp" key={g.file}>
                <button className="gh row-btn" onClick={() => onOpenSession(g.file)}>
                  <span className={`badge ${SIDE_BADGE[g.side].cls}`}>{SIDE_BADGE[g.side].label}</span>
                  <span className="t">{g.title ?? t.placeholder.untitledSession}</span>
                  {g.forkState === 'stripped' && <span className="pill fork">
                      <GitFork size={10} /> fork
                    </span>}
                  {g.forkState === 'uncertain' && (
                    <span className="pill forkq">
                      <GitFork size={10} /> {t.detail.forkUncertain}
                    </span>
                  )}
                  <span className="d">{t.detail.hitCount(g.hits.length)}</span>
                </button>
                {g.hits.map((h, hi) => (
                  <button
                    className="hit row-btn"
                    key={`${h.i}-${h.inBody ? 'b' : 'q'}-${hi}`}
                    onClick={() => onOpenSession(g.file, h.i)}
                  >
                    <span className="idx">{String(h.i).padStart(2, '0')}</span>
                    <span className="t">
                      <Highlight
                        text={
                          h.inBody && h.snippet !== null
                            ? h.snippet
                            : (h.text ?? t.placeholder.unreadableLine)
                        }
                        needle={needle.trim()}
                      />
                    </span>
                    {h.inBody && <span className="bd">{t.detail.inBody}</span>}
                    <span className="d">{fmtAgo(lang, h.at, snap.scannedAt)}</span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }
  return (
    <div>
      <SearchBar
        needle={needle}
        setNeedle={setNeedle}
        fullText={fullText}
        setFullText={setFullText}
        count={sessions.length}
      />
      <div className="grp-t">
        {t.detail.sortNote(recentFirst ? t.detail.descending : t.detail.ascending, sessions.length)}
        <span className="seg">
          <button className={recentFirst ? 'on' : ''} onClick={() => choose(true)}>
            {t.detail.recentFirst}
          </button>
          <button className={recentFirst ? '' : 'on'} onClick={() => choose(false)}>
            {t.detail.oldestFirst}
          </button>
        </span>
      </div>
      <div className="card">
        {list.map((s) => (
          <button className="se row-btn" key={s.file} onClick={() => onOpenSession(s.file)}>
            <span className={`badge ${SIDE_BADGE[s.side].cls}`}>{SIDE_BADGE[s.side].label}</span>
            <span className="t">{s.title ?? t.placeholder.untitledSession}</span>
            {s.forkState === 'stripped' && (
              <span className="pill fork" title={t.detail.forkTip}>
                <GitFork size={10} /> fork
              </span>
            )}
            {s.forkState === 'uncertain' && (
              <span className="pill forkq" title={t.detail.forkUncertainTip}>
                <GitFork size={10} /> {t.detail.forkUncertain}
              </span>
            )}
            <span className="n">{t.detail.questionCount(s.questionCount)}</span>
            <span className="tok">{fmtTok(s.tokens)}</span>
            <span className="d">{fmtAgo(lang, s.at, snap.scannedAt)}</span>
          </button>
        ))}
      </div>
      <div className="note">
        {t.detail.sessionsFoot}
        <br />
        {t.detail.sessionsFoot2}
      </div>
    </div>
  )
}

/** The search row (ticket 08): the input + the questions/full-text scope toggle (the prototype's
 * .sbar/.scope) */
function SearchBar({
  needle,
  setNeedle,
  fullText,
  setFullText,
  count
}: {
  needle: string
  setNeedle: (v: string) => void
  fullText: boolean
  setFullText: (v: boolean) => void
  count: number
}): JSX.Element {
  const t = useDict()
  return (
    <div className="sbar">
      <input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder={t.detail.searchPlaceholder(count)}
      />
      <span className="scope">
        <span className={fullText ? '' : 'on'} onClick={() => setFullText(false)}>
          {t.detail.scopeQuestions}
        </span>
        <span className={fullText ? 'on' : ''} onClick={() => setFullText(true)}>
          {t.detail.scopeFullText}
        </span>
      </span>
    </div>
  )
}

/** Highlighting matched text (case-insensitive; split as plain text, never through HTML) */
function Highlight({ text, needle }: { text: string; needle: string }): JSX.Element {
  if (needle === '') return <>{text}</>
  const lower = text.toLowerCase()
  const k = needle.toLowerCase()
  const parts: JSX.Element[] = []
  let from = 0
  for (let n = 0; ; n++) {
    const i = lower.indexOf(k, from)
    if (i === -1) break
    if (i > from) parts.push(<span key={`t${n}`}>{text.slice(from, i)}</span>)
    parts.push(<mark key={`m${n}`}>{text.slice(i, i + needle.length)}</mark>)
    from = i + needle.length
  }
  parts.push(<span key="tail">{text.slice(from)}</span>)
  return <>{parts}</>
}

function SkillRow({
  s,
  projectPath,
  onUninstall
}: {
  s: ProjectSkillEntry
  projectPath: string
  onUninstall?: () => void
}): JSX.Element {
  const t = useDict()
  if (s.origin === 'plugin' || s.level === 'plugin') {
    // A4/ADR-0012: plugin namespace rows expand and preview on equal footing with on-disk ones; still no
    // install or uninstall (G3)
    return (
      <SkillExpandBlock
        name={s.name}
        source={{
          kind: 'plugin',
          side: s.side,
          pluginRoot: s.pluginRoot,
          bareName: s.pluginSkillName ?? s.name
        }}
        pkgBySide={{ [s.side]: s.pkg }}
        levelLabel={t.detail.levelPlugin}
      />
    )
  }
  return (
    <SkillExpandBlock
      name={s.name}
      source={
        s.level === 'project'
          ? { kind: 'project', side: s.side, projectPath }
          : { kind: 'global', sides: [s.side], fixedSide: s.side }
      }
      symlink={s.symlink}
      level={s.level === 'project' ? 'project' : 'global'}
      levelLabel={s.level === 'project' ? t.detail.levelProject : t.detail.levelGlobal}
      pkgBySide={{ [s.side]: s.pkg }}
      uninstallSlot={
        onUninstall ? (
          <button
            type="button"
            className="ins"
            onClick={(e) => {
              e.stopPropagation()
              onUninstall()
            }}
          >
            {t.detail.uninstall}
          </button>
        ) : undefined
      }
    />
  )
}

function SkillsTab({
  detail,
  onChanged
}: {
  detail: ProjectDetail
  onChanged: () => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [confirm, setConfirm] = useState<ProjectSkillEntry | null>(null)
  const [kw, setKw] = useState('')
  const groups = useMemo(() => {
    const g = {
      clProject: [] as ProjectSkillEntry[],
      clGlobal: [] as ProjectSkillEntry[],
      cxProject: [] as ProjectSkillEntry[],
      cxGlobal: [] as ProjectSkillEntry[],
      plugin: [] as ProjectSkillEntry[] // Plugin-bundled: namespaced entries, read-only (G3)
    }
    for (const s of detail.skills) {
      if (s.level === 'plugin') g.plugin.push(s)
      else if (s.side === 'claude') (s.level === 'project' ? g.clProject : g.clGlobal).push(s)
      else (s.level === 'project' ? g.cxProject : g.cxGlobal).push(s)
    }
    return g
  }, [detail])
  async function doUninstall(s: ProjectSkillEntry): Promise<void> {
    setConfirm(null)
    const r = await window.agentshed.uninstallSkill({
      skillName: s.name,
      side: s.side,
      targetProjectPath: detail.path
    })
    if (r.ok) toast('ok', t.detail.uninstalled(s.name))
    else toast('err', t.detail.uninstallFailed(errorText(lang, appError(r.reason, r.params))))
    onChanged()
  }
  const delPath =
    confirm && `${detail.path}/${PROJECT_SKILLS_DIR[confirm.side]}/${confirm.name}/`
  /**
   * A group renders only what matched, and the heading count reports **that** number rather than the
   * group's total — a count still reporting the total would contradict the rows underneath it. A group
   * with nothing left disappears heading and all, which is the rule this section already applied to a
   * group that was empty to begin with.
   */
  const section = (title: string, items: ProjectSkillEntry[]): JSX.Element | null => {
    const shown = filterByName(items, kw)
    return shown.length === 0 ? null : (
      <div key={title}>
        <div className="grp-t">{title}({shown.length})</div>
        <div className="card sk-card">
          {shown.map((s) => (
            <SkillRow
              key={`${s.side}-${s.level}-${s.name}`}
              s={s}
              projectPath={detail.path}
              onUninstall={s.level === 'project' ? () => setConfirm(s) : undefined}
            />
          ))}
        </div>
      </div>
    )
  }
  const any = detail.skills.length > 0
  // "Nothing matched" and "nothing here" are different facts and get different sentences. Saying the
  // project has no skills while it has twenty, none of them matching `zzz`, would send the user looking
  // for a library that is in fact populated.
  const anyShown = filterByName(detail.skills, kw).length > 0
  return (
    <div>
      {any && <SkillSearch value={kw} onChange={setKw} />}
      {section(t.detail.secClaudeProject, groups.clProject)}
      {section(t.detail.secClaudeGlobal, groups.clGlobal)}
      {section(t.detail.secCodexProject, groups.cxProject)}
      {section(t.detail.secCodexGlobal, groups.cxGlobal)}
      {section(t.detail.secPlugin, groups.plugin)}
      {!any && <div className="none">{t.detail.noSkills}</div>}
      {any && !anyShown && <div className="none">{t.skills.noNameMatch}</div>}
      {confirm && (
        <>
          <div className="mask" onClick={() => setConfirm(null)} />
          <div className="reader dlg">
            <h2>{t.detail.confirmTitle}</h2>
            <p className="dlg-p">{t.detail.confirmBody}</p>
            <pre className="md mono dlg-path">{delPath}</pre>
            <div className="dlg-btns">
              <button className="cfg-btn" onClick={() => setConfirm(null)}>
                {t.detail.cancel}
              </button>
              <button className="cfg-btn danger" onClick={() => void doUninstall(confirm)}>
                {t.detail.del}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function McpTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const t = useDict()
  return (
    <div>
      <div className="grp-t">{t.detail.mcpTitle}</div>
      {detail.mcp.length === 0 ? (
        <div className="none">{t.detail.noMcp}</div>
      ) : (
        <div className="card">
          {detail.mcp.map((m) => (
            <div className="it" key={m.name}>
              <span className="nm mono">{m.name}</span>
              <span className={`pill ${m.enabled === true ? 'on' : m.enabled === false ? 'off' : 'glb'}`}>
                {m.enabled === true
                  ? t.detail.mcpEnabled
                  : m.enabled === false
                    ? t.detail.mcpDisabled
                    : t.detail.mcpDefault}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The chips' order comes from ARTIFACT_ORDER as the single source; the labels only map display names */
const ART_LABELS: Record<ArtifactType, string> = {
  context: 'CONTEXT.md',
  adr: 'ADR',
  specs: 'specs',
  prototypes: 'prototypes',
  features: 'features',
  postmortems: 'postmortems'
}

/**
 * The artifact reader overlay as a reusable pair (open + overlay element): the Artifacts tab and
 * the Config tab both open artifacts in it, each with its own instance (the overlay closes with
 * its tab). Prototypes keep their "open in the browser" route.
 */
function useArtifactReader(detail: ProjectDetail): {
  openArtifact: (item: ArtifactEntry) => Promise<void>
  readerOverlay: JSX.Element | null
} {
  const t = useDict()
  const lang = useLanguage()
  const [reader, setReader] = useState<{ item: ArtifactEntry; text: string } | null>(null)

  async function openArtifact(item: ArtifactEntry): Promise<void> {
    if (item.type === 'prototypes') {
      await window.agentshed.openArtifact(item.file)
      return
    }
    const cap = await window.agentshed.readArtifact(item.file)
    // The truncation marker is appended by the renderer in the current language (ticket 07)
    const md = cap.truncated ? `${cap.text}\n${t.placeholder.truncated}` : cap.text
    // Relative-path images resolve against the artifact's own directory (they load under the packaged
    // build's file://; in dev, mixed-content restrictions may prevent them showing)
    const baseDir = item.file.slice(0, item.file.lastIndexOf('/'))
    const rewritten = md.replace(
      /!\[([^\]]*)\]\((?!https?:\/\/|file:\/\/|data:|\/)([^)]+)\)/g,
      (_m, alt: string, rel: string) => `![${alt}](file://${baseDir}/${rel})`
    )
    setReader({ item, text: rewritten })
  }

  const readerOverlay = reader ? (
    <>
      <div className="mask" onClick={() => setReader(null)} />
      <div className="reader">
        <h2>{reader.item.title}</h2>
        <div className="meta mono">{reader.item.file}</div>
        <MarkdownBody
          className="md"
          text={reader.text}
          links={{
            baseDir: dirOf(reader.item.file),
            readable: detail.artifacts.map((a) => a.file),
            // Cross-references between artifacts (spec ↔ features, say) navigate inside the
            // reader, never the whole window
            onInternal: (file) => {
              const a = detail.artifacts.find((x) => x.file === file)
              if (a) void openArtifact(a)
            },
            onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
          }}
        />
      </div>
    </>
  ) : null

  return { openArtifact, readerOverlay }
}

function ArtifactsTab({ detail, snap }: { detail: ProjectDetail; snap: Snapshot }): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [filter, setFilter] = useState<'all' | ArtifactType>('all')
  const { openArtifact, readerOverlay } = useArtifactReader(detail)
  const list = detail.artifacts.filter((a) => filter === 'all' || a.type === filter)

  return (
    <div>
      <div className="chips">
        {(['all', ...ARTIFACT_ORDER] as const).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? t.detail.filterAll : ART_LABELS[f]}
          </button>
        ))}
      </div>
      {detail.artifacts.length === 0 ? (
        <div className="none">{t.detail.noArtifacts}</div>
      ) : list.length === 0 ? (
        <div className="none">{t.detail.noArtifactsOfType}</div>
      ) : (
        <div className="card">
          {list.map((a) => (
            <button className="it ai" key={a.file} onClick={() => void openArtifact(a)} title={a.file}>
              <span className="t">{a.title}</span>
              {a.type === 'prototypes' && <span className="pill ln">{t.detail.openInBrowser}</span>}
              <span className="pill glb">{ART_LABELS[a.type]}</span>
              <span className="src mono">{fmtAgo(lang, a.mtimeMs, snap.scannedAt)}</span>
            </button>
          ))}
        </div>
      )}
      {readerOverlay}
    </div>
  )
}

function CfgTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [which, setWhich] = useState<'cl' | 'cx' | 'settings'>('cl')
  const { openArtifact, readerOverlay } = useArtifactReader(detail)
  const md = which === 'cl' ? detail.configs.claudeMd : which === 'cx' ? detail.configs.agentsMd : null
  // The truncation marker is appended by the renderer in the current language (ticket 07)
  const cfgText = md === null ? null : md.truncated ? `${md.text}\n${t.placeholder.truncated}` : md.text
  return (
    <div>
      <div className="cfg-switch">
        {(
          [
            ['cl', 'CLAUDE.md'],
            ['cx', 'AGENTS.md'],
            ['settings', t.detail.settingsSummary]
          ] as const
        ).map(([w, label]) => (
          <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>
            {label}
          </button>
        ))}
      </div>
      {which === 'settings' ? (
        detail.configs.settingsSummary === null ? (
          <div className="none">{t.detail.noSettings}</div>
        ) : (
          <pre className="md mono">{detail.configs.settingsSummary}</pre>
        )
      ) : cfgText === null ? (
        <div className="none">{t.detail.fileMissing}</div>
      ) : (
        <MarkdownBody
          className="md"
          text={cfgText}
          links={{
            baseDir: detail.path,
            // A relative link to a listed project document opens the same reader overlay as the
            // Artifacts tab; anything else keeps the explicit out-of-scope notice
            readable: detail.artifacts.map((a) => a.file),
            onInternal: (file) => {
              const a = detail.artifacts.find((x) => x.file === file)
              if (a) void openArtifact(a)
            },
            onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
          }}
        />
      )}
      {readerOverlay}
    </div>
  )
}
