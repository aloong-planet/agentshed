// What the cases that pick a project in the Projects page's list share (global-search, project-detail).
import type { Page } from '@playwright/test'

export const projectRow = (win: Page, name: string) => win.locator('.side .row', { hasText: name })
