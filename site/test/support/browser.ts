// The site's browser cases: a real Chromium (Playwright's headless shell) loading the test run's fresh build, with
// no server and no network. Every request a page makes is answered here: the site's own files from the build
// directory, at a made-up origin, and the page's reads by the stand-ins a case gives. Anything else is refused inside
// the browser and fails the visit, naming the request: no case reaches the network, and a page that starts asking for
// something new fails until a case answers it.
//
// A browser starts in well under a second, so each test file starts its own (`launch` in a `beforeAll`); each visit
// gets a browser context of its own, so no state carries from one case to the next.
//
// A case that looks at the page before something lands holds its answers back (`hold`, given in a visit's `holds`)
// and releases them when it has looked; a hold that held nothing fails the case through `reached`, so a case cannot
// measure "before" on a page that had already had its answer. Once the case is done, the visit releases every hold
// still held before it checks what went unanswered. A case that looked only at "before" then leaves no answer
// hanging into the context's close. A case that asserts what the page asked for reads the visit's `requests`, which
// the harness fills from the document's own request on: a listener the case adds once the page has opened misses what
// the page asked for while it loaded.
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright'

export type { Browser, Page }

/** Where the build is served. `.test` is reserved (RFC 2606): the name can belong to no real host */
export const ORIGIN = 'https://agentshed.test'

/** A read's stand-in: its status and body, or a failure, as an unreachable host gives */
export type Answer = [status: number, body: string] | 'fail'

export interface Visit {
  /** The page's path, as the site serves it: `/` or `/zh/` */
  path: string
  width: number
  /** The viewport's height; 800 if not given */
  height?: number
  colorScheme: 'light' | 'dark'
  /** The answers to the page's reads, by URL */
  reads: Record<string, Answer>
  /**
   * Answers to hold back until the case releases them. A visit with holds opens the page once its document has loaded
   * (DOMContentLoaded), not once all it loads has: a held image would keep the page's `load` from ever coming.
   */
  holds?: Hold[]
  /** Filled with the URL of every request the page makes, in order, its document's own first */
  requests?: string[]
}

/**
 * Holds back the answers to the requests it picks until the case releases them. A request it picks that nothing
 * answers (no stand-in for it, no such file in the build) is refused at once all the same: a hold never hides a
 * request the visit fails for.
 */
export interface Hold {
  /** What the failure of `reached` calls it */
  readonly name: string
  /** The URLs it has held back, in the order the page asked for them; a request picked after the release is not held */
  readonly held: readonly string[]
  /** Resolves once it holds a request; rejects naming the hold when none has come within `timeout` milliseconds */
  reached(timeout: number): Promise<void>
  /** Answers every request it holds, and from then on every request it picks at once */
  release(): void
}

/** What the visit calls before answering a request: waits until the case releases it when the hold picks it */
const gates = new WeakMap<Hold, (url: string) => Promise<void>>()

/** A hold on the requests whose URL `picks` accepts, called `name` when it fails */
export function hold(name: string, picks: (url: string) => boolean): Hold {
  const held: string[] = []
  let released = false
  const waiting: (() => void)[] = []
  const arrivals: (() => void)[] = []
  const handle: Hold = {
    name,
    held,
    reached: (timeout) =>
      held.length > 0
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`The hold "${name}" held nothing within ${timeout} ms: the page made no request it picks`)),
              timeout
            )
            arrivals.push(() => {
              clearTimeout(timer)
              resolve()
            })
          }),
    release: () => {
      released = true
      for (const go of waiting.splice(0)) go()
    }
  }
  gates.set(handle, async (url) => {
    if (released || !picks(url)) return
    held.push(url)
    for (const arrived of arrivals.splice(0)) arrived()
    await new Promise<void>((go) => waiting.push(go))
  })
  return handle
}

export const launch = (): Promise<Browser> => chromium.launch()

/** The content types of the files the build holds; a file of another type is refused, so that it gets named here */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
}

/**
 * Opens a page of the build at `site` in a browser context of its own, runs `run` on it, and closes the context.
 * Gives what `run` gives. Once `run` has returned or failed, releases every hold still held, then checks. Rejects when
 * the page made a request with no answer (no stand-in for it, or no such file in the build), naming each, and with
 * `run`'s own failure as the cause if it failed too. A wait inside `run` must give up before the test's own timeout: a
 * case the test run times out never gets here, and its failure names nothing.
 */
export async function visit<T>(browser: Browser, site: string, options: Visit, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height ?? 800 },
    colorScheme: options.colorScheme
  })
  const unanswered: string[] = []
  try {
    await context.route('**/*', (route) => answer(route, site, options, unanswered))
    const page = await context.newPage()
    let outcome: { ok: true; value: T } | { ok: false; error: unknown }
    try {
      await page.goto(ORIGIN + options.path, { waitUntil: options.holds?.length ? 'domcontentloaded' : 'load' })
      outcome = { ok: true, value: await run(page) }
    } catch (error) {
      outcome = { ok: false, error }
    }
    for (const held of options.holds ?? []) held.release()
    if (unanswered.length > 0) {
      throw new Error(`The page made requests no stand-in answers, refused: ${unanswered.join(', ')}`, {
        cause: outcome.ok ? undefined : outcome.error
      })
    }
    if (!outcome.ok) throw outcome.error
    return outcome.value
  } finally {
    await close(context)
  }
}

async function answer(route: Route, site: string, options: Visit, unanswered: string[]): Promise<void> {
  const url = route.request().url()
  options.requests?.push(url)
  const respond = await response(url, site, options.reads)
  if (!respond) {
    unanswered.push(url)
    return route.abort('blockedbyclient')
  }
  for (const held of options.holds ?? []) await gates.get(held)?.(url)
  return respond(route)
}

/** How the harness answers a request: by its stand-in, else by the build's file; null when neither has it */
async function response(url: string, site: string, reads: Record<string, Answer>): Promise<((route: Route) => Promise<void>) | null> {
  const read = reads[url]
  if (read === 'fail') return (route) => route.abort('failed')
  if (read) {
    return (route) =>
      route.fulfill({
        status: read[0],
        body: read[1],
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
      })
  }
  const file = url.startsWith(`${ORIGIN}/`) ? await builtFile(site, new URL(url).pathname) : null
  return file ? (route) => route.fulfill({ status: 200, body: file.body, contentType: file.type }) : null
}

/** The build's file at a served path (a directory's is its index.html), or null when there is none to serve */
async function builtFile(site: string, pathname: string): Promise<{ body: Buffer; type: string } | null> {
  try {
    const path = normalize(join(site, decodeURIComponent(pathname).replace(/\/$/, '/index.html')))
    const type = TYPES[extname(path)]
    if (!path.startsWith(site + sep) || !type) return null
    return { body: await readFile(path), type }
  } catch {
    return null
  }
}

/**
 * Closes a context without its routes' late answers (an image still loading, say) failing the run. Offline first: a
 * request made once the routes are gone fails rather than reaching the network.
 */
async function close(context: BrowserContext): Promise<void> {
  await context.setOffline(true)
  await context.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
}
