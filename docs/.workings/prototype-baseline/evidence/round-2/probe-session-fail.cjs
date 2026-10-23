// #250 item 5 probe: a failed turn on the session prototype keeps its error through every redraw.
// Usage: node probe-session-fail.cjs <prototypes root>   (exit 1 when any check fails)
const { chromium } = require('/Users/loong_zhou/CascadeProjects/agentshed-wt/proto-fixes/node_modules/@playwright/test');
const ROOT = process.argv[2].replace(/\/$/, '') + '/';
const PAGE = 'file://' + ROOT + 'session-view/prototype-session.html';
const GALLERY = 'file://' + ROOT + 'index.html';
const FAIL_EN = 'could not be fetched', FAIL_ZH = '\u53D6\u4E0D\u56DE\u6765';   // "\u53D6\u4E0D\u56DE\u6765"
const FETCHED_EN = 'Fetched on demand', FETCHED_ZH = '\u6309\u9700\u53D6\u56DE'; // "\u6309\u9700\u53D6\u56DE"
let failed = 0;
const short = (t) => t ? JSON.stringify({ on: t.on, head: t.text.slice(0, 70), tail: t.text.slice(-60) }) : 'null';
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };

async function turnText(page, i) {
  return page.evaluate((i) => {
    const box = document.querySelector(`[data-turn="${i}"]`);
    return box ? { on: box.classList.contains('on'), text: box.innerText.replace(/\s+/g, ' ') } : null;
  }, i);
}
const isError = (t, lang) => !!t && t.on && t.text.includes(lang === 'zh' ? FAIL_ZH : FAIL_EN) &&
  !t.text.includes(FETCHED_EN) && !t.text.includes(FETCHED_ZH);
const isContent = (t) => !!t && t.on && (t.text.includes(FETCHED_EN) || t.text.includes(FETCHED_ZH)) &&
  !t.text.includes(FAIL_EN) && !t.text.includes(FAIL_ZH);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  // A. Single-turn failure, then each redraw
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('A: ' + e));
    await page.goto(PAGE); await page.waitForTimeout(500);
    await page.click('[data-demo-harness] [data-fs="error"]');
    await page.click('.q[data-q="0"]'); await page.waitForTimeout(500);
    let t = await turnText(page, 0);
    check('A1 failed turn shows its error', isError(t, 'en'), short(t));
    await page.click('#qorder [data-o="asc"]'); await page.waitForTimeout(100);
    t = await turnText(page, 0);
    check('A2 after sort: still the error', isError(t, 'en'), short(t));
    await page.click('#foldall'); await page.waitForTimeout(100);
    await page.click('#foldall'); await page.waitForTimeout(100);
    t = await turnText(page, 0);
    check('A3 after collapse all + expand all: still the error', isError(t, 'en'), short(t));
    // A language change made where the reader makes it: the gallery (a data-settings writer) in another tab
    const gallery = await ctx.newPage();
    gallery.on('pageerror', (e) => errors.push('A gallery: ' + e));
    await gallery.goto(GALLERY); await gallery.waitForTimeout(300);
    await gallery.evaluate(() => DemoDimensions.set({ language: 'zh' }));
    await page.waitForTimeout(300);
    t = await turnText(page, 0);
    check('A4 after a language change: still the error, now in Chinese', isError(t, 'zh'), short(t));
    // B. Retry: collapse, the fetch now succeeds, expand again
    await page.click('[data-demo-harness] [data-fs="ok"]');
    await page.click('.q[data-q="0"]'); await page.click('.q[data-q="0"]'); await page.waitForTimeout(500);
    t = await turnText(page, 0);
    check('B1 retry after the failure: the content', isContent(t), short(t));
    await page.click('#qorder [data-o="desc"]'); await page.waitForTimeout(100);
    t = await turnText(page, 0);
    check('B2 after sort: still the content', isContent(t), short(t));
    await ctx.close();
  }

  // C. A turn fetched with the index ready keeps its content through a redraw (unchanged behaviour)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('C: ' + e));
    await page.goto(PAGE); await page.waitForTimeout(500);
    await page.click('.q[data-q="0"]'); await page.waitForTimeout(500);
    let t = await turnText(page, 0);
    check('C1 fetched turn shows its content', isContent(t), short(t));
    await page.click('#qorder [data-o="asc"]'); await page.waitForTimeout(100);
    t = await turnText(page, 0);
    check('C2 after sort: still the content', isContent(t), short(t));
    // A data-set switch clears the expanded turns
    await page.click('[data-demo-harness] [data-ds="codex"]'); await page.waitForTimeout(100);
    t = await turnText(page, 0);
    check('C3 after switching the session: nothing expanded', !!t && !t.on, short(t));
    await ctx.close();
  }

  // D. A redraw while the fetch runs: the in-progress line stays, and the outcome lands in the redrawn box
  for (const [fs, wait, want, label] of [
    ['error', 500, (t) => isError(t, 'en'), 'the error'],
    ['ok', 500, isContent, 'the content'],
    ['stale', 1100, isContent, 'the content'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('D ' + fs + ': ' + e));
    await page.goto(PAGE); await page.waitForTimeout(500);
    await page.click(`[data-demo-harness] [data-fs="${fs}"]`);
    await page.click('.q[data-q="0"]');
    await page.click('#qorder [data-o="asc"]');
    let t = await turnText(page, 0);
    const inProgress = fs === 'stale' ? 'rebuilding the index' : 'Fetching';
    check(`D ${fs}: redrawn during the fetch, still in progress`, !!t && t.on && t.text.includes(inProgress) &&
      !t.text.includes(FETCHED_EN) && !t.text.includes(FAIL_EN), short(t));
    await page.waitForTimeout(wait);
    t = await turnText(page, 0);
    check(`D ${fs}: the outcome lands in the redrawn box — ${label}`, want(t), short(t));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
