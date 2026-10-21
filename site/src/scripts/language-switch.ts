// Switching language keeps the current step and the scroll position (landing-page::REQ-004/AC-07).
//
// The two languages are two pages, so the toggle is a plain link and works without this script. With it,
// a click on the other language first notes where the visitor is: the element they are looking at and how
// far it sits from the top of the viewport, and the current step. The other page, once loaded, scrolls the
// same element to the same distance. An element rather than a scroll offset, because the two languages'
// texts wrap differently and the same offset lands somewhere else on the other page. The note lives in
// session storage for a few seconds only, and only the page it names reads it.
import { currentStep, showStep, syncStep } from './features'

const KEY = 'agentshed:language-switch'
const FRESH_MS = 10_000

interface Place {
  /** The page the note is for */
  to: string
  /** The anchor element's key (see anchors()) */
  anchor: string
  /** Its distance from the viewport's top, in CSS pixels */
  top: number
  step: number
  at: number
}

/** The elements a place is noted against, each under a key both pages share, innermost last */
function anchors(): [string, HTMLElement][] {
  const sections = [...document.querySelectorAll<HTMLElement>('main > [id], body > footer')].map(
    (el): [string, HTMLElement] => [el.id ? `#${el.id}` : 'footer', el]
  )
  const steps = [...document.querySelectorAll<HTMLElement>('.fs-step')].map((el, i): [string, HTMLElement] => [
    `step:${i}`,
    el
  ])
  return [...sections, ...steps]
}

/** The element the visitor is looking at: the current step while the frame shows it, else the innermost
 *  element across the viewport's middle */
function lookedAt(): [string, HTMLElement] | undefined {
  const all = anchors()
  const frame = document.querySelector<HTMLElement>('.fs-panel')
  const step = all.find(([key]) => key === `step:${currentStep()}`)
  if (frame && getComputedStyle(frame).display !== 'none' && step) {
    const r = step[1].getBoundingClientRect()
    if (r.bottom > 0 && r.top < innerHeight) return step
  }
  const middle = innerHeight / 2
  return all.filter(([, el]) => {
    const r = el.getBoundingClientRect()
    return r.top <= middle && r.bottom > middle
  }).pop()
}

function note(to: string): void {
  const here = lookedAt()
  if (!here) return
  const place: Place = { to, anchor: here[0], top: here[1].getBoundingClientRect().top, step: currentStep(), at: Date.now() }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(place))
  } catch {
    // No storage (private mode, blocked): the link still switches, from the top of the other page
  }
}

function restore(): void {
  let place: Place | undefined
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    place = raw ? (JSON.parse(raw) as Place) : undefined
  } catch {
    return
  }
  if (!place || Date.now() - place.at > FRESH_MS) return
  if (new URL(place.to, location.href).pathname !== location.pathname) return
  const el = anchors().find(([key]) => key === place.anchor)?.[1]
  if (!el) return
  scrollTo({ top: scrollY + el.getBoundingClientRect().top - place.top, behavior: 'instant' })
  showStep(place.step)
  syncStep()
}

export function initLanguageSwitch(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-switch-language]').forEach((a) => {
    a.addEventListener('click', (e) => {
      // A click that opens another tab or window leaves this page where it is
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      note(a.href)
    })
  })
  restore()
}
