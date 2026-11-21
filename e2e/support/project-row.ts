// What the cases that pick a project in the Projects page's list share (global-search, project-detail).
import type { Locator, Page } from '@playwright/test'

/** The Projects page's list row whose text contains `name` */
export const projectRow = (win: Page, name: string): Locator => win.locator('.side .row', { hasText: name })
