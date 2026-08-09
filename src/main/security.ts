// Electron host security guards (items 5/12/13/14/15 of the official Security Checklist).
// The decision layer is pure functions (unit testable) and the wiring layer hangs off
// app.on('web-contents-created') —
// covering **every** webContents rather than just the main window, so any newly opened contents is
// governed automatically.
//
// Two gaps in the official checklist, both filled here:
//   - item 13 mentions only will-navigate, which **covers the main frame only** (stated in
//     web-contents.md);
//     subframes need will-frame-navigate, so both are hung.
//   - the official example itself compares URLs with startsWith, contradicting its own warning in item
//     13;
//     here we always compare origins via new URL().
import { shell } from 'electron'
import type { WebContents } from 'electron'
import { ERR, appError } from '@shared/errors'

/** Whether this is the app's own address (the only basis for admitting navigation). Pass
 * ELECTRON_RENDERER_URL in dev and undefined in prod */
export function isAppUrl(url: string, appBase: string | undefined): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false // Anything unparseable is never admitted
  }
  // prod: the renderer page runs on app://bundle (file:// dropped as of #18). file: is still accepted to
  // cover edge loads such as devtools and internal pages, which do not carry this app's IPC surface.
  if (appBase === undefined) return u.protocol === 'app:' || u.protocol === 'file:'
  try {
    return u.origin === new URL(appBase).origin // Compare origins, not startsWith
  } catch {
    return false
  }
}

/**
 * A target to hand to the system browser (item 15). **A protocol allow-list**, not a deny-list:
 * only http/https are admitted, and file:, smb:, custom schemes and the rest are all refused —
 * handing unvalidated content to shell.openExternal lets a document's content drive the machine.
 */
export function externalOpenTarget(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
}

/** Hang every guard on one webContents; called by app.on('web-contents-created') */
export function installNavigationGuards(contents: WebContents, appBase: string | undefined): void {
  // #13 navigation: intercept both the main frame and subframes; anything not the app's own address is
  // blocked, and http(s) is handed to the system browser
  const guard = (e: { preventDefault: () => void }, url: string): void => {
    if (isAppUrl(url, appBase)) return
    e.preventDefault()
    const ext = externalOpenTarget(url)
    if (ext) void shell.openExternal(ext)
  }
  contents.on('will-navigate', guard)
  // will-frame-navigate's signature differs from will-navigate's: a single event object argument (with
  // the url on it)
  contents.on('will-frame-navigate', (details) => guard(details, details.url))

  // #14 new windows: always deny (the deny runs unconditionally after every branch), with allow-listed
  // targets handed to the system browser
  contents.setWindowOpenHandler(({ url }) => {
    const ext = externalOpenTarget(url)
    if (ext) setImmediate(() => void shell.openExternal(ext))
    return { action: 'deny' }
  })

  // #12 webview: this project uses no webview, and this is a pre-emptive intercept — one can be created
  // by a DOM script,
  // so if one is ever introduced by mistake, the default is node integration off, preload stripped, and
  // attachment prevented
  contents.on('will-attach-webview', (e, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    void params
    e.preventDefault()
  })
}

/**
 * #17 IPC sender validation: a handler must confirm the caller is one of the app's own pages.
 * This and the navigation guards are **two independent lines of defence** — if the guards are ever
 * bypassed (a new event type, a future new window),
 * a navigated-away renderer still holds the IPC channels, and this layer stops it.
 * Validation uses the same isAppUrl criterion as navigation (a single source, so two rules cannot drift).
 */
export function assertTrustedSender(
  senderUrl: string | undefined,
  appBase: string | undefined
): void {
  if (senderUrl === undefined || !isAppUrl(senderUrl, appBase)) {
    throw appError(ERR.untrustedSender, { sender: senderUrl ?? '' })
  }
}

/**
 * #7 CSP. This application renders other people's markdown, and the CSP is a second line beyond
 * sanitising:
 * sanitising strips scripts, while the CSP catches "execution that slipped through" and "outbound
 * requests" (an <img src="http://tracker">
 * really would be sent, which is a privacy leak).
 *
 * Two profiles: prod is strict; dev has to be relaxed — vite HMR uses inline scripts and a ws connection,
 * and the strict profile simply will not run in development (the relaxation is dev-only and does not
 * affect the packaged build).
 */
export function cspFor(isDev: boolean): string {
  const base = [
    "default-src 'self'",
    "img-src 'self' data:", // Local images and inline data:; **no http(s)** → external tracking images are blocked
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'", // No iframes at all (which also removes the subframe navigation surface)
    "base-uri 'none'",
    "form-action 'none'"
  ]
  if (isDev) {
    // vite: inline script + eval (HMR) + a ws connection + injected styles
    return [
      ...base,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: http://localhost:*"
    ].join('; ')
  }
  return [...base, "script-src 'self'", "style-src 'self' 'unsafe-inline'", "connect-src 'self'"].join(
    '; '
  )
}

/** Inject the CSP into every response header of that session (more reliable than <meta>: meta has no
 * effect on some directives) */
export function installCsp(
  ses: {
    webRequest: {
      onHeadersReceived: (
        cb: (
          d: { responseHeaders?: Record<string, string[]> },
          done: (r: { responseHeaders: Record<string, string[]> }) => void
        ) => void
      ) => void
    }
  },
  isDev: boolean
): void {
  const csp = cspFor(isDev)
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...(details.responseHeaders ?? {}), 'Content-Security-Policy': [csp] }
    })
  })
}

/** #5 permissions: a read-only local application needs none, so both requests and checks are denied */
export function installPermissionGuards(session: {
  setPermissionRequestHandler: (h: (wc: unknown, p: string, cb: (ok: boolean) => void) => void) => void
  setPermissionCheckHandler: (h: () => boolean) => void
}): void {
  session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
}

/**
 * The session file read allow-list judgement (ticket 04, the range-read path's entry guard).
 *
 * The allow-list is an **exact path Set** the main process produces during its own scan (the same
 * pattern as artifactWhitelist),
 * not a prefix rule: under exact matching, path traversal is structurally impossible — one string can
 * only open one file,
 * and `..`, encoding and normalisation variants are all refused because the strings are not equal, so
 * the direction of failure is fail-closed
 * (the worst case is refusing another spelling of the same file; it can never let a different file in).
 * When admitted it returns the member string as is, and the caller reads the file with it — there is no
 * second interpretation.
 */
export function sessionReadTarget(
  whitelist: ReadonlySet<string>,
  raw: unknown
): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  return whitelist.has(raw) ? raw : null
}
