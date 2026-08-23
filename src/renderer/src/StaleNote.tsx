// The stale note page's card (spec project-detail sequence S): the product's stance is hint only,
// never operate — Agentshed never writes to any agent's registry; the card explains why the project
// is stale and hands the user one agent-agnostic line to send to each recording agent.
//
// The `{sides}` slot: a dictionary entry stays one complete string per language (the RichText rule),
// and the chip nodes are spliced in at the slot so the chips travel with each language's word order.
import { useState } from 'react'
import type { ProjectEntry } from '@shared/domain'
import { SIDE_BADGE, SIDE_CHIP_LABEL, SIDE_ORDER } from './side-badge'
import { Copy } from './icons'
import { toast } from './Toast'
import { useDict } from './language'

/** Splice the side chips into a sentence at its `{sides}` slot */
function WithSides({ text, chips }: { text: string; chips: JSX.Element }): JSX.Element {
  const [pre, post] = text.split('{sides}')
  return (
    <>
      {pre}
      {chips}
      {post ?? ''}
    </>
  )
}

export function StaleNote({ entry }: { entry: ProjectEntry }): JSX.Element {
  const t = useDict()
  const [copied, setCopied] = useState(false)
  const sides = SIDE_ORDER.filter((s) => entry.sides.includes(s))
  const chips = (
    <>
      {sides.map((s, i) => (
        <span key={s}>
          {i > 0 && ' · '}
          <span className={`badge ${SIDE_BADGE[s].cls}`}>{SIDE_CHIP_LABEL[s]}</span>
        </span>
      ))}
    </>
  )
  const prompt = t.detail.stalePrompt(entry.path)
  const onCopy = (): void => {
    window.agentshed.copyText(prompt).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => toast('err', t.detail.staleCopyFailed)
    )
  }
  return (
    <div className="stale-note">
      <div className="sn-cause">
        <WithSides text={t.detail.staleCause(sides.length)} chips={chips} />
      </div>
      <div className="sn-fx">{t.detail.staleFx}</div>
      <div className="sn-send">
        <WithSides text={t.detail.staleSend} chips={chips} />
      </div>
      <div className="sn-line">
        <span className="code">{prompt}</span>
        <button type="button" className="cpy" onClick={onCopy} title={t.detail.staleCopy}>
          <Copy size={12} />
        </button>
        <span className={`copied ${copied ? 'on' : ''}`}>{t.detail.staleCopied}</span>
      </div>
    </div>
  )
}
