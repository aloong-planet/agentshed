// The browser harness's own check: no browser case reaches the network. A request the harness has no answer for
// is refused inside the browser, and the visit fails naming it, also when the case has failed on its own first; a
// visit whose every request is answered does not.
// The browser settings a case gives (a motion preference, scripts off) reach the page it visits. A request the page
// makes as the case ends is counted too: the visit waits for the page's requests to settle first.
import { afterAll, beforeAll, expect, inject, test } from 'vitest'
import { launch, visit, type Browser, type Page, type Visit } from './browser'
import { COUNT_URL, POINTER_URL, RELEASES_API, statistics } from './stand-ins'

let browser: Browser
beforeAll(async () => {
  browser = await launch()
})
afterAll(async () => {
  await browser?.close()
})

// The page in the list state, its every read answered
const listPage: Visit = {
  path: '/',
  width: 900,
  colorScheme: 'light',
  reads: { [POINTER_URL]: 'fail', [RELEASES_API]: 'fail', [COUNT_URL]: [200, statistics(3, 3, 0)] }
}
const STRAY = 'https://unanswered.invalid/probe.json'

test('a request with no stand-in is refused before it leaves the browser, and the visit fails naming it', async () => {
  const site = inject('builtSite')
  // Every request answered: the visit gives what the case returns
  expect(await visit(browser, site, listPage, (page) => page.title())).toMatch(/^Agentshed/)

  const MISSING = 'https://agentshed.test/missing.png'
  const failures = new Map<string, string>()
  const visiting = visit(browser, site, listPage, async (page) => {
    page.on('requestfailed', (request) => failures.set(request.url(), request.failure()?.errorText ?? ''))
    await page.evaluate(async (stray) => {
      await fetch(stray).catch(() => undefined)
      const image = new Image()
      image.src = '/missing.png'
      await image.decode().catch(() => undefined)
    }, STRAY)
  })
  const error: unknown = await visiting.then(
    () => expect.unreachable('the visit made requests with no answer, and passed'),
    (e: unknown) => e
  )
  expect(String(error)).toContain(STRAY)
  expect(String(error)).toContain(MISSING)
  // Refused by the harness, not failed on the way to a host (no lookup, no connection)
  expect(failures.get(STRAY)).toContain('ERR_BLOCKED_BY_CLIENT')
  expect(failures.get(MISSING)).toContain('ERR_BLOCKED_BY_CLIENT')
})

test("a case that fails after a request with no stand-in fails naming the request, with the case's failure as the cause", async () => {
  // As a case whose state never lands because a read went unanswered: the case's own wait gives up first
  const error: unknown = await visit(browser, inject('builtSite'), listPage, async (page) => {
    await page.evaluate((stray) => fetch(stray).catch(() => undefined), STRAY)
    throw new Error('the case gave up waiting')
  }).then(
    () => expect.unreachable('the case failed, and the visit passed'),
    (e: unknown) => e
  )
  expect(String(error)).toContain(STRAY)
  expect(String((error as Error).cause)).toContain('the case gave up waiting')
})

test('a visit that asks for reduced motion gets it, and one that does not gets no preference', async () => {
  const site = inject('builtSite')
  const reduced = (page: Page) => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  expect(await visit(browser, site, { ...listPage, reducedMotion: 'reduce' }, reduced)).toBe(true)
  expect(await visit(browser, site, listPage, reduced)).toBe(false)
})

test("a visit with scripts off runs none of the page's scripts", async () => {
  const site = inject('builtSite')
  // No stand-ins: the page's scripts make reads, so a visit that runs them fails naming the reads
  const unread: Visit = { ...listPage, reads: {} }
  const error: unknown = await visit(browser, site, unread, () => Promise.resolve()).then(
    () => expect.unreachable('the page ran its scripts, made its reads with no stand-in, and the visit passed'),
    (e: unknown) => e
  )
  expect(String(error)).toContain(COUNT_URL)
  // Scripts off: the page asks for nothing, and its styles see a browser without scripting
  const scripting = await visit(browser, site, { ...unread, scripts: false }, (page) =>
    page.evaluate(() => matchMedia('(scripting: none)').matches)
  )
  expect(scripting).toBe(true)
})

test('a request the page makes as the case ends is waited for, and the visit fails naming it', async () => {
  // The page asks for the stray read 30ms after the case has returned
  const error: unknown = await visit(browser, inject('builtSite'), listPage, (page) =>
    page.evaluate((stray) => {
      setTimeout(() => void fetch(stray).catch(() => undefined), 30)
    }, STRAY)
  ).then(
    () => expect.unreachable('the page asked for a read with no stand-in as the case ended, and the visit passed'),
    (e: unknown) => e
  )
  expect(String(error)).toContain(STRAY)
})
