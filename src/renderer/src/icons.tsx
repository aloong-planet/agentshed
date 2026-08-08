// 图标模块:全部为内联 SVG,统一由 Icon 包装。
//
// **为什么不用 emoji / Unicode 字符当图标**:字符的字形由系统字体决定,不同字符
// 的视觉重量与基线各不相同,同一行里并排就会高低不齐、大小不一;跨平台与跨字体
// 渲染也不一致。更麻烦的是着色——字符走的是文字颜色,主题切换时与其余界面元素
// 的行为对不齐,而内联 SVG 用 currentColor 天然跟随。
//
// **新增图标的做法**:把图标库(Lucide)官方该图标的**内部元素**抄进来,套用下面的
// Icon 包装。不引第三方图标库运行时依赖,不整段贴 `<svg>` 标签,不在路径上写死颜色。
//
// 注:本仓库存量还有一批用字符充当图标的位置,它们不在本模块内,迁移另有专门任务。
import type { JSX, ReactNode } from 'react'

function Icon({
  children,
  size = 14,
  strokeWidth = 2
}: {
  children: ReactNode
  size?: number
  strokeWidth?: number
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Lucide chevron-down —— 下拉触发器的展开指示 */
export function ChevronDown({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size} strokeWidth={2.2}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

/** Lucide check —— 列表中当前选中项的标记 */
export function Check({ size }: { size?: number }): JSX.Element {
  return (
    <Icon size={size} strokeWidth={2.5}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}
