// Acceptance for #98: plugin rows in the prototype now expand and preview on equal footing with
// on-disk ones (ADR-0012), while still having no install/uninstall buttons — ADR-0012 overturned the
// preview exclusion, it did not touch ADR-0004's G3.
//
// Every judgement is made against what is rendered, never against the source.
import { chromium } from '@playwright/test'

const URL =
  'file:///Users/loong_zhou/CascadeProjects/agentshed/docs/prototypes/skills-view/prototype-skills-preview.html'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
await page.goto(URL)
await page.waitForSelector('#global .sk')

const ok = []
const fail = []
const check = (n, c, d = '') => (c ? ok : fail).push(`${n}${d ? ` — ${d}` : ''}`)
const row = (text) => page.locator('#global .sk', { hasText: text }).first()

// ── A plugin row that has a package: equal footing with an on-disk row ──
const plug = row('superpowers:brainstorming')
check(
  'plugin row shows inline package stats, like an on-disk row',
  (await plug.locator('.sk-meta').count()) === 1,
  await plug.locator('.sk-meta').textContent().catch(() => '(none)')
)
check('plugin row carries the expand arrow, not the inert dot', (await plug.locator('.chev').textContent()) === '▸')
check('plugin row still has no install/uninstall button (ADR-0004 G3)', (await plug.locator('.ins').count()) === 0)

await plug.locator('.sk-head').click()
// The steps below all assume the row opened. Without this guard, a row that does not open leaves the
// click waiting out its full timeout and throwing — and then not one line of the report is printed,
// which is barely better than not checking at all.
const expanded = (await plug.locator('.files-card').count()) === 1
check('clicking a plugin row expands its file table', expanded)
if (expanded) {
  const files = await plug.locator('.files button .path').allTextContents()
  check('the file table lists the package contents', files.includes('SKILL.md'), files.join(', '))

  await plug.locator('.files button', { hasText: 'SKILL.md' }).click()
  await page.waitForSelector('.drawer')
  const drawerText = await page.locator('.drawer').textContent()
  // Asserted against the frontmatter description, which appears nowhere else on the page — the skill
  // name would also match the row itself and prove nothing about the drawer's contents
  check(
    'clicking a file opens the drawer on that package',
    drawerText.includes('Ask before acting'),
    drawerText.slice(0, 60).replace(/\s+/g, ' ')
  )
  await page.locator('.mask').click({ position: { x: 10, y: 10 } })
  await plug.locator('.sk-head').click() // collapse, so it does not disturb the locators below
} else {
  fail.push('file table and drawer checks skipped — the row never opened, so their premise fails')
}

// ── A plugin row with no package: fail-closed, not expandable ──
const noPkg = row('an-absurdly-long')
check('a package-less plugin row shows the inert dot', (await noPkg.locator('.chev').textContent()) === '·')
check('a package-less plugin row shows no stats', (await noPkg.locator('.sk-meta').count()) === 0)
await noPkg.locator('.sk-head').click()
check('a package-less plugin row does not open when clicked', !(await noPkg.getAttribute('class')).includes('open'))

// ── On-disk rows unaffected ──
const disk = row('github-ops')
check('on-disk row keeps its install button', (await disk.locator('.ins').count()) >= 1)
check('on-disk row still expands', (await disk.locator('.chev').textContent()) === '▸')

console.log(`passed ${ok.length}:`)
ok.forEach((l) => console.log('  ✓', l))
if (fail.length) {
  console.log(`\nfailed ${fail.length}:`)
  fail.forEach((l) => console.log('  ✗', l))
}
if (pageErrors.length) {
  console.log('\npage errors:')
  pageErrors.forEach((e) => console.log('  !', e))
}
await browser.close()
process.exit(fail.length || pageErrors.length ? 1 : 0)
