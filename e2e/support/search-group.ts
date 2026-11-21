// What the cases on global search's results share (global-search, session-view).
import type { Page } from '@playwright/test'

export const searchGroup = (win: Page, title: string) => win.locator('.gsearch .grp', { has: win.locator('.gh .t', { hasText: title }) })
