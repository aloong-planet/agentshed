#!/usr/bin/env node
// Local macOS packaging signs with the Developer ID Application identity in the login keychain and never
// notarises. Run before electron-builder: when no identity is found electron-builder skips signing without
// failing, and Apple Silicon kills such a build at launch, so the build stops here instead.
// Usage: node scripts/check-mac-identity.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** The valid "Developer ID Application" identities in `security find-identity -v -p codesigning` output. */
export function developerIdIdentities(output) {
  return [...output.matchAll(/^\s*\d+\) [0-9A-F]{40} "(Developer ID Application: [^"]+)"$/gm)].map((m) => m[1])
}

function main() {
  // -v lists only valid identities, as electron-builder's own lookup does (it also queries with -v), so an
  // identity whose trust chain is broken does not count here; the guidance below shows how to list those too
  const r = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) {
    console.error(`check-mac-identity: could not query the keychain (${r.error?.message ?? (r.stderr.trim() || `exit ${r.status}`)})`)
    return 1
  }
  const found = developerIdIdentities(r.stdout)
  if (found.length === 0) {
    console.error(
      'check-mac-identity: no valid "Developer ID Application" signing identity in the keychain.\n' +
        'Local packages must be signed with it. Install the certificate, then retry.\n' +
        'To also list identities that are present but not trusted (for example a missing intermediate certificate):\n' +
        '  security find-identity -v'
    )
    return 1
  }
  console.log(`check-mac-identity: found ${found.join(', ')}`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main())
