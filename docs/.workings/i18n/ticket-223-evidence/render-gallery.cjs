// Render evidence for agentshed#223: open the gallery shell under file://, read its chrome strings, and open
// every manifest entry, checking that each iframe actually loads its page.
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('/Users/loong_zhou/CascadeProjects/agentshed/node_modules/@playwright/test')

const ROOT = '/Users/loong_zhou/CascadeProjects/agentshed/docs/prototypes'
const OUT = process.argv[2]

;(async () => {
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome' })
  } catch {
    browser = await chromium.launch()
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('file://' + path.join(ROOT, 'index.html'))

  const P = await page.evaluate(() => window.PROTOTYPES.map((p) => ({ module: p.module, id: p.id, path: p.path })))
  const chrome = await page.evaluate(() => ({
    foldTitle: document.querySelector('.fold-btn').title,
    unfoldTitle: document.querySelector('.unfold').title,
    items: document.querySelectorAll('.item').length,
    groups: [...document.querySelectorAll('.grp')].map((g) => g.textContent)
  }))
  console.log('manifest entries:', P.length, '| sidebar items:', chrome.items, '| groups:', chrome.groups.join(', '))
  console.log('fold title:', JSON.stringify(chrome.foldTitle), '| unfold title:', JSON.stringify(chrome.unfoldTitle))
  await page.screenshot({ path: path.join(OUT, 'gallery-first-entry.png') })

  // Every entry: navigate by hash, then wait for the iframe's own document to finish loading
  let opened = 0
  for (const p of P) {
    const key = `${p.module}/${p.id}`
    await page.evaluate((k) => { location.hash = k }, key)
    const handle = await page.waitForSelector(`iframe[src="${p.path}"]`, { timeout: 5000 })
    const frame = await handle.contentFrame()
    await frame.waitForLoadState('load')
    const onDisk = fs.existsSync(path.join(ROOT, p.path))
    const bodyLen = await frame.evaluate(() => document.body ? document.body.innerText.length : 0)
    const selected = await page.evaluate(() => document.querySelector('.item.on')?.dataset.key)
    const ok = onDisk && bodyLen > 0 && selected === key
    if (ok) opened++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${key} -> ${p.path} (on disk: ${onDisk}, body text: ${bodyLen}, selected: ${selected})`)
  }
  console.log(`opened ${opened} / ${P.length}`)

  // Empty state: a hash naming no prototype
  await page.evaluate(() => { location.hash = 'no/such-prototype' })
  await page.waitForSelector('.stage .empty')
  console.log('empty text:', JSON.stringify(await page.textContent('.stage .empty')))
  await page.screenshot({ path: path.join(OUT, 'gallery-empty.png') })

  // Folded: the expand button replaces the sidebar
  await page.keyboard.press('s')
  await page.waitForSelector('.unfold', { state: 'visible' })
  console.log('folded; unfold button text:', JSON.stringify(await page.textContent('.unfold')))
  await page.screenshot({ path: path.join(OUT, 'gallery-folded.png') })
  await page.keyboard.press('s')

  console.log('page errors:', errors.length ? errors : 'none')
  await browser.close()
})()
