// Render-level probe of the settings prototype's update tooltip shadow after the 2026-10-28 ruling.
import { createRequire } from 'node:module'
const require = createRequire('/Users/loong_zhou/CascadeProjects/agentshed-session-resume/package.json')
const { chromium } = require('@playwright/test')
const url = 'file:///Users/loong_zhou/CascadeProjects/agentshed-session-resume/docs/prototypes/appearance/prototype-settings.html'
const browser = await chromium.launch({ channel: 'chrome' })
const out = {}
try {
  const page = await browser.newPage()
  await page.goto(url)
  for (const mode of ['light', 'dark']) {
    await page.evaluate((m) => document.documentElement.setAttribute('data-demo-mode', m), mode)
    out[mode] = await page.evaluate(() => getComputedStyle(document.getElementById('upTip')).boxShadow)
  }
} finally { await browser.close() }
console.log(JSON.stringify(out))
