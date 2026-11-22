// The site's browser cases: a real Chromium (Playwright's headless shell) loading the test run's fresh build, with
// no server and no network. Every request a page makes is answered here: the site's own files from the build
// directory, at a made-up origin, and the page's reads by the stand-ins a case gives. Anything else is refused inside
// the browser and fails the visit, naming the request: no case reaches the network, and a page that starts asking for
// something new fails until a case answers it.
//
// A browser starts in well under a second, so each test file starts its own (`launch` in a `beforeAll`); each visit
// gets a browser context of its own, so no state carries from one case to the next.
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
 * Gives what `run` gives. Rejects when the page made a request with no answer (no stand-in for it, or no such file in
 * the build), naming each, and with `run`'s own failure as the cause if it failed too. A wait inside `run` must give up
 * before the test's own timeout: a case the test run times out never gets here, and its failure names nothing.
 */
export async function visit<T>(browser: Browser, site: string, options: Visit, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height ?? 800 },
    colorScheme: options.colorScheme
  })
  const unanswered: string[] = []
  try {
    await context.route('**/*', (route) => answer(route, site, options.reads, unanswered))
    const page = await context.newPage()
    let outcome: { ok: true; value: T } | { ok: false; error: unknown }
    try {
      await page.goto(ORIGIN + options.path)
      outcome = { ok: true, value: await run(page) }
    } catch (error) {
      outcome = { ok: false, error }
    }
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

async function answer(route: Route, site: string, reads: Record<string, Answer>, unanswered: string[]): Promise<void> {
  const url = route.request().url()
  const read = reads[url]
  if (read === 'fail') return route.abort('failed')
  if (read) {
    return route.fulfill({
      status: read[0],
      body: read[1],
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    })
  }
  const file = url.startsWith(`${ORIGIN}/`) ? await builtFile(site, new URL(url).pathname) : null
  if (file) return route.fulfill({ status: 200, body: file.body, contentType: file.type })
  unanswered.push(url)
  return route.abort('blockedbyclient')
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
