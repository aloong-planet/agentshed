// 富文本文案的渲染(票 09)。
//
// **为什么需要它**:会话页与轮内块里有十几条带内嵌强调的说明,而强调承载的是**警告语义**
// (「永远拿不到」「可能多剥或少剥」「只存了截断版」),不是装饰。两条既有约束把常规做法堵死了:
//   ① 本 feature 约定「富文本不得拆成碎片 key 拼接」——各语言语序不同,拼接必错;
//   ② ADR-0014 定下文案层是纯数据 + 纯函数、**不依赖 React**,故字典条目不能返回 ReactNode。
//
// 解法是让字典仍存**一条完整的纯字符串**,用两个轻量标记承载强调,由本组件在渲染时解析:
//   `**粗体**`  →  <b>
//   `` `代码` ``  →  <code>
// 一句话一个 key,六语各自完整,标记位置随各语言语序自然移动——这正是碎片 key 做不到的。
//
// 刻意**不**支持嵌套与链接:本用途只需要这两种,支持更多等于在这里养一个 markdown 实现,
// 而渲染 agent 生成内容自有既有的 markdown 通路(那条有消毒,这条没有,别混用)。
import type { JSX } from 'react'

/** 按 `**粗体**` 与 `` `代码` `` 切段;两者不嵌套,先到先得 */
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g

export function RichText({ text }: { text: string }): JSX.Element {
  const parts = text.split(TOKEN).filter((p) => p !== '')
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
