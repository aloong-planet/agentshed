// 外观模式的落地口:偏好 → Electron 的 nativeTheme.themeSource。
//
// **为什么走 nativeTheme 而不是渲染层自算明暗再写 DOM 属性**:themeSource 设为
// light / dark 会直接改变 `prefers-color-scheme` 的求值结果,既有媒体查询**零改动**
// 即跟随,且 macOS 窗口边框与原生菜单一并跟随。自算方案则要给每套深色值在媒体查询块
// 与手动覆盖块各写一份(3 配色 × 2 = 6 份重复,改色必漏),还管不到窗口 chrome。
// 详见 docs/specs/appearance.md「明暗模式由 nativeTheme 承担,CSS 零改动」。
//
// 注:theme.css 里现存的 `:root[data-theme]` 规则是**死代码**(git 全历史证明从未有
// 代码设过该属性),不是这条路的钩子,别照着它去写渲染层自算——清理另有专门任务。
import type { NativeTheme } from 'electron'
import type { AppearanceMode } from '@shared/appearance'

/**
 * nativeTheme 的最小契约:本模块只用到 themeSource 这一个可写属性。
 *
 * 收成接口而不是直接用 `nativeTheme`,是为了让这条赋值能在**不引 Electron** 的前提下
 * 被单测驱动(ADR-0002:主进程逻辑站在可注入的 seam 上)。上面的 import 是 **type-only**,
 * 编译后完全擦除,故测试里不会真去加载 electron。
 *
 * 属性类型刻意取自 `NativeTheme['themeSource']` 而**不是**写成 `AppearanceMode`:
 * 下面那句赋值因此是"把 AppearanceMode 写进 Electron 的取值域",赋值是**不变**检查,
 * AppearanceMode 多出一个 Electron 没有的取值即报 TS2322。
 * 写成 `themeSource: AppearanceMode` 看着等价,实测**不设防**——对象属性的可赋值性是
 * 协变的,更宽的 AppearanceMode 照样满足接口,`nativeTheme` 传进来一声不吭。
 * (这条是实测撞出来的:先按"同名即安全"写了注释,加第四个取值做变异时 typecheck 仍
 * 退出码 0,才发现那句注释是错的。)
 */
export interface ThemeSourceTarget {
  themeSource: NativeTheme['themeSource']
}

/**
 * 把外观模式偏好写进 themeSource。
 *
 * **责任边界**:职责到"把 themeSource 设对"为止。设对之后系统外观变化能否传导到界面,
 * 是 Electron 与 Chromium 的责任,不在可测面内(测试环境改不了真实系统外观,而用
 * themeSource 自己去模拟"系统变化"是循环论证)。传导效果归人工验收。
 */
export function applyAppearanceMode(target: ThemeSourceTarget, mode: AppearanceMode): void {
  target.themeSource = mode
}
