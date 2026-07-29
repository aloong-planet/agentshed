// 票02 纵切(c):手动隐藏——存 app 自有存储(不写 agent 配置),原子写,scan 应用 hidden 标。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HiddenStore } from './hidden-store'
import { scan } from './providers/scan'
import type { ScanRoots } from './providers/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-hid-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('HiddenStore', () => {
  it('空目录起步 → 无隐藏;set 后持久化,重开实例可见', () => {
    const s1 = new HiddenStore(join(dir, 'store'))
    expect(s1.isHidden('/p/a')).toBe(false)
    s1.setHidden('/p/a', true)
    expect(s1.isHidden('/p/a')).toBe(true)
    const s2 = new HiddenStore(join(dir, 'store'))
    expect(s2.isHidden('/p/a')).toBe(true)
  })

  it('取消隐藏后持久化移除', () => {
    const s = new HiddenStore(join(dir, 'store'))
    s.setHidden('/p/a', true)
    s.setHidden('/p/a', false)
    const s2 = new HiddenStore(join(dir, 'store'))
    expect(s2.isHidden('/p/a')).toBe(false)
  })

  it('存储文件损坏 → 降级为空集不抛错', () => {
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(join(dir, 'store', 'hidden.json'), '{broken')
    const s = new HiddenStore(join(dir, 'store'))
    expect(s.isHidden('/p/a')).toBe(false)
  })

  it('写入是原子的:目录中不残留临时文件', () => {
    const s = new HiddenStore(join(dir, 'store'))
    s.setHidden('/p/a', true)
    const files = readdirSync(join(dir, 'store'))
    expect(files).toEqual(['hidden.json'])
  })
})

describe('scan 应用 hidden', () => {
  it('隐藏集合中的项目 hidden=true(路径按合并键匹配,尾斜杠不敏感)', async () => {
    const proj = join(dir, 'work', 'p1')
    mkdirSync(proj, { recursive: true })
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
    const roots: ScanRoots = {
      claudeHome: join(dir, '.claude'),
      claudeConfigFile: join(dir, '.claude.json'),
      codexHome: join(dir, '.codex'),
      agentsSkillsDir: join(dir, '.agents', 'skills')
    }
    const store = new HiddenStore(join(dir, 'store'))
    store.setHidden(`${proj}/`, true)
    const snap = await scan(roots, { now: () => 1, isHidden: (p) => store.isHidden(p) })
    expect(snap.projects[0].hidden).toBe(true)
  })
})
