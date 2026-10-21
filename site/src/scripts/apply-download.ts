// Applies a download state's view to the page in place (landing-page::REQ-002, Failure A7): the hero's button, the
// pill on its platform line, the note or the link beneath it, and the download section's line and buttons. The page
// as served is the list state, and a later state replaces an earlier one entirely, back to that page included.
//
// Every label is set as text, never parsed as markup (landing-page Failure E1): only validated versions reach the
// labels, and this keeps it so whatever reaches them.
import type { DownloadLink, DownloadView } from '../download'

/** The served platform line and download icon, captured before the first change, so they can be put back */
const platformOf = new WeakMap<Element, string>()
const iconOf = new WeakMap<Element, Node>()

function setLink(a: Element, link: DownloadLink): void {
  a.setAttribute('href', link.href)
  if (link.newTab) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
  } else {
    a.removeAttribute('target')
    a.removeAttribute('rel')
  }
}

/** A button's label, kept after its icon */
function setLabel(a: Element, label: string): void {
  for (const node of [...a.childNodes]) if (node.nodeName.toLowerCase() !== 'svg') node.remove()
  a.append(label)
}

function pill(doc: Document, label: string): Element {
  const el = doc.createElement('span')
  el.className = 'pill'
  el.textContent = label
  return el
}

export function applyView(doc: Document, view: DownloadView): void {
  const cta = doc.querySelector('.hero .cta')
  const heroButton = cta?.querySelector('a.btn')
  const meta = cta?.querySelector('.meta')
  const line = doc.querySelector('#download h2 + p')
  const actions = doc.querySelector('#download .dl-actions')
  if (!cta || !heroButton || !meta || !line || !actions) return

  setLink(heroButton, view.hero)
  setLabel(heroButton, view.hero.label)

  if (!platformOf.has(meta)) platformOf.set(meta, meta.textContent?.trim() ?? '')
  const platform = platformOf.get(meta)!
  meta.replaceChildren(...(view.pill ? [pill(doc, view.pill), ' '] : []), platform)

  cta.querySelector('.beta-note')?.remove()
  cta.querySelector('.alt')?.remove()
  if (view.note) {
    const note = doc.createElement('div')
    note.className = 'beta-note'
    note.textContent = view.note
    cta.append(note)
  }
  if (view.every) {
    const alt = doc.createElement('div')
    alt.className = 'alt'
    const a = doc.createElement('a')
    setLink(a, view.every)
    a.textContent = view.every.label
    alt.append(a)
    cta.append(alt)
  }

  line.replaceChildren(...(view.section.pill ? [pill(doc, view.section.pill), ' '] : []), view.section.line)

  const served = actions.querySelector('a.btn-primary svg')
  if (!iconOf.has(actions) && served) iconOf.set(actions, served.cloneNode(true))
  const icon = iconOf.get(actions)
  actions.replaceChildren(
    ...view.section.buttons.map((b) => {
      const a = doc.createElement('a')
      a.className = `btn ${b.kind === 'ghost' ? 'btn-ghost' : 'btn-primary'} btn-sm`
      if (b.kind === 'primary' && icon) a.append(icon.cloneNode(true))
      a.append(b.label)
      setLink(a, b)
      return a
    })
  )
}
