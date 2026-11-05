import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from '../close-app'
import { mkEmptyProjectHome } from './homes'

/** Each case gets its own userData with no cross-contamination; a cache file can be seeded */
export function makeUserData(cacheContent?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  if (cacheContent !== undefined) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'token-cache.json'), cacheContent)
  }
  return dir
}

export interface Launched {
  app: ElectronApplication
  errors: string[]
  userData: string
  /** The fixture home used this time (cleaned up with close if there is one) */
  home?: string
}

/** What counts as a failure signal in what the main process writes to stderr; `startApp` says why each part is here */
const MAIN_ERRORS = /Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:|\[parse-pool\]/

export interface StartOptions {
  userData: string
  home: string
  /** Per-case seams, which can also replace a pinned value */
  env?: Record<string, string>
  args?: string[]
  /** `null` removes Playwright's light emulation (launchAppearance says why) */
  colorScheme?: null
  /** A list to collect into instead of a new one, as `failOnMainErrors` needs */
  errors?: string[]
}

export interface Started {
  app: ElectronApplication
  /** What the main process reported that counts as a failure signal */
  errors: string[]
  /** Everything it wrote to stderr */
  stderr: string[]
}

/**
 * A fixture directory as home is injected through AGENTSHED_HOME_OVERRIDE (see src/main/roots.ts).
 *
 * **Always pass home, without exception.** Omitting it reads the development machine's real ~/.claude,
 * which is bad in two ways:
 *   1. a data-asserting case's result depends on how many sessions whoever runs it has — green on their
 *      machine, red in CI;
 *   2. even when only asserting generic UI, every case has its own userData so the cache is always empty,
 *      meaning every run does
 *      a full rescan of real data (638 MB on this machine). That pushes cases to the edge of the
 *      assertion timeout — after the 2026-08-02
 *      CACHE_VERSION bump, the only two remaining cases reading the real home went red exactly this way.
 *
 * **Test silencing (AGENTSHED_NO_FOREGROUND)**: on local macOS the window is not shown, so 18 instances
 * do not take turns
 * stealing the foreground; CI's xvfb is unaffected (the seam has a darwin guard). Its validity has been
 * verified: DOM text, geometry,
 * computed styles and toBeVisible all go through layout and CDP, independent of whether the window is on
 * screen (two known red-able mutations replayed
 * red under the hidden regime, 2026-08-04). **The boundary: real focus semantics are the exception** —
 * document.hasFocus(),
 * autofocus and :focus styles behave differently in a hidden window; when writing input-box cases (ticket
 * 08's search, say),
 * either focus explicitly through CDP or drop this variable for that case alone — never depend silently on
 * window focus.
 */
/**
 * `home` is **required** (changed from optional on 2026-08-03): omitting it makes the app scan the
 * developer's real `~/.claude`,
 * so results vary with each person's data volume — green in CI where home is empty, timing out locally.
 * "Remembering to pass it" cannot hold the line, so typecheck does.
 */
export async function startApp(options: StartOptions): Promise<Started> {
  const errors = options.errors ?? []
  const stderr: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${options.userData}`, ...(options.args ?? [])],
    ...(options.colorScheme === null ? { colorScheme: null } : {}),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: options.home,
      // Test silencing: do not steal the foreground (the macOS accessory policy, see src/main/index.ts)
      AGENTSHED_NO_FOREGROUND: '1',
      // Pin the test language to English: the UI language follows the system by default, and without pinning it
      // every assertion locating by English copy would vary with the system language of whoever runs the tests
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
      // Per-case seams (e.g. AGENTSHED_SCAN_DELAY_MS for the startup-skeleton cases) ride on top
      ...options.env
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    stderr.push(t)
    // An uncaught main-process error, an IPC handler exception, or any structured failure all count as a
// failure signal.
    // `agentshed-error:` is the marker common to every cross-process failure since ticket 05 — it replaced the
// earlier match on
    // the Chinese wording "契约校验失败", which no longer exists after ticket 06,
    // so that pattern had become a dead pattern that could never match anything again (silently weakening the
// detection net).
    // `[parse-pool]`: a parse worker failed and its file was parsed on the main thread instead. The figures
    // stay right, so without this the built app could lose its workers with every case still green.
    if (MAIN_ERRORS.test(t)) errors.push(t.trim())
  })
  return { app, errors, stderr }
}

/**
 * For cases whose `startApp` is passed `errors` (test-layers::US-004/AC-04): after each case, once its app has closed, fails
 * it on an error its main process reported that it did not allow, and on an allowance nothing matched. Call it at the top
 * level of the file. A case whose start is not passed `errors` is not watched.
 */
export function failOnMainErrors(): { errors: string[]; allow: (provoked: RegExp) => void } {
  const errors: string[] = []
  const allowed: RegExp[] = []
  test.afterEach(() => {
    // One chunk of stderr can hold several reports, so each line is judged by itself
    const reported = errors.splice(0).flatMap((chunk) => chunk.split('\n').filter((line) => MAIN_ERRORS.test(line)))
    const patterns = allowed.splice(0)
    expect(reported.filter((line) => !patterns.some((p) => p.test(line)))).toEqual([])
    for (const p of patterns) expect(reported.filter((line) => p.test(line)), `nothing reported what the case allowed: ${p}`).not.toEqual([])
  })
  return { errors, allow: (provoked) => { allowed.push(provoked) } }
}

export async function launch(
  cacheContent: string | undefined,
  home: string,
  extraEnv?: Record<string, string>,
  extraArgs: string[] = []
): Promise<Launched> {
  const userData = makeUserData(cacheContent)
  const { app, errors } = await startApp({ userData, home, env: extraEnv, args: extraArgs })
  return { app, errors, userData, home }
}

export async function close(l: Launched): Promise<void> {
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
  if (l.home) rmSync(l.home, { recursive: true, force: true })
}

export interface WindowLaunched {
  app: ElectronApplication
  win: Page
  errors: string[]
  userData: string
}

/** `startApp` with its first window, over an isolated userData and a fixture home */
export async function launchWindow(
  home: string,
  extraEnv: Record<string, string> = {},
  userData = makeUserData(),
  options: { colorScheme?: null } = {}
): Promise<WindowLaunched> {
  const { app, errors } = await startApp({ userData, home, env: extraEnv, ...options })
  return { app, win: await app.firstWindow(), errors, userData }
}

export async function closeWindow(l: WindowLaunched, ...dirs: string[]): Promise<void> {
  await closeApp(l.app)
  for (const d of [l.userData, ...dirs]) rmSync(d, { recursive: true, force: true })
}

/**
 * A launch helper dedicated to appearance mode: Playwright's own prefers-color-scheme emulation **must**
 * be turned off.
 *
 * `electron.launch` defaults to `colorScheme: 'light'`, sending the page an Emulation that pins
 * prefers-color-scheme; a themeSource change never reaches the renderer and the media query stays light.
 * **This was hit by measurement**: the main process side was already `themeSource='dark'` /
 * `shouldUseDarkColors=true`,
 * while the renderer still had `matchMedia(...).matches === false` and a light body background —
 * that is, "the implementation is right and the test harness is masking it". `'no-override'` removes the
 * emulation and lets the real value through.
 *
 * Other cases keep the default (emulating light): they do not test light/dark, and pinning it is steadier,
 * so results do not vary with the
 * system appearance of whoever runs them — the same reason as pinning the test language. This group
 * explicitly selects a mode before every assertion,
 * so it is unaffected by the development machine's system appearance.
 *
 * `null` removes the emulation (the value that expresses "reset to the system default" in this version's
 * Playwright types);
 * the `'no-override'` the docs also mention works at runtime but is not in this version's type union, so
 * typecheck would go red.
 */
export async function launchAppearance(home: string): Promise<Launched> {
  const userData = makeUserData()
  const { app, errors } = await startApp({ userData, home, colorScheme: null })
  return { app, errors, userData, home }
}

/**
 * UI language (i18n ticket 03).
 *
 * The system's preferred languages are injected through AGENTSHED_SYSTEM_LANGUAGES (see
 * src/main/system-language.ts) —
 * "follow system" behaviour depends on the system language, which cannot be changed in tests, and without
 * this hatch the only way
 * to verify it would be a human repeatedly changing system settings.
 */
export async function launchWithLangs(sysLangs: string, homeOverride?: string, prefs?: object): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  // A preference file seeded before launch, as an earlier run would have left it
  if (prefs) writeFileSync(join(userData, 'prefs.json'), JSON.stringify(prefs))
  const home = homeOverride ?? mkEmptyProjectHome()
  const { app, errors } = await startApp({ userData, home, env: { AGENTSHED_SYSTEM_LANGUAGES: sysLangs } })
  return { app, errors, userData, home }
}
