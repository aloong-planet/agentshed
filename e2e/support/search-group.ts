// What the cases on global search's results share (global-search, session-view).
import type { Locator, Page } from '@playwright/test'

/** Global search's result group whose session title contains `title` */
export const searchGroup = (win: Page, title: string): Locator =>
  win.locator('.gsearch .grp', { has: win.locator('.gh .t', { hasText: title }) })
