// 票 13:自定义应用菜单的模板构建。
//
// **能测的与不能测的,票里已经划清**:模板是「语言 → 菜单结构」的纯函数,可单测其文案与结构;
// 而**菜单实际显示为哪种语言属 macOS 系统绘制,自动化触及不到**。
// 不得用"构建函数返回了法语文案"冒充"菜单显示为法语"——后者只能人工验收。
import { describe, it, expect } from 'vitest'
import { LANGUAGES, dictOf } from '@shared/i18n'
import { buildMenuTemplate } from './app-menu'

const labels = (lang: Parameters<typeof buildMenuTemplate>[0]): string[] =>
  buildMenuTemplate(lang).map((m) => String(m.label ?? ''))

describe('buildMenuTemplate', () => {
  it('六语各自都能构建出非空菜单,且顶层项数一致', () => {
    const counts = new Set(LANGUAGES.map((l) => buildMenuTemplate(l).length))
    expect(counts.size).toBe(1)
    for (const lang of LANGUAGES) expect(buildMenuTemplate(lang).length).toBeGreaterThan(0)
  })

  it('顶层文案随语言变化,不是写死一种', () => {
    // 只断"有 label"分不出真接了字典与写死中文;必须跨语言比较
    expect(labels('zh')).not.toEqual(labels('en'))
    expect(labels('ru')).not.toEqual(labels('ja'))
  })

  it('每个顶层项的文案都取自字典,无空标签', () => {
    for (const lang of LANGUAGES) {
      for (const l of labels(lang)) expect(l.length).toBeGreaterThan(0)
    }
  })

  it('应用名各语言不变(品牌名不本地化)', () => {
    // ADR-0013 的范围边界:Agentshed 作为品牌名各语保持不变
    for (const lang of LANGUAGES) expect(labels(lang)[0]).toBe('Agentshed')
  })

  it('接上「设置」与「全局刷新」两个快捷键入口', () => {
    const all = buildMenuTemplate('zh').flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
    const accels = all.map((i) => String((i as { accelerator?: string }).accelerator ?? ''))
    expect(accels).toContain('CmdOrCtrl+,') // 设置:macOS 标准位
    expect(accels).toContain('CmdOrCtrl+R') // 全局刷新
  })

  it('两个入口的文案与界面上的同名操作同源', () => {
    // 菜单里叫「设置」而界面上叫别的,是同一个功能两个名字——用户会当成两件事
    for (const lang of LANGUAGES) {
      const t = dictOf(lang)
      const flat = buildMenuTemplate(lang)
        .flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
        .map((i) => String((i as { label?: string }).label ?? ''))
      expect(flat).toContain(t.rail.settings)
      expect(flat).toContain(t.rail.refresh)
    }
  })

  it('点选两个入口会调用注入的动作,而不是自己去碰窗口', () => {
    // 注入而非在模板里直接操作 BrowserWindow:那样模板就不再是纯函数,也测不了
    const called: string[] = []
    const tpl = buildMenuTemplate('zh', {
      openSettings: () => called.push('settings'),
      refresh: () => called.push('refresh')
    })
    const items = tpl.flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
    for (const i of items) {
      const click = (i as { click?: () => void }).click
      if (click) click()
    }
    expect(called).toContain('settings')
    expect(called).toContain('refresh')
  })
})
