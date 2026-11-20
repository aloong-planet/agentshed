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
import type { ProjectEntry } from '@shared/domain'

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
 * The allow-list is an **exact path Set** the application's own scan produces and the main process holds,
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

/**
 * Showing a session's record file in Finder (session-view::US-001/AC-07, AC-10): admitted exactly as reading it
 * is — the exact-path allow-list above, judged before the disk is touched — and then only while the file is still
 * there, because Finder's own call reports no failure. An entry restored before the first scan is shown only while
 * it is a regular file, as a restored memory file is read. The probes are the handler's; tests pass the same ones
 * against real files.
 */
export function sessionRevealTarget(
  whitelist: ReadonlySet<string>,
  raw: unknown,
  o: { restored: boolean; exists: (file: string) => boolean; regular: (file: string) => boolean }
): { ok: true; file: string } | { ok: false; code: typeof ERR.sessionNotWhitelisted | typeof ERR.sessionFileUnreadable } {
  const file = sessionReadTarget(whitelist, raw)
  if (file === null) return { ok: false, code: ERR.sessionNotWhitelisted }
  if (!o.exists(file)) return { ok: false, code: ERR.sessionFileUnreadable }
  if (o.restored && !o.regular(file)) return { ok: false, code: ERR.sessionNotWhitelisted }
  return { ok: true, file }
}

/**
 * Which directory a skill install or uninstall may go into (skill-install R3): only one of the app's projects,
 * named by the exact path the app lists it under, so that a renderer cannot point the copy or the recursive delete at
 * the global library, a project's parent or any other directory. Matching is exact, as for the session allow-list
 * above: another spelling of a project is refused, never let through. A project the app lists as stale is refused as
 * stale, the notice an install into it already gives once its directory is found gone.
 */
export function skillOpTarget(
  projects: readonly Pick<ProjectEntry, 'path' | 'stale'>[],
  target: string
): { ok: true } | { ok: false; code: typeof ERR.skillTargetNotProject | typeof ERR.skillStaleTarget } {
  const project = projects.find((p) => p.path === target)
  if (project === undefined) return { ok: false, code: ERR.skillTargetNotProject }
  return project.stale ? { ok: false, code: ERR.skillStaleTarget } : { ok: true }
}

/**
 * Where a directory is, told by identity rather than by spelling (skill-install R4): one directory can be named by its
 * own path, by its real path, through a link or in another letter case, and only its device and inode say it is the
 * same one. The probe is the caller's (providers/install.ts, dirPlace and entryPlace); tests pass the same one against
 * real directories.
 */
export interface DirPlace {
  /** The nearest directory along the path that is there, by device and inode: the directory itself when it is there */
  at: string
  /** `at` and every directory holding it, along its path as written and along where that path really leads */
  holders: readonly string[]
  /** The segments below `at` that are not there yet; empty when the directory is there */
  rest: readonly string[]
}

/** A segment not there yet, as a volume that ignores letter case would find it: `.CLAUDE` would be created as Claude's
 * `.claude`. Folding on a volume that tells case apart only refuses more */
const folded = (segment: string): string => segment.toUpperCase().toLowerCase()

/** Whether `a` is `b` or lies inside it. A place the probe could not tell is inside nothing and holds nothing: a path it
 * cannot look at, the operation cannot write or delete through either, and fails there (A10, B2) */
function within(a: DirPlace | null, b: DirPlace | null): boolean {
  if (a === null || b === null) return false
  if (b.rest.length === 0) return a.holders.includes(b.at)
  // `b` is not there yet, so nothing inside it is either: `a` would be created below the same directory, by the same
  // segments
  return a.at === b.at && b.rest.every((segment, i) => i < a.rest.length && folded(a.rest[i]) === folded(segment))
}

/**
 * Whether a skill install or uninstall would change a global library (skill-install R4), judged after R3 has admitted
 * its target: refused when a landing — the project skills directory written into or deleted from — is a library or lies
 * inside one, and with it every copy in it, or when a copy — a landing and the skill's name — is a library or holds one.
 * A landing is judged where it really leads, as the copy is written or deleted through it; a copy as the operation acts
 * on it, the entry itself not followed, so a project's copy that is a link to a library stays deletable and only the
 * link goes. A library is judged both ways: deleting a library that is itself a link would remove it too.
 */
export function skillOpLibrary(
  op: { landings: readonly string[]; copies: readonly string[]; libraries: readonly string[] },
  probe: { dir: (path: string) => DirPlace | null; entry: (path: string) => DirPlace | null }
): { ok: true } | { ok: false; code: typeof ERR.skillTargetGlobalLibrary } {
  const libraries = op.libraries.flatMap((l) => [probe.dir(l), probe.entry(l)])
  const landings = op.landings.map((l) => probe.dir(l))
  const copies = op.copies.map((c) => probe.entry(c))
  const changes =
    landings.some((l) => libraries.some((lib) => within(l, lib))) ||
    copies.some((c) => libraries.some((lib) => within(lib, c)))
  return changes ? { ok: false, code: ERR.skillTargetGlobalLibrary } : { ok: true }
}
