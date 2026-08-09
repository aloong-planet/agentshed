// A custom app:// scheme (official Security Checklist #18: avoid file://).
// The packaged build's renderer page runs on a standard secure origin (app://bundle) rather than
// file://'s opaque origin:
//   - security: the readable range is locked to the renderer build directory; under file:// one injection
//     can read the whole disk
//   - incidentally: a non-opaque origin puts localStorage on the fast path (the original motivation of
//     the Transfer project's ADR-0007,
//     electron/electron#24441 — under file:// the first access stalls for seconds)
//
// Ported from the Transfer project's src/main/app-protocol.ts with two adjustments for this project:
// the host name and the build root path.
// Two steps: registerSchemesAsPrivileged at module top level (before app ready), then
// registerAppProtocol after ready.
import { protocol, net } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** app://'s fixed host, carrying the packaged renderer build */
export const APP_HOST = 'bundle'

/**
 * app://bundle/<path> → an absolute path on disk, with directory traversal prevented.
 * null = invalid (wrong host / out of bounds / URL parse failure) → the caller returns 404. A pure
 * function, unit testable.
 */
export function resolveAppPath(rendererRoot: string, url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname !== APP_HOST) return null
  // decode (to allow non-ASCII and spaces in paths); URL.pathname naturally has no query string or
  // fragment; strip the leading /; an empty path falls back to index.html
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  if (p === '') p = 'index.html'
  const abs = normalize(join(rendererRoot, p))
  // Traversal protection: after normalisation it must still land inside rendererRoot
  const rootNorm = normalize(rendererRoot)
  const rootPrefix = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep
  if (abs !== rootNorm && !abs.startsWith(rootPrefix)) return null
  return abs
}

/**
 * Called once after app ready. Disk reads are delegated to net.fetch(file://): Electron fills in the
 * Content-Type,
 * turns a missing file into a 404 and supports Range, so no MIME table has to be maintained.
 */
export function registerAppProtocol(rendererRoot: string): void {
  protocol.handle('app', async (req) => {
    const abs = resolveAppPath(rendererRoot, req.url)
    if (!abs) return new Response('Not found', { status: 404 })
    try {
      // The await makes net.fetch's rejection land in this catch: some inputs (a path containing \0,
      // say) reject
      // rather than returning 404, and returning the promise directly would leak an unhandled rejection
      // or an errored request
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
