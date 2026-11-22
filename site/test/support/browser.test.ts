// The browser harness's own check: no browser case reaches the network. A request the harness has no answer for
// is refused inside the browser, and the visit fails naming it, also when the case has failed on its own first; a
// visit whose every request is answered does not.
import { afterAll, beforeAll, expect, inject, test } from 'vitest'
import { launch, visit, type Browser, type Visit } from './browser'
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
