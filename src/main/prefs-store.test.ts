// 票 appearance 01:PrefsStore——app 自有 prefs.json,默认 purple,损坏/非法回落,原子写。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PrefsStore } from './prefs-store'

describe('PrefsStore', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prefs-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('无文件时默认 purple', () => {
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'purple' })
  })

  it('setScheme 持久化并可读回三值', () => {
    const s = new PrefsStore(dir)
    s.setScheme('blue')
    expect(new PrefsStore(dir).get().scheme).toBe('blue')
    s.setScheme('amber')
    expect(new PrefsStore(dir).get().scheme).toBe('amber')
    s.setScheme('purple')
    expect(new PrefsStore(dir).get().scheme).toBe('purple')
  })

  it('损坏/非法 scheme 回落 purple 不抛', () => {
    writeFileSync(join(dir, 'prefs.json'), 'not-json')
    expect(new PrefsStore(dir).get().scheme).toBe('purple')
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ scheme: 'neon' }))
    expect(new PrefsStore(dir).get().scheme).toBe('purple')
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({}))
    expect(new PrefsStore(dir).get().scheme).toBe('purple')
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify(null))
    expect(new PrefsStore(dir).get().scheme).toBe('purple')
  })

  it('合法文件读出;写入后磁盘为对象形态', () => {
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ scheme: 'amber' }, null, 2))
    expect(new PrefsStore(dir).get().scheme).toBe('amber')
    const s = new PrefsStore(dir)
    s.setScheme('blue')
    const raw = JSON.parse(readFileSync(join(dir, 'prefs.json'), 'utf8')) as { scheme: string }
    expect(raw).toEqual({ scheme: 'blue' })
  })

  it('写入是原子的:目录中不残留临时文件', () => {
    const s = new PrefsStore(dir)
    s.setScheme('blue')
    expect(readdirSync(dir)).toEqual(['prefs.json'])
  })
})
