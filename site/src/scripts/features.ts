// The features section's behaviour (landing-page::REQ-004), as in the confirmed prototype.
//
// On a wide screen the frame shows the step whose text sits nearest the frame's middle, recomputed on every
// scroll and resize (at most once per animation frame). Clicking a step, or pressing Enter on it (it is a
// button), scrolls it level with the frame's middle; the scroll then switches the screenshot. Below 760px the
// frame is not displayed and none of this applies: each step shows its own screenshot.

/** The frame, or null while it is not displayed (narrow screens) */
function framePanel(): HTMLElement | null {
  const panel = document.querySelector<HTMLElement>('.fs-panel')
  return panel && getComputedStyle(panel).display !== 'none' ? panel : null
}

const items = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.fs-item')]

/** The current step's index */
export function currentStep(): number {
  return Math.max(0, items().findIndex((b) => b.classList.contains('on')))
}

/** Make step i the current one: its accent bar, and its screenshot in the frame */
export function showStep(i: number): void {
  items().forEach((b, j) => b.classList.toggle('on', j === i))
  document.querySelectorAll('.fs-stack img').forEach((img, j) => img.classList.toggle('on', j === i))
}

/** Show the step whose text sits nearest the frame's middle */
export function syncStep(): void {
  const panel = framePanel()
  if (!panel) return
  const r = panel.getBoundingClientRect()
  const middle = r.top + r.height / 2
  let best = currentStep()
  let distance = Infinity
  items().forEach((b, i) => {
    const br = b.getBoundingClientRect()
    const d = Math.abs(br.top + br.height / 2 - middle)
    if (d < distance) {
      distance = d
      best = i
    }
  })
  if (best !== currentStep()) showStep(best)
}

export function initFeatures(): void {
  let ticking = false
  const onScroll = (): void => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      syncStep()
    })
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll)

  document.querySelector('.fs-list')?.addEventListener('click', (e) => {
    const item = (e.target as Element).closest('.fs-item')
    const panel = framePanel()
    if (!item || !panel) return
    // The frame's middle where it sticks, not where it happens to be while the section scrolls into view
    const middle = parseFloat(getComputedStyle(panel).top) + panel.offsetHeight / 2
    const r = item.getBoundingClientRect()
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollTo({ top: scrollY + r.top + r.height / 2 - middle, behavior: smooth ? 'smooth' : 'auto' })
  })

  syncStep()
}
