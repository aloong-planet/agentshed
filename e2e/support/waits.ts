import { type Page } from '@playwright/test'

/** Waits for `n` scans to reach the page, counted from now: a change on disk is certainly in the second one */
export function scansLanded(win: Page, n: number): Promise<void> {
  return win.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0
        const off = (window as unknown as { agentshed: { onSnapshot: (cb: () => void) => () => void } }).agentshed.onSnapshot(() => {
          if (++seen === count) {
            off()
            resolve()
          }
        })
      }),
    n
  )
}

/**
 * Counts the error toasts that appear from now on, because a toast leaves after about 3 seconds and what is on screen does
 * not tell; each read returns how many appeared since the last. A read comes after the reads under way have landed: at a
 * zero fetch delay the main process answers in the order it was asked, so a call made now answers after any revalidation
 * before it, whose result then reaches the page's effects within a tick.
 */
export async function errorToastsAdded(win: Page): Promise<() => Promise<number>> {
  await win.waitForSelector('.toasts', { state: 'attached' })
  await win.evaluate(() => {
    const w = window as unknown as { errorToasts: number }
    w.errorToasts = 0
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('err')) w.errorToasts++
      }
    }).observe(document.querySelector('.toasts') as Element, { childList: true })
  })
  let read = 0
  return async () => {
    const total = await win.evaluate(async () => {
      const w = window as unknown as { errorToasts: number; agentshed: { getPrefs: () => Promise<unknown> } }
      await w.agentshed.getPrefs()
      await new Promise((resolve) => setTimeout(resolve, 100))
      return w.errorToasts
    })
    const added = total - read
    read = total
    return added
  }
}
