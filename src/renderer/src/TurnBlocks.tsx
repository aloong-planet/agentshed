// 轮内块渲染(票 07):TurnBlock → 原型确认的块形态(2026-08-02 原型 + 2026-08-06
// unknown 留痕回补)。工具/思考/推理/subagent 默认折叠成一行头,点开看全文;
// 不可还原处(推理密文、截断工具结果、不可归位的子线程)一律 warn 显式标注,不静默。
import { useState } from 'react'
import type { TurnBlock } from '@shared/domain'

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
  switch (b.kind) {
    case 'text':
      return <div className="ans">{b.body}</div>
    case 'think':
      return (
        <Fold cls="think" icon="💭" nm="思考" sum={`${[...b.body].length} 字 · 明文可得`}>
          <div className="tk">{b.body}</div>
        </Fold>
      )
    case 'reason':
      return (
        <Fold cls="think" icon="💭" nm="推理" sum={`仅 ${b.titles.length} 条小标题 · 正文不可得`}>
          <div className="warn">
            Codex 的推理正文是 <code>encrypted_content</code>,<b>永远拿不到</b>
            。下面是记录里仅有的明文小标题——与 Claude 侧的明文思考<b>不对等</b>,不假装一致。
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
        <Fold cls="" icon="🔧" nm={b.name} sum={b.summary}>
          <div className="lb">入参</div>
          <pre>{b.input || '(空)'}</pre>
          <div className="lb">返回</div>
          {b.output === null ? <div className="mnote">(无返回记录)</div> : <pre>{b.output}</pre>}
          {b.truncated && (
            <div className="warn">
              返回超过 agent 的单条上限,transcript 里<b>只存了截断版</b>;原文旁挂在{' '}
              <code>tool-results/</code> 下(路径见上文),本产品不读它——这里展示的就是截断版,不谎称完整。
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
          sum={b.result !== null ? firstLine(b.result) : `${b.steps.length} 步 · 未返回`}
        >
          <div className="lb">派发 prompt</div>
          <pre>{b.prompt || '(空)'}</pre>
          {b.steps.length > 0 ? (
            <>
              <div className="lb">内部步骤</div>
              {b.steps.map((s, i) => (
                <div className="step" key={i}>
                  <span className="sn">{i + 1}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="warn">
              这次派发的内部步骤在记录中<b>没有稳定引用链</b>可归位到此处(两侧实测皆然)
              ——未展示,不做猜测性配对;完整转写在其独立文件中(如有)。
            </div>
          )}
          <div className="lb">返回主会话</div>
          {b.result === null ? <div className="mnote">(未返回)</div> : <pre>{b.result}</pre>}
        </Fold>
      )
    case 'unknown':
      return (
        <div className="unknown">
          ▧ 本轮有 <b>{b.count} 条未识别记录</b>(类型:{b.types.join('、')}
          )——原样保留在源文件中,未渲染。这通常意味着 agent 更新引入了新记录类型。
        </div>
      )
  }
}
