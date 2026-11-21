// What the cases that switch a page's tabs share (agents-overview, memory-view, plugins-view, projects-list,
// skill-install).
import type { Locator, Page } from '@playwright/test'

/** The tab in the page header's tab row whose text contains `label` */
export const paneTab = (win: Page, label: string): Locator => win.locator('.pane-head .tabs .tab', { hasText: label })
