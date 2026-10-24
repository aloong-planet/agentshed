// #250 items 1–3, 6, 8, 9 and "Done when"; #226's driving-panel checks. Every touched page alone and in the gallery.
// Usage: node verify-pages.cjs <prototypes root>   (exit 1 when any check fails)
// Gap: the logic modules' unknown-event reason ("unknown event") has no button that reaches it, so no check here
// drives it; it is checked by the diff against the prototype skill's logic-template.js. Test it here if a logic page
// gains a button whose event has no reducer case.
// Gap: the logic pages' empty-diagram notice ("No diagram source: ...") renders only when a page has no diagram source,
// so no check here reaches it; it is checked by the diff against logic-page-template.html. It renders on a copy of a
// logic page without its model.mmd.js, where it can be tested.
const { chromium } = require('/Users/loong_zhou/CascadeProjects/agentshed-wt/proto-fixes/node_modules/@playwright/test');
const ROOT = process.argv[2].replace(/\/$/, '') + '/';
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + detail : ''}`); if (!ok) failed++; };

const UI = [
  ['agents-page/agents', 'agents-page/prototype-agents.html'],
  ['project-detail/detail', 'project-detail/prototype-detail.html'],
  ['project-detail/detail-stale-note', 'project-detail/prototype-detail-stale-note.html'],
  ['session-view/session', 'session-view/prototype-session.html'],
  ['skill-install/install', 'skill-install/prototype-install.html'],
  ['skills-view/skills-preview', 'skills-view/prototype-skills-preview.html'],
  ['plugins-view/plugin-skill-preview', 'plugins-view/prototype-plugin-skill-preview.html'],
  ['global-search/search', 'global-search/prototype-search.html'],
];
const LOGIC = [
  ['project-list/visibility', 'project-list/visibility/index.html', 1],
  ['skill-install/install-flow', 'skill-install/install-flow/index.html', 1],
  ['token-stats/scan-cache', 'token-stats/scan-cache/index.html', 2],
];

async function open(browser, route, file, inGallery) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [], consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  if (inGallery) {
    await page.goto('file://' + ROOT + 'index.html#' + route);
    await page.waitForTimeout(1200);
    const frame = page.frames().find((f) => f.url().endsWith(file));
    return { ctx, page, target: frame, errors, consoleErrors };
  }
  await page.goto('file://' + ROOT + file);
  await page.waitForTimeout(900);
  return { ctx, page, target: page, errors, consoleErrors };
}

async function driveLogic(t, diagrams, where) {
  const q = (fn, ...a) => t.evaluate(fn, ...a);
  const receipt = () => q(() => document.getElementById('v-illegal').textContent.trim());
  check(`${where}: diagrams rendered as svg`, (await q(() => document.querySelectorAll('.dg svg').length)) === diagrams);
  check(`${where}: drive heading`, (await q(() => [...document.querySelectorAll('h4')].map((h) => h.textContent).join('|')))
    .includes('Drive it yourself (click buttons to drive the state machine)'));
  check(`${where}: empty-state receipt`, (await receipt()) === 'Empty state: click an entry button to start', await receipt());
  check(`${where}: reset button`, (await q(() => document.getElementById('btn-reset').textContent)) === '↺ Reset');
  check(`${where}: stress label`, (await q(() => document.querySelector('.stress span').textContent))
    .startsWith('Stress mode: lift the greying and allow forcing illegal events'));
  check(`${where}: hint`, (await q(() => document.querySelector('.drive .hint').textContent))
    .startsWith('Button availability is derived from the model by legal(state)'));
  // Entry: the first entry button
  await t.click('[data-new]');
  check(`${where}: after entry, no event dispatched yet`, (await receipt()) === 'No event dispatched yet', await receipt());
  const status = await q(() => document.getElementById('v-status').textContent);
  check(`${where}: after entry, a status`, status !== '—', status);
  const highlighted = await q(() => document.querySelectorAll('.dg svg g.node.cur').length);
  check(`${where}: the current state highlighted on a diagram`, highlighted >= 1, highlighted);
  // Every entry button, from the empty state and again after an event: each starts its own entry (a status of its
  // own) and clears the receipt
  const entries = await q(() => [...document.querySelectorAll('[data-new]')].map((b) => b.dataset.new));
  const entryStatus = [];
  const statusNow = () => q(() => document.getElementById('v-status').textContent);
  for (const e of entries) {
    await t.click('#btn-reset');
    await t.click(`[data-new="${e}"]`);
    const st = await statusNow();
    const rc = await receipt();
    entryStatus.push(st);
    check(`${where}: entry button "${e}" from the empty state: a status, no event dispatched yet`, st !== '—' && rc === 'No event dispatched yet', `${st} | ${rc}`);
    const ev = await q(() => document.querySelector('[data-act][aria-disabled="false"]')?.dataset.act);
    if (ev) await t.click(`[data-act="${ev}"]`);
    const mid = await receipt();
    await t.click(`[data-new="${e}"]`);
    const again = await receipt();
    const st2 = await statusNow();
    check(`${where}: entry button "${e}" after an event: back to its entry, receipt cleared`,
      !!ev && mid.startsWith('Dispatched ') && again === 'No event dispatched yet' && st2 === st, `${ev} | ${mid} | ${again} | ${st2}`);
  }
  check(`${where}: each entry button gives its own status`, entries.length >= 2 && new Set(entryStatus).size === entries.length, JSON.stringify(entryStatus));
  await t.click('[data-new]');   // back to the first entry for the checks below
  // A greyed-out event: the unreachable tooltip; stress mode lifts it with the forced prefix
  const grey = await q(() => { const b = document.querySelector('[data-act][aria-disabled="true"]'); return b && { act: b.dataset.act, tip: b.dataset.tip }; });
  check(`${where}: an unreachable event carries the Unreachable prefix`, !!grey && grey.tip.startsWith('Unreachable: '), JSON.stringify(grey));
  await t.click('#stress');
  const forced = grey && await q((act) => { const b = document.querySelector(`[data-act="${act}"]`); return { dis: b.getAttribute('aria-disabled'), tip: b.dataset.tip }; }, grey.act);
  check(`${where}: stress mode lifts it, forced prefix`, !!forced && forced.dis === 'false' && forced.tip.startsWith('Stress: forced dispatch — '), JSON.stringify(forced));
  // The reason in a tooltip is the reducer's rejection with its "<event> ignored: " prefix stripped by legal()
  check(`${where}: the tooltip's reason carries no rejection prefix`, !!grey && !/ ignored: |\u88AB\u5FFD\u7565/.test(grey.tip), JSON.stringify(grey));
  // Forcing it: the reducer rejects it, and the receipt shows the rejection in red
  if (grey) await t.click(`[data-act="${grey.act}"]`);
  const forcedReceipt = await q(() => { const e = document.getElementById('v-illegal'); return { cls: e.className, text: e.textContent.trim() }; });
  check(`${where}: a forced illegal event's receipt`, !!grey && forcedReceipt.cls === 'illegal bad' &&
    forcedReceipt.text.startsWith('⚠ ' + grey.act + ' ignored: ') && forcedReceipt.text.endsWith(grey.tip.replace('Unreachable: ', '')), JSON.stringify(forcedReceipt));
  await t.click('#stress');
  // A legal event: the dispatch receipt
  const legal = await q(() => document.querySelector('[data-act][aria-disabled="false"]')?.dataset.act);
  await t.click(`[data-act="${legal}"]`);
  const r = await receipt();
  check(`${where}: a legal event's receipt`, r.startsWith('Dispatched ' + legal + ' → '), r);
  // Reset
  await t.click('#btn-reset');
  check(`${where}: reset returns to the empty state`, (await receipt()) === 'Empty state: click an entry button to start', await receipt());
  // Reset view: pan the first canvas, then the button puts it back
  const rst = await q(() => { const b = document.querySelector('.dg .rst'); return b && b.title; });
  check(`${where}: reset-view title`, rst === 'Reset view (same as double-clicking the canvas)', rst);
  const box = await t.$('.dg.pan');
  const bb = await box.boundingBox();
  const before = await q(() => document.querySelector('.dg.pan svg').style.transform);
  await t.dispatchEvent('.dg.pan', 'pointerdown', { clientX: bb.x + 100, clientY: bb.y + 100, pointerId: 1, isPrimary: true });
  await t.dispatchEvent('.dg.pan', 'pointermove', { clientX: bb.x + 160, clientY: bb.y + 130, pointerId: 1, isPrimary: true });
  await t.dispatchEvent('.dg.pan', 'pointerup', { clientX: bb.x + 160, clientY: bb.y + 130, pointerId: 1, isPrimary: true });
  const panned = await q(() => document.querySelector('.dg.pan svg').style.transform);
  await t.click('.dg .rst');
  const after = await q(() => document.querySelector('.dg.pan svg').style.transform);
  check(`${where}: reset view restores the fit after a pan`, panned !== before && after === before, `${before} | ${panned} | ${after}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const inGallery of [false, true]) {
    const tag = inGallery ? 'gallery' : 'alone';
    for (const [route, file] of UI) {
      const s = await open(browser, route, file, inGallery);
      check(`${tag} ${file}: loaded`, !!s.target);
      const t = s.target;
      if (t && file.includes('prototype-install')) {
        await t.click('.ins[data-i]');
        const sh = await t.evaluate(() => { const p = document.querySelector('.pop.open'); return p && getComputedStyle(p).boxShadow; });
        check(`${tag} 250::1 picker shadow 0 6px 22px`, !!sh && / 0px 6px 22px 0px$/.test(sh), sh);
      }
      if (t && file.includes('stale-note')) {
        const st = await t.evaluate(() => { const c = getComputedStyle(document.querySelector('.h1 .stale-tag'));
          return [c.fontSize, c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft, c.borderTopLeftRadius, c.opacity].join(' '); });
        check(`${tag} 250::2 title stale tag 9.5px, padding 0 4px, radius 3, opacity 0.8`, st === '9.5px 0px 4px 0px 4px 3px 0.8', st);
      }
      if (t && file.includes('prototype-agents')) {
        await t.click('#tabs [data-t="subagents"]'); await t.click('[data-sa="0"]');
        const m = await t.evaluate(() => { const e = document.getElementById('dmask'); const c = getComputedStyle(e); return c.display + ' ' + c.backgroundColor; });
        check(`${tag} 250::3 drawer mask shown, alpha 0.35`, m === 'block rgba(0, 0, 0, 0.35)', m);
      }
      if (t && (file.includes('prototype-agents') || file.includes('prototype-detail.html'))) {
        const bars = await t.evaluate(() => [...document.querySelectorAll('.m')].filter((m) => m.querySelector('.tr i')).map((m) => m.className + '=' + getComputedStyle(m.querySelector('.tr i')).backgroundColor).join('; '));
        console.log(`INFO  ${tag} ${file} model bars: ${bars}`);
      }
      if (t && file.includes('prototype-session')) {
        await t.click('[data-demo-harness] [data-ds="orphan"]');
        const meta = await t.evaluate(() => document.getElementById('hmeta').textContent + ' | ' + document.getElementById('qhead').textContent);
        check(`${tag} 250::6 orphan session: 26 in the meta and the list`, /· 26 questions ·/.test(meta.split('|')[0]) && /· 26 questions ·/.test(meta.split('|')[1]), meta);
      }
      if (t && (file.includes('skills-preview') || file.includes('plugin-skill-preview') || file.includes('prototype-session'))) {
        const sel = file.includes('prototype-session') ? '.body' : '.main';
        const pb = await t.evaluate((sel) => getComputedStyle(document.querySelector(sel)).paddingBottom + ' (top ' + getComputedStyle(document.querySelector(sel)).paddingTop + ')', sel);
        const want = '16px';
        check(`${tag} 250::9 ${file} list area padding 16px top and bottom`, pb === want + ' (top ' + want + ')', pb);
      }
      check(`${tag} ${file}: no script errors`, s.errors.length === 0, s.errors.join(' | '));
      if (s.consoleErrors.length) console.log(`INFO  ${tag} ${file} console errors: ${s.consoleErrors.join(' | ')}`);
      await s.ctx.close();
    }
    for (const [route, file, diagrams] of LOGIC) {
      const s = await open(browser, route, file, inGallery);
      check(`${tag} ${file}: loaded`, !!s.target);
      if (s.target) await driveLogic(s.target, diagrams, `${tag} ${file}`);
      check(`${tag} ${file}: no script errors`, s.errors.length === 0, s.errors.join(' | '));
      if (s.consoleErrors.length) console.log(`INFO  ${tag} ${file} console errors: ${s.consoleErrors.join(' | ')}`);
      await s.ctx.close();
    }
  }
  await browser.close();
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
