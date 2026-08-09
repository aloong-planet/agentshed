#!/usr/bin/env node
// Validate the Electron fuses' actual state in the packaged build (official Security Checklist #19).
// Why read the binary directly: electron-builder's electronFuses being written correctly does not mean
// it took effect
// (a version difference, a platform difference, or the config section in the wrong place all skip
// silently), and only reading the build output is fact.
// Usage: node scripts/check-fuses.mjs <path-to-.app>   (with no argument, find the newest under release/)
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// @electron/fuses marks the start of the fuse wire in the binary with this sentinel string
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'utf8')
const NAMES = [
  'runAsNode',
  'cookieEncryption',
  'nodeOptions',
  'nodeCliInspect',
  'asarIntegrity',
  'onlyLoadAppFromAsar',
  'v8Snapshot',
  'fileProtocolPrivileges',
  'wasmTrapHandlers' // Appended by Electron 41 (index 8); fuses are append-only and never reordered, so
  // reading by index is safe long-term
]
/** Expected values: identical to electron-builder.yml's electronFuses section; a mismatch is an error */
const EXPECT = {
  runAsNode: 'DISABLED',
  nodeOptions: 'DISABLED',
  nodeCliInspect: 'DISABLED',
  onlyLoadAppFromAsar: 'ENABLED',
  cookieEncryption: 'ENABLED',
  asarIntegrity: 'ENABLED',
  fileProtocolPrivileges: 'DISABLED' // No file:// page loads, so the privilege is pure surplus
}

function findApp() {
  const rel = 'release'
  if (!existsSync(rel)) return null
  for (const v of readdirSync(rel).sort().reverse()) {
    for (const d of ['mac-arm64', 'mac', 'mac-x64']) {
      const dir = join(rel, v, d)
      if (!existsSync(dir)) continue
      const app = readdirSync(dir).find((n) => n.endsWith('.app'))
      if (app) return join(dir, app)
    }
  }
  return null
}

const appPath = process.argv[2] ?? findApp()
if (!appPath) {
  console.error('No .app bundle found; run `pnpm build && npx electron-builder --dir` first')
  process.exit(2)
}
const bin = join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework')
if (!existsSync(bin)) {
  console.error(`Electron Framework not found: ${bin}`)
  process.exit(2)
}

const buf = readFileSync(bin)
const i = buf.indexOf(SENTINEL)
if (i < 0) {
  console.error('No fuse wire found in the binary — the fuses were never written')
  process.exit(1)
}
const start = i + SENTINEL.length
const count = buf[start + 1]
const actual = {}
for (let k = 0; k < count; k++) {
  const v = buf[start + 2 + k]
  actual[NAMES[k] ?? `fuse${k}`] = v === 0x31 ? 'ENABLED' : v === 0x30 ? 'DISABLED' : 'REMOVED'
}

let bad = 0
for (const [name, want] of Object.entries(EXPECT)) {
  const got = actual[name]
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${name} = ${got}${ok ? '' : ` (expected ${want})`}`)
}
if (bad) {
  console.error(`\n${bad} fuse(s) do not match electronFuses in electron-builder.yml`)
  process.exit(1)
}
console.log('\nFuses check passed')
