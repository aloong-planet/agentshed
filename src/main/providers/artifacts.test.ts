// 票05:八步产物扫描——六类识别(2026-08-01 加 specs)、标题提取、时间倒序、
// README 与 vendor 排除、缺目录空态;类型顺序本身是契约(spec project-detail B1)。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readArtifacts } from './artifacts'
import { ARTIFACT_ORDER } from '@shared/domain'

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
  it('B1 类型顺序是契约:自顶向下的推导链(术语→决策→需求→界面→能力→教训)', () => {
    expect(ARTIFACT_ORDER).toEqual(['context', 'adr', 'specs', 'prototypes', 'features', 'postmortems'])
  })

  it('B2 specs 与其余五类同规则识别(docs/specs/*.md,README 不计)', () => {
    w('docs/specs/memory-view.md', '# Memory 查看\n', 700)
    w('docs/specs/README.md', '# Spec 索引\n', 800)
    const items = readArtifacts(proj)
    expect(items.map((i) => `${i.type}:${i.title}`)).toEqual(['specs:Memory 查看'])
  })

  it('六类识别 + 标题取首个 # 标题 + 全局时间倒序;README 不计', () => {
    w('CONTEXT.md', '# 术语表\n', 100)
    w('docs/adr/0001-first.md', '# ADR-0001 定架构\n', 500)
    w('docs/adr/README.md', '# 索引\n', 900)
    w('docs/specs/shot.md', '# 截图(需求)\n', 600)
    w('docs/features/shot.md', '# 截图\n', 300)
    w('docs/postmortems/perm.md', '# 权限踩坑\n', 400)
    w('docs/prototypes/list/prototype-list.html', '<title>列表</title>', 200)
    const items = readArtifacts(proj)
    expect(items.map((i) => i.type)).toEqual([
      'specs',
      'adr',
      'postmortems',
      'features',
      'prototypes',
      'context'
    ])
    expect(items[0].title).toBe('截图(需求)') // 最新 mtime(600)在首位——列表按时间倒序,与类型顺序无关
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
