// The browser harness's own check: no browser case reaches the network. A request the harness has no answer for
// is refused inside the browser, and the visit fails naming it, also when the case has failed on its own first; a
// visit whose every request is answered does not. A held answer lands only when the case releases it, a hold never
// holds a request with no answer, a hold that held nothing fails the case, a hold the case left held is released once
// the case is done, a hold given to an earlier visit is refused by the next, and the request log misses nothing the
// page asked for while it loaded.
// The browser settings a case gives (a motion preference, scripts off) reach the page it visits. A request the page
// makes as the case ends is counted too: the visit waits for the page's requests to settle first.
import { afterAll, beforeAll, expect, inject, test, vi } from 'vitest'
import { hold, launch, ORIGIN, visit, type Browser, type Page, type Visit } from './browser'
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

// The self-tests' own waits, well inside the run's 5 s per test
const WAIT = 2_000
const HELD = 'https://stand-in.invalid/held.json'
const UNHELD = 'https://stand-in.invalid/unheld.json'

test('a held answer lands only once the case releases it, and a request the hold picks after that is answered at once', async () => {
  const read = hold('the probe read', (url) => url === HELD)
  const reads = { ...listPage.reads, [HELD]: [200, '"held"'], [UNHELD]: [200, '"unheld"'] } as Visit['reads']
  const landed = await visit(browser, inject('builtSite'), { ...listPage, reads, holds: [read] }, async (page) => {
    const record = (url: string) =>
      page.evaluate((url) => {
        const page = globalThis as unknown as { landed?: string[]; reads?: Promise<unknown>[] }
        const landed = (page.landed ??= [])
        ;(page.reads ??= []).push(fetch(url).then(async (r) => landed.push((await r.json()) as string)))
      }, url)
    const settled = () => page.evaluate(() => Promise.all((globalThis as unknown as { reads: Promise<unknown>[] }).reads))
    const landedSoFar = () => page.evaluate(() => [...((globalThis as unknown as { landed: string[] }).landed)])
    await record(HELD)
    await read.reached(WAIT)
    // Asked for after the held read and answered at once: the held read has had every chance to land before it
    await record(UNHELD)
    await vi.waitFor(async () => expect(await landedSoFar()).toContain('unheld'), { timeout: WAIT })
    const beforeRelease = await landedSoFar()
    read.release()
    await record(HELD)
    await settled()
    return { beforeRelease, afterRelease: await landedSoFar() }
  })
  expect(landed.beforeRelease).toEqual(['unheld'])
  expect(landed.afterRelease).toEqual(['unheld', 'held', 'held'])
  // Only the read asked for before the release was held
  expect(read.held).toEqual([HELD])
})

test('a request a hold picks that nothing answers is refused at once, not held, and the visit fails naming it', async () => {
  const stray = hold('the stray read', (url) => url === STRAY)
  let outcome = ''
  const error: unknown = await visit(browser, inject('builtSite'), { ...listPage, holds: [stray] }, async (page) => {
    outcome = await page.evaluate(
      ([url, wait]) =>
        Promise.race([
          fetch(url).then(
            () => 'answered',
            () => 'refused'
          ),
          new Promise<string>((still) => setTimeout(() => still('still waiting'), wait))
        ]),
      [STRAY, WAIT] as const
    )
  }).then(
    () => expect.unreachable('the visit made a request with no answer, and passed'),
    (e: unknown) => e
  )
  expect(outcome).toBe('refused')
  expect(stray.held).toEqual([])
  expect(String(error)).toContain(STRAY)
})

test('a hold that held nothing fails the case, naming the hold', async () => {
  const never = hold('the read the page never makes', (url) => url === HELD)
  const error: unknown = await visit(browser, inject('builtSite'), { ...listPage, holds: [never] }, () => never.reached(500)).then(
    () => expect.unreachable('the hold held nothing, and the case passed'),
    (e: unknown) => e
  )
  expect(String(error)).toContain('the read the page never makes')
})

// A hold serves one visit: released by the earlier visit, it would answer the next one's requests at once, and a
// request it held for the earlier visit would still satisfy its `reached`. Each visit is given another hold before
// that one, so the refusal has to look at, and mark, every hold a visit is given, not only its first
test.for([
  { ending: 'returned', fails: false, ends: 'returned' },
  { ending: 'failed', fails: true, ends: 'the case failed' }
])('a hold given to an earlier visit that $ending is refused by the next before it opens the page, naming the hold', async ({ fails, ends }) => {
  const read = hold('the probe read', (url) => url === HELD)
  const another = hold('another read', (url) => url === UNHELD)
  const first = await visit(browser, inject('builtSite'), { ...listPage, holds: [another, read] }, () =>
    fails ? Promise.reject(new Error('the case failed')) : Promise.resolve('returned')
  ).then(
    (value) => value,
    (e: unknown) => String(e)
  )
  expect(first).toContain(ends)
  let ran = false
  const requests: string[] = []
  const own = hold('a read of its own', (url) => url === UNHELD)
  const error: unknown = await visit(browser, inject('builtSite'), { ...listPage, holds: [own, read], requests }, () => {
    ran = true
    return Promise.resolve()
  }).then(
    () => expect.unreachable('a second visit took the hold an earlier visit was given'),
    (e: unknown) => e
  )
  expect(String(error)).toContain('the probe read')
  expect(ran, "the second visit's run").toBe(false)
  expect(requests, "what the second visit's page asked for").toEqual([])
})

// However the case ends. Run, release, settle, check: the release comes before the visit checks for unanswered
// requests, so it is made when that check fails too
const ENDINGS = [
  { ending: 'returns', fails: false, stray: false, ends: 'returned' },
  { ending: 'fails', fails: true, stray: false, ends: 'the case failed' },
  { ending: 'returns leaving a request unanswered', fails: false, stray: true, ends: STRAY }
]
test.for(ENDINGS)('a hold the case left held is released once its run $ending', async ({ fails, stray, ends }) => {
  const read = hold('the probe read', (url) => url === HELD)
  const reads = { ...listPage.reads, [HELD]: [200, '"held"'] } as Visit['reads']
  const finished: string[] = []
  const ended = await visit(browser, inject('builtSite'), { ...listPage, reads, holds: [read] }, async (page) => {
    page.on('requestfinished', (request) => finished.push(request.url()))
    await page.evaluate(
      async ([held, unanswered]) => {
        void fetch(held)
        if (unanswered) await fetch(unanswered).catch(() => undefined)
      },
      [HELD, stray ? STRAY : null] as const
    )
    await read.reached(WAIT)
    if (fails) throw new Error('the case failed')
    return 'returned'
  }).then(
    (value) => value,
    (e: unknown) => String(e)
  )
  // Seen in that visit: it waits for the page's requests to settle after the release, so a released read is answered
  // before the visit ends, and one left held is still in flight when it closes. Before the visit's own error, which
  // names the unanswered request whether or not the release came
  expect(finished, 'the held read, answered once the case was done').toContain(HELD)
  expect(ended).toContain(ends)
  expect(read.held).toEqual([HELD])
})

test('a page whose image is held opens all the same, without the image until the release', async () => {
  const POSTER = `${ORIGIN}/media/agentshed-intro-poster.jpg`
  const poster = hold('the poster', (url) => url === POSTER)
  const widths = await visit(browser, inject('builtSite'), { ...listPage, holds: [poster] }, async (page) => {
    const width = () => page.evaluate((src) => document.querySelector<HTMLImageElement>(`img[src="${new URL(src).pathname}"]`)?.naturalWidth, POSTER)
    await poster.reached(WAIT)
    const held = await width()
    poster.release()
    await page.waitForFunction((src) => document.querySelector<HTMLImageElement>(`img[src="${new URL(src).pathname}"]`)?.complete, POSTER, { timeout: WAIT })
    return { held, released: await width() }
  })
  expect(widths).toEqual({ held: 0, released: 1600 })
})

test("a visit's request log has every request the page made, its document's own first", async () => {
  const requests: string[] = []
  await visit(browser, inject('builtSite'), { ...listPage, requests }, () =>
    // The page asks for its reads while it loads, and a read can still be on its way to the harness once it has loaded
    vi.waitFor(() => expect(requests).toEqual(expect.arrayContaining([POINTER_URL, COUNT_URL])), { timeout: WAIT })
  )
  expect(requests[0]).toBe(`${ORIGIN}/`)
})
