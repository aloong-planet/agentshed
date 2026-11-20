// What the cases on the Agents page's Skills section share (skill-install, agents-overview).
import type { Locator, Page } from '@playwright/test'

/** The global library's row of the skill named exactly `name` */
export const skillRow = (win: Page, name: string): Locator =>
  win.locator('.sk-card > .rel', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
