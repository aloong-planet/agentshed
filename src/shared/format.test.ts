// 票 12:日期与数字按当前界面语言呈现。
//
// **期望值一律取自对 Intl 的实测打表,不照记忆写**——票 02 已经吃过一次亏:
// 俄语复数分型凭直觉会写错,而实现与期望若一起错,测试照样绿。
// 故这里对"具体长什么样"的断言只钉**结构性质**(含哪个数字、不含中文、两语言不同),
// 不硬编码 Intl 的输出串:那串随 ICU 版本会变,钉死它是把测试绑在运行时版本上。
import { describe, it, expect } from 'vitest'
import { LANGUAGES } from './i18n'
import { relativeDays, dayLabel, formatCount, formatBytes, monthDay } from './format'

describe('relativeDays(相对时间)', () => {
  it('今天 / 昨天 有专门表达,不是「0 天前」', () => {
    // 各语言都有"今天/昨天"的惯用词,退化成"0 天前"读起来是机器味
    for (const lang of LANGUAGES) {
      const today = relativeDays(lang, 0)
      const yesterday = relativeDays(lang, 1)
      expect(today).not.toContain('0')
      expect(today).not.toBe(yesterday)
    }
  })

  it('N 天前与 N 月前含对应数字', () => {
    expect(relativeDays('zh', 5)).toContain('5')
    expect(relativeDays('en', 5)).toContain('5')
    expect(relativeDays('zh', 90)).toContain('3') // 90 天 → 3 个月
  })

  it('**不同语言给出不同措辞**——这条防的是"接了 Intl 却传死 locale"', () => {
    // 只断"有输出"分不出真本地化与写死 en;必须跨语言比较
    const zh = relativeDays('zh', 5)
    const ru = relativeDays('ru', 5)
    const ja = relativeDays('ja', 5)
    expect(new Set([zh, ru, ja]).size).toBe(3)
  })

  it('中文以外的语言不含中文字符', () => {
    for (const lang of LANGUAGES.filter((l) => l !== 'zh' && l !== 'ja')) {
      expect(relativeDays(lang, 5)).not.toMatch(/[一-龥]/)
    }
  })

  it('null 与非有限值给稳定降级,不显示 NaN', () => {
    expect(relativeDays('zh', null)).toBe('—')
    expect(relativeDays('zh', NaN)).toBe('—')
    expect(relativeDays('zh', Infinity)).toBe('—')
    expect(relativeDays('zh', -1)).toBe(relativeDays('zh', 0)) // 未来时间当今天
  })
})

describe('dayLabel(日期分组标签)', () => {
  const D = Date.parse('2026-08-04T09:00:00') // 周二

  it('含月/日,并随语言变化', () => {
    const zh = dayLabel('zh', D)
    const en = dayLabel('en', D)
    expect(zh).toContain('4')
    expect(en).toContain('4')
    expect(zh).not.toBe(en)
  })

  it('非中日语言不含中文星期', () => {
    for (const lang of LANGUAGES.filter((l) => l !== 'zh' && l !== 'ja')) {
      expect(dayLabel(lang, D)).not.toMatch(/周[日一二三四五六]/)
    }
  })

  it('同一天在同一语言下标签稳定(分组靠它做键)', () => {
    // dayGroups 用标签当分组键,标签不稳定会把同一天拆成两组
    expect(dayLabel('fr', D)).toBe(dayLabel('fr', D + 1000))
  })
})

describe('formatCount(数字分组)', () => {
  it('分组符号随语言变化', () => {
    // 英语 1,234 / 法语用窄空格 / 俄语用空格——只断"不全都一样"
    const all = LANGUAGES.map((l) => formatCount(l, 1234567))
    expect(new Set(all).size).toBeGreaterThan(1)
  })

  it('每种语言的输出都含各位数字', () => {
    for (const lang of LANGUAGES) {
      const s = formatCount(lang, 1234567)
      expect(s.replace(/\D/g, '')).toBe('1234567')
    }
  })

  it('NaN / Infinity / 负数不抛错也不显示 NaN', () => {
    expect(formatCount('zh', NaN)).toBe('—')
    expect(formatCount('zh', Infinity)).toBe('—')
    expect(formatCount('zh', -5)).toContain('5')
  })
})

describe('formatBytes(字节量)', () => {
  it('单位符号不翻译,数值按语言格式化', () => {
    // AC:KB / MB 这类单位符号是记法,各语言通用,不进字典
    for (const lang of LANGUAGES) {
      expect(formatBytes(lang, 2 * 1024 * 1024)).toContain('MB')
      expect(formatBytes(lang, 2048)).toContain('KB')
      expect(formatBytes(lang, 512)).toContain('B')
    }
  })

  it('NaN / 负数降级,不显示 NaN', () => {
    expect(formatBytes('zh', NaN)).toBe('—')
    expect(formatBytes('zh', -1)).toBe('—')
  })
})

describe('monthDay(轴标签的月/日)', () => {
  it('语序随语言变化,不固定为某一国', () => {
    // 美式 8/4 与欧陆 04/08 是**同一天的不同语序**——只断"含 8 和 4"分不出来,
    // 必须比较不同语言的输出是否真的不同
    const en = monthDay('en', 8, 4)
    const fr = monthDay('fr', 8, 4)
    expect(en).not.toBe(fr)
  })

  it('输出只含月与日,不带年份', () => {
    // 实现内部用 2001 年造日期只为取语序;年份漏进输出会让轴标签变长、挤掉相邻标签
    for (const lang of LANGUAGES) {
      expect(monthDay(lang, 8, 4)).not.toContain('2001')
    }
  })

  it('非有限入参降级,不显示 NaN', () => {
    expect(monthDay('zh', NaN, 4)).toBe('—')
  })
})
