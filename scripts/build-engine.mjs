#!/usr/bin/env node
// Builds the engine module (ADR-0045) from source, with the build it belongs to (scripts/lib/engine-build.mjs).
//
//   node scripts/build-engine.mjs             the build for development and tests, with the panic seam, at
//                                             engine/dist/agentshed_engine.node: what an unpackaged run, the tests, the
//                                             scan benchmark and the parity command load
//   node scripts/build-engine.mjs --packaged  the build packaging ships (build/engine-before-pack.cjs), without the
//                                             seam, refused when it exports one or reports another build
//
// cargo runs in engine/, where rustup reads the pinned toolchain, and with --locked, so a build never moves a
// dependency the lock file does not hold. Each kind has its own target directory, so building one does not rebuild
// the other.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENGINE_DIR, engineBuild } from './lib/engine-build.mjs'

/** Where the development and test build is placed, the path an unpackaged run loads (src/main/engine-module.ts) */
export const DEV_MODULE = join(ENGINE_DIR, 'dist', 'agentshed_engine.node')

/** The prefix every test seam the module exports is named with (engine/src/seams.rs), so a new one is refused too */
const SEAM_EXPORT_PREFIX = 'seam'

/** The library cargo writes for the crate on this platform */
function libraryName(platform = process.platform) {
  if (platform === 'darwin') return 'libagentshed_engine.dylib'
  if (platform === 'win32') return 'agentshed_engine.dll'
  return 'libagentshed_engine.so'
}

/** The library a packaged build ships: electron-builder.yml copies it into the app (mac.extraResources) */
export function packagedLibrary(platform = process.platform) {
  return join(ENGINE_DIR, 'target', 'packaged', 'release', libraryName(platform))
}

/** cargo's arguments for one kind of build: only the development and test build has the seams */
export function cargoArgs({ packaged }) {
  const kind = packaged ? 'packaged' : 'tests'
  return ['build', '--release', '--locked', '--target-dir', join('target', kind), ...(packaged ? [] : ['--features', 'test-seams'])]
}

/**
 * The gate on a module just built: it must report the build it was given, and the one packaging ships must export no
 * test seam. `exports` is the loaded module's.
 */
export function checkBuiltModule(exports, { build, packaged }) {
  const seams = Object.keys(exports).filter((name) => name.startsWith(SEAM_EXPORT_PREFIX))
  if (packaged && seams.length > 0) throw new Error(`the packaged engine module exports test seams (${seams.join(', ')}); it must be built without the test-seams feature`)
  const reported = typeof exports.build === 'function' ? exports.build() : undefined
  if (reported !== build) throw new Error(`the engine module just built reports build ${JSON.stringify(reported)}, not this build's ${JSON.stringify(build)}`)
}

/** Builds one kind of module, checks it, and returns where it is */
export function buildEngine({ packaged = false, quiet = false } = {}) {
  const build = engineBuild()
  const args = [...cargoArgs({ packaged }), ...(quiet ? ['--quiet'] : [])]
  const result = spawnSync('cargo', args, { cwd: ENGINE_DIR, stdio: 'inherit', env: { ...process.env, AGENTSHED_ENGINE_BUILD: build } })
  if (result.error) {
    const missing = result.error.code === 'ENOENT' ? ' (is Rust installed? https://rustup.rs)' : ''
    throw new Error(`cargo could not start${missing}: ${result.error.message}`)
  }
  if (result.status !== 0) throw new Error(`building the engine module failed: cargo ${args.join(' ')} exited with ${result.status ?? result.signal}`)
  let path = join(ENGINE_DIR, 'target', packaged ? 'packaged' : 'tests', 'release', libraryName())
  if (!packaged) {
    // A new file renamed into place rather than written over: a running app keeps the module it mapped, and on macOS
    // a mapped library written in place stops the process that holds it
    mkdirSync(join(ENGINE_DIR, 'dist'), { recursive: true })
    const next = `${DEV_MODULE}.${process.pid}.tmp`
    copyFileSync(path, next)
    renameSync(next, DEV_MODULE)
    path = DEV_MODULE
  }
  const module = { exports: {} }
  process.dlopen(module, path)
  checkBuiltModule(module.exports, { build, packaged })
  return path
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const unknown = args.filter((a) => a !== '--packaged' && a !== '--quiet')
    if (unknown.length > 0) throw new Error(`usage: node scripts/build-engine.mjs [--packaged] [--quiet] (not ${unknown.join(' ')})`)
    const path = buildEngine({ packaged: args.includes('--packaged'), quiet: args.includes('--quiet') })
    console.log(`[engine] ${path} (build ${engineBuild()})`)
  } catch (error) {
    console.error(`[engine] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
