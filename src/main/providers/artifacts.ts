// 八步产物扫描(票05):五类识别,项目详情内展示;.scratch 天然不在 docs/ 下不计。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { ArtifactEntry, ArtifactType } from '@shared/domain'

export function readArtifacts(projectPath: string): ArtifactEntry[] {
  const out: ArtifactEntry[] = []

  const context = join(projectPath, 'CONTEXT.md')
  if (existsSync(context)) out.push(mdEntry('context', context))

  collectMd(out, 'adr', join(projectPath, 'docs', 'adr'))
  collectMd(out, 'features', join(projectPath, 'docs', 'features'))
  collectMd(out, 'postmortems', join(projectPath, 'docs', 'postmortems'))
  collectPrototypes(out, join(projectPath, 'docs', 'prototypes'))

  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function collectMd(out: ArtifactEntry[], type: ArtifactType, dir: string): void {
  if (!existsSync(dir)) return
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    if (name.toLowerCase() === 'readme.md') continue // 索引文件不是产物
    out.push(mdEntry(type, join(dir, name)))
  }
}

function collectPrototypes(out: ArtifactEntry[], root: string): void {
  if (!existsSync(root)) return
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'vendor' || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      if (!e.name.endsWith('.html')) continue
      if (dir === root && e.name === 'index.html') continue // 画廊壳不是产物
      const rel = relative(root, p).replace(/\.html$/, '')
      // 模块内 index.html 用「目录路径」作名,其余用文件名
      const title = e.name === 'index.html' ? rel.replace(/\/index$/, '') : e.name.replace(/\.html$/, '')
      out.push({ type: 'prototypes', title, file: p, mtimeMs: mtime(p) })
    }
  }
  walk(root)
}

function mdEntry(type: ArtifactType, file: string): ArtifactEntry {
  return { type, title: mdTitle(file), file, mtimeMs: mtime(file) }
}

function mdTitle(file: string): string {
  try {
    const head = readFileSync(file, 'utf8').slice(0, 4000)
    const m = /^#\s+(.+)$/m.exec(head)
    if (m) return m[1].trim()
  } catch {
    // 读不了就走文件名兜底
  }
  return file.split('/').pop()?.replace(/\.md$/, '') ?? file
}

function mtime(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}
