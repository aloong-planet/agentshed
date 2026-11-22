// The browser harness's own check: no browser case reaches the network. A request the harness has no answer for
// is refused inside the browser, and the visit fails naming it; a visit whose every request is answered does not.
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

test('a request with no stand-in is refused before it leaves the browser, and the visit fails naming it', async () => {
  const site = inject('builtSite')
  // Every request answered: the visit gives what the case returns
  expect(await visit(browser, site, listPage, (page) => page.title())).toMatch(/^Agentshed/)

  const STRAY = 'https://unanswered.invalid/probe.json'
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
