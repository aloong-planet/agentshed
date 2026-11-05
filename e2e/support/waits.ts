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
