// 票05:八步产物扫描——五类识别、标题提取、时间倒序、README 与 vendor 排除、缺目录空态。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readArtifacts } from './artifacts'

let dir: string
let proj: string

function w(rel: string, content: string, atSec: number): void {
  const f = join(proj, rel)
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, content)
  utimesSync(f, atSec, atSec)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-art-'))
  proj = join(dir, 'p1')
  mkdirSync(proj, { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readArtifacts', () => {
  it('五类识别 + 标题取首个 # 标题 + 全局时间倒序;README 不计', () => {
    w('CONTEXT.md', '# 术语表\n', 100)
    w('docs/adr/0001-first.md', '# ADR-0001 定架构\n', 500)
    w('docs/adr/README.md', '# 索引\n', 900)
    w('docs/features/shot.md', '# 截图\n', 300)
    w('docs/postmortems/perm.md', '# 权限踩坑\n', 400)
    w('docs/prototypes/list/prototype-list.html', '<title>列表</title>', 200)
    const items = readArtifacts(proj)
    expect(items.map((i) => i.type)).toEqual(['adr', 'postmortems', 'features', 'prototypes', 'context'])
    expect(items[0].title).toBe('ADR-0001 定架构')
    expect(items.find((i) => i.type === 'context')?.title).toBe('术语表')
    expect(items.some((i) => i.title === '索引')).toBe(false)
  })

  it('prototypes:递归收 .html,排除根 index.html 与 vendor;标题用文件名', () => {
    w('docs/prototypes/index.html', '<title>画廊</title>', 100)
    w('docs/prototypes/vendor/mermaid.min.js', 'x', 100)
    w('docs/prototypes/agents/prototype-agents.html', '<title>Agents</title>', 200)
    w('docs/prototypes/list/visibility/index.html', '<title>逻辑</title>', 300)
    const items = readArtifacts(proj)
    const names = items.map((i) => i.title).sort()
    expect(names).toEqual(['list/visibility', 'prototype-agents'])
  })

  it('无 docs 目录 → 空数组(非八步项目空态,不报错)', () => {
    expect(readArtifacts(proj)).toEqual([])
  })

  it('无标题的 md 用文件名兜底', () => {
    w('docs/features/plain.md', '没有标题的正文\n', 100)
    expect(readArtifacts(proj)[0].title).toBe('plain')
  })
})
