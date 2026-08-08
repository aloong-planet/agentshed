// 自定义应用菜单(票 13)。
//
// **为什么要自定义**:Electron 的默认菜单按**系统语言**本地化,而本产品的界面语言是
// 用户自己选的偏好——两者可以不同(spec:中文用户在英文系统上)。默认菜单会让
// 「界面是中文、菜单是英文」这种夹生状态固定下来,i18n 也就没在菜单上闭合。
//
// **模板是纯函数**(语言 → 菜单结构),两个动作从参数注入而非在此直接操作 BrowserWindow:
// 那样模板就不再是纯函数,也测不了。`import type` 编译后擦除,故本模块不引 Electron 运行时。
//
// **已知测试缺口**:菜单**实际显示**为哪种语言属 macOS 系统绘制,自动化触及不到。
// 可测的是本函数的文案与结构;不得用"构建函数返回了法语文案"冒充"菜单显示为法语"。
import type { MenuItemConstructorOptions } from 'electron'
import { dictOf, type Language } from '@shared/i18n'

export interface MenuActions {
  /** 切到设置维(与 rail ⚙️ 同一个操作) */
  openSettings: () => void
  /** 全局刷新(与 rail ↻ 同一个操作) */
  refresh: () => void
}

const NOOP: MenuActions = { openSettings: () => {}, refresh: () => {} }

/**
 * 结构照 macOS 标准菜单集;文案走字典,跟随 **app 内**语言而非系统语言。
 * 应用名 Agentshed 各语不变(ADR-0013 的范围边界)。
 */
export function buildMenuTemplate(
  lang: Language,
  actions: MenuActions = NOOP
): MenuItemConstructorOptions[] {
  const t = dictOf(lang)
  const m = t.menu
  return [
    {
      label: 'Agentshed',
      submenu: [
        { label: m.about, role: 'about' },
        { type: 'separator' },
        // 设置放在应用菜单、绑 Cmd+, ——macOS 的标准位置,用户会去那里找
        { label: t.rail.settings, accelerator: 'CmdOrCtrl+,', click: () => actions.openSettings() },
        { type: 'separator' },
        { label: m.hide, role: 'hide' },
        { label: m.hideOthers, role: 'hideOthers' },
        { label: m.unhide, role: 'unhide' },
        { type: 'separator' },
        { label: m.quit, role: 'quit' }
      ]
    },
    {
      label: m.edit,
      submenu: [
        { label: m.undo, role: 'undo' },
        { label: m.redo, role: 'redo' },
        { type: 'separator' },
        { label: m.cut, role: 'cut' },
        { label: m.copy, role: 'copy' },
        { label: m.paste, role: 'paste' },
        { label: m.selectAll, role: 'selectAll' }
      ]
    },
    {
      label: m.view,
      submenu: [
        // 全局刷新绑 Cmd+R:它是本产品的"重新扫描",不是网页意义的 reload——
        // 故不用 role:'reload'(那会重载渲染进程、丢掉全部 app state)
        { label: t.rail.refresh, accelerator: 'CmdOrCtrl+R', click: () => actions.refresh() },
        { type: 'separator' },
        { label: m.toggleDevTools, role: 'toggleDevTools' },
        { type: 'separator' },
        { label: m.resetZoom, role: 'resetZoom' },
        { label: m.zoomIn, role: 'zoomIn' },
        { label: m.zoomOut, role: 'zoomOut' },
        { type: 'separator' },
        { label: m.fullscreen, role: 'togglefullscreen' }
      ]
    },
    {
      label: m.window,
      submenu: [
        { label: m.minimize, role: 'minimize' },
        { label: m.close, role: 'close' }
      ]
    }
  ]
}
