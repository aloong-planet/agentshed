// Memory 分栏(spec: subagents-memory-plugin 序列 C/D)。
// 全局汇总:行内展开文件列表,点文件开抽屉;内容不进快照,经白名单通道按需读取(C8)。
import { useEffect, useMemo, useState } from 'react'
import type { MemoryFileMeta, MemorySummaryEntry, ProjectDetail, Snapshot } from '@shared/domain'
import { renderMarkdown } from './md'
import { fmtAgo } from './ProjectsPane'

/** C6 三态:未开启 → 开启提示;开启无内容 → 暂无内容;有内容 → 条目行(在列表中) */
function CodexMemoryNote({ snap }: { snap: Snapshot }): JSX.Element | null {
  const hasRow = snap.global.memory.some((m) => m.side === 'codex')
  if (hasRow) {
    return snap.global.codexMemoriesEnabled ? null : (
      <div className="none" style={{ textAlign: 'left', padding: '4px 2px' }}>
        Codex 记忆功能当前未开启,上方为目录中的遗留文件。
      </div>
    )
  }
  return (
    <div className="none" style={{ textAlign: 'left', padding: '4px 2px' }}>
      {snap.global.codexMemoriesEnabled
        ? 'Codex 记忆已开启,暂无内容。'
        : 'Codex 记忆功能未开启——可在 Codex 内用 /memories 命令,或「设置 → 个性化 → Enable memories」开启(实验性)。'}
    </div>
  )
}

export function GlobalMemoryTab({ snap }: { snap: Snapshot }): JSX.Element {
  // 展开态键 = 侧+项目路径:快照刷新重排后展开行不错位(review-code 重构项 #4)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<{ entry: MemorySummaryEntry; file: MemoryFileMeta } | null>(null)
  if (snap.global.memory.length === 0)
    return (
      <div>
        <div className="none">所有项目均无自动记忆</div>
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
      <div className="grp-t">按最近修改倒序 · 含失效/已隐藏(带徽标) · 点行展开文件列表,点文件看内容</div>
      <div className="card">
        {snap.global.memory.map((m) => {
          const key = `${m.side}-${m.projectPath ?? 'codex'}`
          return (
          <div key={key}>
            <button className="it row-btn" onClick={() => toggle(key)}>
              <span className="nm mono">{m.projectName}</span>
              <span className={`badge ${m.side === 'claude' ? 'cl' : 'cx'}`}>
                {m.side === 'claude' ? 'CC' : 'CX'}
              </span>
              {m.stale && <span className="pill warn">失效</span>}
              {m.hidden && <span className="pill off">已隐藏</span>}
              <span className="ds">
                {m.side === 'codex' ? '全局记忆目录' : m.hasMain ? 'MEMORY.md' : '无 MEMORY.md'} ·{' '}
                {m.files.filter((f) => f.name !== 'MEMORY.md').length} topic
              </span>
              <span className="src mono">{fmtAgo(m.lastModified, snap.scannedAt)}</span>
            </button>
            {expanded.has(key) && (
              <div className="sub-list">
                {m.files.map((f) => (
                  <button className="it row-btn" key={f.file} onClick={() => setOpen({ entry: m, file: f })}>
                    <span className="nm mono" style={{ flex: 1 }}>
                      {f.name}
                    </span>
                    <span className="src mono">{fmtAgo(f.mtimeMs, snap.scannedAt)}</span>
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
          meta={`${open.entry.projectName} · ${fmtAgo(open.file.mtimeMs, snap.scannedAt)}`}
          file={open.file.file}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** 详情页 Memory tab:MEMORY.md 主体直接渲染(同配置 tab 模式),topic 点开抽屉(D 序列) */
export function ProjectMemoryTab({
  detail,
  hasClaudeSide,
  anchor
}: {
  detail: ProjectDetail
  hasClaudeSide: boolean
  anchor: number
}): JSX.Element {
  const [open, setOpen] = useState<MemoryFileMeta | null>(null)
  const html = useMemo(
    () => (detail.memory.main === null ? null : renderMarkdown(detail.memory.main)),
    [detail]
  )
  if (detail.memory.main === null && detail.memory.topics.length === 0) {
    return (
      <div className="none">
        {hasClaudeSide
          ? '该项目暂无自动记忆'
          : 'Memory 为 Claude 侧机制(Codex 记忆是全局的,见全局页 Memory 分栏)'}
      </div>
    )
  }
  return (
    <div>
      <div className="grp-t">MEMORY.md(自动记忆主文件)</div>
      {html === null ? (
        <div className="none">无 MEMORY.md(仅 topic 文件)</div>
      ) : (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      <div className="grp-t">Topic 文件({detail.memory.topics.length}) · 点击查看</div>
      {detail.memory.topics.length === 0 ? (
        <div className="none">无 topic 文件</div>
      ) : (
        <div className="card">
          {detail.memory.topics.map((t) => (
            <button className="it row-btn" key={t.file} onClick={() => setOpen(t)}>
              <span className="nm mono" style={{ flex: 1 }}>
                {t.name}
              </span>
              <span className="src mono">{fmtAgo(t.mtimeMs, anchor)}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <MemoryFileDrawer
          title={open.name}
          meta={`topic 文件 · ${fmtAgo(open.mtimeMs, anchor)}`}
          file={open.file}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** 文件内容抽屉:经白名单通道按需读取;读取失败抽屉内报错不崩(C8) */
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
        if (alive) setContent(raw)
      })
      .catch((e: unknown) => {
        if (alive) setErr(`文件不可读:${String(e)}`)
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
          <div className="none">读取中…</div>
        ) : (
          <div className="raw mono">{content}</div>
        )}
      </div>
    </>
  )
}
