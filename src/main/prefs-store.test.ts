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

  it('无文件时默认 purple + 跟随系统语言 + 跟随系统明暗', () => {
    expect(new PrefsStore(dir).get()).toEqual({
      scheme: 'purple',
      language: 'system',
      mode: 'system'
    })
  })

  it('setMode 持久化;「跟随系统」读回仍是「跟随系统」', () => {
    const s = new PrefsStore(dir)
    s.setMode('dark')
    expect(new PrefsStore(dir).get().mode).toBe('dark')
    // 与语言同构的关键一条:存的是**策略**不是当刻的明暗。若实现把「跟随系统」
    // 落盘成写入当时求值出的 light/dark,这里会读回具体明暗值,
    // 「跟随系统」就退化成一次性快照——系统外观再变,app 也不会跟了
    s.setMode('system')
    expect(new PrefsStore(dir).get().mode).toBe('system')
  })

  it('setLanguage 持久化;「跟随系统」读回仍是「跟随系统」', () => {
    const s = new PrefsStore(dir)
    s.setLanguage('fr')
    expect(new PrefsStore(dir).get().language).toBe('fr')
    // 关键:存的是**偏好**不是解析结果。若实现把「跟随系统」落盘成当时解析出的
    // 某个语言,这里会读回 'zh'/'en' 之类,「跟随系统」就退化成一次性快照了
    s.setLanguage('system')
    expect(new PrefsStore(dir).get().language).toBe('system')
  })

  it('改一项不动另一项', () => {
    const s = new PrefsStore(dir)
    s.setScheme('amber')
    s.setLanguage('ru')
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'amber', language: 'ru', mode: 'system' })
    s.setScheme('blue')
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'blue', language: 'ru', mode: 'system' })
  })

  it('语言与外观模式两个「跟随系统」互不干扰', () => {
    // 二者在偏好层是**独立字段**,这条测的是"没有意外耦合"——
    // 改语言把 mode 顶回默认、或改模式顺手重置语言,都会在这里红。
    // 「系统外观变化能否传导到界面」不在此测,那是 Electron 的责任(见票 04 责任边界)
    const s = new PrefsStore(dir)
    s.setMode('dark')
    s.setLanguage('ja')
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'purple', language: 'ja', mode: 'dark' })
    // 改语言不动 mode
    s.setLanguage('system')
    expect(new PrefsStore(dir).get().mode).toBe('dark')
    // 改 mode 不动语言
    s.setMode('light')
    expect(new PrefsStore(dir).get().language).toBe('system')
  })

  it('单字段非法只降级该字段,不牵连另一项', () => {
    // 「降级只准自伤」不变量:早先只有一个字段时,「整份回默认」与「逐字段回默认」
    // 表现相同;加了第二个字段后两者才分道扬镳,故这条是新加字段必须带的测试
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ scheme: 'amber', language: 'ko', mode: 'dark' })
    )
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'amber', language: 'system', mode: 'dark' })
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ scheme: 'neon', language: 'ja', mode: 'dark' })
    )
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'purple', language: 'ja', mode: 'dark' })
  })

  it('mode 非法只降级 mode,语言与配色仍正确读出', () => {
    // 票 04 AC:单条偏好非法只降级该条。构造 mode 非法而 language / scheme 合法的文件——
    // 若实现改成"整份回默认",用户会同时丢掉配色与语言两个不相干的选择
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ scheme: 'amber', language: 'ru', mode: 'auto' })
    )
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'amber', language: 'ru', mode: 'system' })
  })

  it('旧版只有 scheme 的偏好文件:保留 scheme,补上语言与模式默认值', () => {
    // 升级场景——本次新增字段前写下的文件必须仍能用,且不丢已有选择
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ scheme: 'blue' }))
    expect(new PrefsStore(dir).get()).toEqual({
      scheme: 'blue',
      language: 'system',
      mode: 'system'
    })
  })

  it('票 03 时代的偏好文件(scheme + language):保留两者,补上模式默认值', () => {
    // 本票之前写下的文件,升级后不得丢掉已选语言
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ scheme: 'amber', language: 'fr' }))
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'amber', language: 'fr', mode: 'system' })
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
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ scheme: 'amber', language: 'ja', mode: 'light' }, null, 2)
    )
    expect(new PrefsStore(dir).get().scheme).toBe('amber')
    const s = new PrefsStore(dir)
    s.setScheme('blue')
    const raw = JSON.parse(readFileSync(join(dir, 'prefs.json'), 'utf8')) as Record<string, string>
    expect(raw).toEqual({ scheme: 'blue', language: 'ja', mode: 'light' })
  })

  it('写入是原子的:目录中不残留临时文件', () => {
    const s = new PrefsStore(dir)
    s.setScheme('blue')
    expect(readdirSync(dir)).toEqual(['prefs.json'])
  })
})
