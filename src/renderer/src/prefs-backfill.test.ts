// issue #61:getPrefs 的回声不得顶掉用户抢先做出的选择。
import { describe, it, expect } from 'vitest'
import type { Prefs } from '@shared/prefs'
import { backfillPrefs, type PrefKey } from './prefs-backfill'

const DEFAULTS: Prefs = { scheme: 'purple', language: 'system', mode: 'system' }
/** 磁盘上的值(mount 时那次 getPrefs 读到的) */
const ON_DISK: Prefs = { scheme: 'blue', language: 'fr', mode: 'light' }
const touched = (...keys: PrefKey[]): ReadonlySet<PrefKey> => new Set(keys)

describe('backfillPrefs', () => {
  it('用户没碰过任何项时,整份采用回声', () => {
    expect(backfillPrefs(DEFAULTS, ON_DISK, touched())).toEqual(ON_DISK)
  })

  it('用户改过的那一项保留本地值,不被回声顶掉', () => {
    // 竞态本体:mount 时发出的 getPrefs 读的是**点击之前**的磁盘状态,
    // 若它晚于用户的写入才 resolve,无条件回填就会把新选择顶回旧值
    const local: Prefs = { ...DEFAULTS, mode: 'dark' }
    expect(backfillPrefs(local, ON_DISK, touched('mode')).mode).toBe('dark')
  })

  it('**只跳过被碰过的那一项**,其余仍采用回声', () => {
    // 这条是本函数存在的理由。若实现退化成"碰过任何一项就整份跳过",
    // 配色与语言会停在默认值。触发条件与"无守卫"完全相同(都要抢在回声之前点),
    // 差别在波及面:无守卫错 1 项(用户刚点的那项被顶掉),粗粒度错 2 项
    // (没碰过的两项丢回默认值)。救一项赔两项,是严格更差而非另一种权衡
    const local: Prefs = { ...DEFAULTS, mode: 'dark' }
    expect(backfillPrefs(local, ON_DISK, touched('mode'))).toEqual({
      scheme: 'blue',
      language: 'fr',
      mode: 'dark'
    })
  })

  it('三项都被碰过时,回声一项都不采用', () => {
    const local: Prefs = { scheme: 'amber', language: 'ja', mode: 'dark' }
    expect(backfillPrefs(local, ON_DISK, touched('scheme', 'language', 'mode'))).toEqual(local)
  })

  it('逐项独立:碰配色不影响语言与模式的回填', () => {
    const local: Prefs = { ...DEFAULTS, scheme: 'amber' }
    expect(backfillPrefs(local, ON_DISK, touched('scheme'))).toEqual({
      scheme: 'amber',
      language: 'fr',
      mode: 'light'
    })
  })

  it('回声与本地相同时结果不变(重复点同一项不产生抖动)', () => {
    expect(backfillPrefs(ON_DISK, ON_DISK, touched('mode'))).toEqual(ON_DISK)
  })
})
