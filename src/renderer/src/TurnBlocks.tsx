// 轮内块渲染(票 07):TurnBlock → 原型确认的块形态(2026-08-02 原型 + 2026-08-06
// unknown 留痕回补)。工具/思考/推理/subagent 默认折叠成一行头,点开看全文;
// 不可还原处(推理密文、截断工具结果、不可归位的子线程)一律 warn 显式标注,不静默。
import { useState } from 'react'
import type { TurnBlock } from '@shared/domain'
import { useDict } from './language'
import { RichText } from './RichText'

function firstLine(s: string, max = 72): string {
  const t = s.split('\n')[0].trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** 可折叠块骨架(原型 .blk/.bh/.bb):头部一行,点开出正文 */
function Fold({
  cls,
  icon,
  nm,
  sum,
  children
}: {
  cls: string
  icon: string
  nm: string
  sum: string
  children: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className={`blk ${cls}${open ? ' open' : ''}`}>
      <div className="bh" onClick={() => setOpen(!open)}>
        <i className="cv">{open ? '▾' : '▸'}</i>
        <span aria-hidden>{icon}</span>
        <span className="nm">{nm}</span>
        <span className="sum">{sum}</span>
      </div>
      {open && <div className="bb">{children}</div>}
    </div>
  )
}

export function BlockView({ b }: { b: TurnBlock }): JSX.Element {
  const t = useDict()
  switch (b.kind) {
    case 'text':
      return <div className="ans">{b.body}</div>
    case 'think':
      return (
        <Fold cls="think" icon="💭" nm={t.turn.thinking} sum={t.turn.thinkingSum([...b.body].length)}>
          <div className="tk">{b.body}</div>
        </Fold>
      )
    case 'reason':
      return (
        <Fold cls="think" icon="💭" nm={t.turn.reasoning} sum={t.turn.reasoningSum(b.titles.length)}>
          <div className="warn">
            <RichText text={t.turn.reasoningNote} />
          </div>
          {b.titles.map((t, i) => (
            <div className="rt" key={i}>
              {t}
            </div>
          ))}
        </Fold>
      )
    case 'tool':
      return (
        <Fold cls="" icon="🔧" nm={b.name ?? t.placeholder.unknownTool} sum={b.summary}>
          <div className="lb">{t.turn.input}</div>
          <pre>{b.input || t.turn.empty}</pre>
          <div className="lb">{t.turn.output}</div>
          {b.output === null ? <div className="mnote">{t.turn.noOutput}</div> : <pre>{b.output}</pre>}
          {b.truncated && (
            <div className="warn">
              <RichText text={t.turn.truncatedNote} />
            </div>
          )}
        </Fold>
      )
    case 'sub':
      return (
        <Fold
          cls="sub"
          icon="🤖"
          nm={`subagent · ${b.name}`}
          sum={b.result !== null ? firstLine(b.result) : t.turn.subSteps(b.steps.length)}
        >
          <div className="lb">{t.turn.dispatchPrompt}</div>
          <pre>{b.prompt || t.turn.empty}</pre>
          {b.steps.length > 0 ? (
            <>
              <div className="lb">{t.turn.innerSteps}</div>
              {b.steps.map((s, i) => (
                <div className="step" key={i}>
                  <span className="sn">{i + 1}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="warn">
              <RichText text={t.turn.unlinkedNote} />
            </div>
          )}
          <div className="lb">{t.turn.backToMain}</div>
          {b.result === null ? <div className="mnote">{t.turn.noReturn}</div> : <pre>{b.result}</pre>}
        </Fold>
      )
    case 'unknown':
      return (
        <div className="unknown">
          <RichText text={t.turn.unknownRecords(b.count, b.types.join(t.turn.typeSeparator))} />
        </div>
      )
  }
}
