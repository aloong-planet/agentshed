// What the cases that switch a page's tabs share (agents-overview, memory-view, plugins-view, projects-list,
// skill-install).
import type { Page } from '@playwright/test'

export const paneTab = (win: Page, label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })
