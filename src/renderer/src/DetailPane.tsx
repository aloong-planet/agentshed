import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from './md'
import type { ArtifactEntry, ArtifactType, ProjectDetail, ProjectSkillEntry, Snapshot, SearchResult } from '@shared/domain'
import { ARTIFACT_ORDER, emptyTokenStats } from '@shared/domain'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'
import { ProjectSubagentsTab } from './SubagentsView'
import { ProjectMemoryTab } from './MemoryView'
import { dirOf, handleMdClick } from './md-links'
import { ProjectPluginsTab } from './PluginsView'
import { fmtAgo } from './ProjectsPane'
import { toast } from './Toast'

type Tab = 'ov' | 'skills' | 'subagents' | 'plugins' | 'mcp' | 'memory' | 'sessions' | 'cfg' | 'arts'

export function DetailPane({
  snap,
  path,
  initialTab,
  onOpenSession
}: {
  snap: Snapshot
  path: string
  /** 从会话页返回时落在「会话」分栏(原型口径);平时不传,落概览 */
  initialTab?: Tab
  /** 打开会话页(票 04;票 08 起可带 focusQ 直达某条提问) */
  onOpenSession: (file: string, focusQ?: number) => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'ov')
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [reload, setReload] = useState(0)
  const entry = snap.projects.find((p) => p.path === path)

  useEffect(() => {
    setDetail(null)
    let alive = true
    void window.agentshed.getProjectDetail(path).then((d) => {
      if (alive) setDetail(d)
    })
    return () => {
      alive = false
    }
  }, [path, snap.scannedAt, reload])

  if (!entry) return <div className="empty">项目不在快照中(刷新后重试)</div>

  return (
    <div className="pane">
      <header className="pane-head">
        <div className="det-title">
          <h1>{entry.name}</h1>
          {entry.sides.includes('claude') && <span className="badge cl">CLAUDE</span>}
          {entry.sides.includes('codex') && <span className="badge cx">CODEX</span>}
          {entry.stale && <span className="stale-tag">失效</span>}
        </div>
        <div className="det-path mono">{entry.path}</div>
        <nav className="tabs">
          {(
            [
              ['ov', '概览'],
              ['skills', 'Skills'],
              ['subagents', 'Subagents'],
              ['plugins', 'Plugins'],
              ['mcp', 'MCP'],
              ['memory', 'Memory'],
              ['sessions', '会话'],
              ['cfg', '配置'],
              ['arts', '产物']
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
          <div className="none">读取中…</div>
        ) : (
          <>
            {tab === 'ov' && (
              <OverviewTab detail={detail} snap={snap} onOpenSession={onOpenSession} />
            )}
            {tab === 'skills' && (
              <SkillsTab detail={detail} onChanged={() => setReload((v) => v + 1)} />
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
 * 概览只露最近几条,全量在「会话」分栏(项目可有数百条会话)。
 * 取 5 与已确认的原型一致(docs/prototypes/project-detail 的概览会话卡),
 * 不是随手拍的数——改它等于改已确认的界面,原型要同步。
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
  const stats = detail.stats ?? { tokens: emptyTokenStats(), sessions: [] }
  return (
    <div>
      <TotalsCards stats={stats.tokens} />
      <TrendChart stats={stats.tokens} anchor={snap.scannedAt} archivedDays={snap.archivedDays} />
      <div className="grp-t">按模型拆分</div>
      <ModelBars stats={stats.tokens} />
      <div className="grp-t">最近会话</div>
      {stats.sessions.length === 0 ? (
        <div className="none">该项目暂无会话</div>
      ) : (
        <>
          <div className="card">
            {stats.sessions.slice(0, OVERVIEW_SESSIONS).map((s) => (
              <button className="se row-btn" key={s.file} onClick={() => onOpenSession(s.file)}>
                <span className={`badge ${s.side === 'claude' ? 'cl' : 'cx'}`}>
                  {s.side === 'claude' ? 'CC' : 'CX'}
                </span>
                <span className="t">{s.title}</span>
                <span className="tok">{fmtTok(s.tokens)}</span>
                <span className="d">{fmtAgo(s.at, snap.scannedAt)}</span>
              </button>
            ))}
          </div>
          <div className="note">
            共 {stats.sessions.length} 个会话 —— 全部见「会话」分栏。
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 会话分栏的排序选择,活在本次运行内。
 *
 * 为什么是模块级变量而不是组件 state:tab 是条件渲染,切走即卸载,组件内的
 * useState 存不住。为什么不提到 DetailPane:那会让父组件开始持有各分栏的
 * 内部状态,下一个分栏要留状态就再加一个字段。为什么不落盘:它是本次浏览的
 * 习惯,不是设置。为什么不上 store:全仓没有 store 也没有 Context,一个
 * boolean、一个消费者,建 store 是提前抽象。
 *
 * 出现**第二个**需要跨卸载存活的视图偏好时,把它提升成一个 view-prefs 模块
 * (那时仍不需要 store 库)。在此之前它就该是这么小。
 * 代价:切项目也保留——排序是看的方式,不是项目的属性,故意如此。
 */
let sessionsRecentFirst = true

/**
 * 会话分栏:本项目的全部会话,默认最近活动在前。
 * 排序只换呈现顺序——provider 层已按 at 倒序排好,正序取其反转而不重排,
 * 免得 UI 与 provider 各持一套比较器(含 at 为 null 时的处置)而悄悄分叉。
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
  const [recentFirst, setRecentFirst] = useState(sessionsRecentFirst)
  const choose = (v: boolean): void => {
    sessionsRecentFirst = v
    setRecentFirst(v)
  }
  const sessions = detail.stats?.sessions ?? []
  const list = recentFirst ? sessions : [...sessions].reverse()
  // 票 08:搜索。默认只搜提问(小、干净、命中精准);全文是可选开关——开关的
  // 立命理由是命中质量(全文会命中工具输出噪声),不是性能,文案不暗示它慢
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
    return <div className="none">该项目暂无会话。两侧 agent 在此目录下开过对话后会自动出现。</div>
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
          <div className="shead">搜索中…</div>
        ) : result.totalHits === 0 ? (
          <div className="shead">没有命中。默认只搜提问,试试切到「全文」。</div>
        ) : (
          <>
            <div className="shead">
              <span>
                找到 <b>{result.totalHits}</b> 条 · {result.sessionCount} 个会话
                {result.folded > 0 && (
                  <>
                    {' '}
                    · 已折叠 <b>{result.folded}</b> 条重放或被放弃分支上的命中
                  </>
                )}
              </span>
              <span className="seg">
                <button className={recentFirst ? 'on' : ''} onClick={() => choose(true)}>
                  最近在前
                </button>
                <button className={recentFirst ? '' : 'on'} onClick={() => choose(false)}>
                  最早在前
                </button>
              </span>
            </div>
            {groups.map((g) => (
              <div className="grp" key={g.file}>
                <button className="gh row-btn" onClick={() => onOpenSession(g.file)}>
                  <span className={`badge ${g.side === 'claude' ? 'cl' : 'cx'}`}>
                    {g.side === 'claude' ? 'CC' : 'CX'}
                  </span>
                  <span className="t">{g.title}</span>
                  {g.forkState === 'stripped' && <span className="pill fork">⑂ fork</span>}
                  {g.forkState === 'uncertain' && <span className="pill forkq">⑂? 剥离存疑</span>}
                  <span className="d">{g.hits.length} 条命中</span>
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
                        text={h.inBody && h.snippet !== null ? h.snippet : h.text}
                        needle={needle.trim()}
                      />
                    </span>
                    {h.inBody && <span className="bd">正文</span>}
                    <span className="d">{fmtAgo(h.at, snap.scannedAt)}</span>
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
        按最近活动时间{recentFirst ? '倒序' : '正序'} · {sessions.length} 个会话
        <span className="seg">
          <button className={recentFirst ? 'on' : ''} onClick={() => choose(true)}>
            最近在前
          </button>
          <button className={recentFirst ? '' : 'on'} onClick={() => choose(false)}>
            最早在前
          </button>
        </span>
      </div>
      <div className="card">
        {list.map((s) => (
          <button className="se row-btn" key={s.file} onClick={() => onOpenSession(s.file)}>
            <span className={`badge ${s.side === 'claude' ? 'cl' : 'cx'}`}>
              {s.side === 'claude' ? 'CC' : 'CX'}
            </span>
            <span className="t">{s.title}</span>
            {s.forkState === 'stripped' && (
              <span className="pill fork" title="本会话 fork 自另一个会话,开头的重放前缀已剥离">
                ⑂ fork
              </span>
            )}
            {s.forkState === 'uncertain' && (
              <span className="pill forkq" title="父会话不在扫描集内或与父校验不符,重放前缀只能按启发式剥离——可能少剥(重复)">
                ⑂? 剥离存疑
              </span>
            )}
            <span className="n">{s.questionCount} 提问</span>
            <span className="tok">{fmtTok(s.tokens)}</span>
            <span className="d">{fmtAgo(s.at, snap.scannedAt)}</span>
          </button>
        ))}
      </div>
      <div className="note">
        只列已注册项目的会话;subagent 与预热会话不单独入列,但 token 仍计入统计——
        故此处条数与上方 token 卡的分母不是同一个。<br />
        「最近活动」取文件内最大时间戳,与项目列表的活跃度(取文件 mtime)是两条管线。
      </div>
    </div>
  )
}

/** 搜索行(票 08):输入 + 提问/全文范围切换(原型 .sbar/.scope) */
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
  return (
    <div className="sbar">
      <input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder={`在本项目的 ${count} 个会话里搜索…`}
      />
      <span className="scope">
        <span className={fullText ? '' : 'on'} onClick={() => setFullText(false)}>
          提问
        </span>
        <span className={fullText ? 'on' : ''} onClick={() => setFullText(true)}>
          全文
        </span>
      </span>
    </div>
  )
}

/** 命中文本高亮(大小写不敏感;纯文本切段,不经 HTML) */
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
  onUninstall
}: {
  s: ProjectSkillEntry
  onUninstall?: () => void
}): JSX.Element {
  return (
    <div className={`it ${s.shadowed ? 'shadowed' : ''}`}>
      <span className="nm mono">{s.name}</span>
      <span className={`pill ${s.level === 'project' ? 'prj' : s.level === 'plugin' ? 'plg' : 'glb'}`}>
        {s.level === 'project' ? '项目级' : s.level === 'plugin' ? '插件' : '全局'}
      </span>
      {s.symlink && <span className="pill ln">⤷ 软链</span>}
      {s.shadows && <span className="pill shadow">遮蔽全局</span>}
      {s.shadowed && <span className="pill shadow">被项目级遮蔽</span>}
      {s.coexists && (
        <span className="pill shadow" title="Codex 同名不遮蔽:两个都生效,纯名字调用会歧义">
          同名共存
        </span>
      )}
      <span className="ds">{s.description ?? ''}</span>
      {onUninstall && (
        <button className="ins" onClick={onUninstall}>
          卸载
        </button>
      )}
    </div>
  )
}

function SkillsTab({
  detail,
  onChanged
}: {
  detail: ProjectDetail
  onChanged: () => void
}): JSX.Element {
  const [confirm, setConfirm] = useState<ProjectSkillEntry | null>(null)
  const groups = useMemo(() => {
    const g = {
      clProject: [] as ProjectSkillEntry[],
      clGlobal: [] as ProjectSkillEntry[],
      cxProject: [] as ProjectSkillEntry[],
      cxGlobal: [] as ProjectSkillEntry[],
      plugin: [] as ProjectSkillEntry[] // 插件内含:命名空间条目,只读(G3)
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
    if (r.ok) toast('ok', `已卸载 ${s.name}(仅局部刷新该项目)`)
    else toast('err', `卸载失败:${r.message}`)
    onChanged()
  }
  const delPath =
    confirm &&
    `${detail.path}/${confirm.side === 'claude' ? '.claude' : '.agents'}/skills/${confirm.name}/`
  const section = (title: string, items: ProjectSkillEntry[]): JSX.Element | null =>
    items.length === 0 ? null : (
      <div key={title}>
        <div className="grp-t">{title}({items.length})</div>
        <div className="card">
          {items.map((s) => (
            <SkillRow
              key={`${s.side}-${s.level}-${s.name}`}
              s={s}
              onUninstall={s.level === 'project' ? () => setConfirm(s) : undefined}
            />
          ))}
        </div>
      </div>
    )
  const any = detail.skills.length > 0
  return (
    <div>
      {section('项目级 · .claude/skills', groups.clProject)}
      {section('全局层 · Claude', groups.clGlobal)}
      {section('项目级 · .agents/skills', groups.cxProject)}
      {section('全局层 · Codex', groups.cxGlobal)}
      {section('插件内含 · 本项目有效启用(命名空间调用,只读)', groups.plugin)}
      {!any && <div className="none">该项目无生效 skills</div>}
      {confirm && (
        <>
          <div className="mask" onClick={() => setConfirm(null)} />
          <div className="reader dlg">
            <h2>卸载项目级 skill?</h2>
            <p className="dlg-p">将删除以下目录(项目 git 状态由你自行处理;不做副本差异检测):</p>
            <pre className="md mono dlg-path">{delPath}</pre>
            <div className="dlg-btns">
              <button className="cfg-btn" onClick={() => setConfirm(null)}>
                取消
              </button>
              <button className="cfg-btn danger" onClick={() => void doUninstall(confirm)}>
                删除
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function McpTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  return (
    <div>
      <div className="grp-t">项目级 · .mcp.json(enabled/disabled 来自项目设置)</div>
      {detail.mcp.length === 0 ? (
        <div className="none">项目无 .mcp.json;全局 MCP 见 Agents 页</div>
      ) : (
        <div className="card">
          {detail.mcp.map((m) => (
            <div className="it" key={m.name}>
              <span className="nm mono">{m.name}</span>
              <span className={`pill ${m.enabled === true ? 'on' : m.enabled === false ? 'off' : 'glb'}`}>
                {m.enabled === true ? '已启用' : m.enabled === false ? '已禁用' : '默认'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** chips 顺序取 ARTIFACT_ORDER 单一出处;标签只做展示名映射 */
const ART_LABELS: Record<ArtifactType, string> = {
  context: 'CONTEXT.md',
  adr: 'ADR',
  specs: 'specs',
  prototypes: 'prototypes',
  features: 'features',
  postmortems: 'postmortems'
}

function ArtifactsTab({ detail, snap }: { detail: ProjectDetail; snap: Snapshot }): JSX.Element {
  const [filter, setFilter] = useState<'all' | ArtifactType>('all')
  const [reader, setReader] = useState<{ item: ArtifactEntry; html: string } | null>(null)
  const list = detail.artifacts.filter((a) => filter === 'all' || a.type === filter)

  async function open(item: ArtifactEntry): Promise<void> {
    if (item.type === 'prototypes') {
      await window.agentshed.openArtifact(item.file)
      return
    }
    const md = await window.agentshed.readArtifact(item.file)
    // 相对路径图片按产物所在目录解析(打包版 file:// 下可加载;dev 下受混合内容限制可能不显示)
    const baseDir = item.file.slice(0, item.file.lastIndexOf('/'))
    const rewritten = md.replace(
      /!\[([^\]]*)\]\((?!https?:\/\/|file:\/\/|data:|\/)([^)]+)\)/g,
      (_m, alt: string, rel: string) => `![${alt}](file://${baseDir}/${rel})`
    )
    setReader({ item, html: renderMarkdown(rewritten) })
  }

  return (
    <div>
      <div className="chips">
        {(['all', ...ARTIFACT_ORDER] as const).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? '全部' : ART_LABELS[f]}
          </button>
        ))}
      </div>
      {detail.artifacts.length === 0 ? (
        <div className="none">未按约定沉淀(非八步项目;不视为错误)</div>
      ) : list.length === 0 ? (
        <div className="none">该类无产物</div>
      ) : (
        <div className="card">
          {list.map((a) => (
            <button className="it ai" key={a.file} onClick={() => void open(a)} title={a.file}>
              <span className="t">{a.title}</span>
              {a.type === 'prototypes' && <span className="pill ln">HTML → 浏览器</span>}
              <span className="pill glb">{ART_LABELS[a.type]}</span>
              <span className="src mono">{fmtAgo(a.mtimeMs, snap.scannedAt)}</span>
            </button>
          ))}
        </div>
      )}
      {reader && (
        <>
          <div className="mask" onClick={() => setReader(null)} />
          <div className="reader">
            <h2>{reader.item.title}</h2>
            <div className="meta mono">{reader.item.file}</div>
            <div
              className="md"
              onClick={(e) =>
                handleMdClick(
                  e,
                  {
                    baseDir: dirOf(reader.item.file),
                    readable: detail.artifacts.map((a) => a.file)
                  },
                  {
                    // 产物间交叉引用(如 spec ↔ features)在阅读器内跳转,不导航整窗
                    internal: (file) => {
                      const a = detail.artifacts.find((x) => x.file === file)
                      if (a) void open(a)
                    },
                    unresolved: (reason) => toast('err', reason)
                  }
                )
              }
              dangerouslySetInnerHTML={{ __html: reader.html }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function CfgTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const [which, setWhich] = useState<'cl' | 'cx' | 'settings'>('cl')
  const html = useMemo(() => {
    const md = which === 'cl' ? detail.configs.claudeMd : which === 'cx' ? detail.configs.agentsMd : null
    return md === null ? null : renderMarkdown(md)
  }, [which, detail])
  return (
    <div>
      <div className="cfg-switch">
        {(
          [
            ['cl', 'CLAUDE.md'],
            ['cx', 'AGENTS.md'],
            ['settings', 'settings 摘要']
          ] as const
        ).map(([w, label]) => (
          <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>
            {label}
          </button>
        ))}
      </div>
      {which === 'settings' ? (
        detail.configs.settingsSummary === null ? (
          <div className="none">项目键无可展示设置</div>
        ) : (
          <pre className="md mono">{detail.configs.settingsSummary}</pre>
        )
      ) : html === null ? (
        <div className="none">文件不存在</div>
      ) : (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}
