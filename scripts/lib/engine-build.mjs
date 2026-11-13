// The build the engine module belongs to (ADR-0045): a digest of the module's sources. scripts/build-engine.mjs builds
// it into the module, and every bundler of the application's code defines it as `__ENGINE_BUILD__` (electron-vite,
// vitest, the scan benchmark and the parity command), so a thread refuses a module built from other sources than the
// code that loads it — one left over from an earlier checkout, say. One function computes it for both sides.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = fileURLToPath(new URL('../..', import.meta.url))
export const ENGINE_DIR = join(REPO, 'engine')

/** The files a build of the module is made from: its manifest, lock, build script, toolchain pin and Rust sources */
function sourceFiles() {
  const files = ['Cargo.toml', 'Cargo.lock', 'build.rs', 'rust-toolchain.toml'].map((name) => join(ENGINE_DIR, name))
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith('.rs')) files.push(path)
    }
  }
  walk(join(ENGINE_DIR, 'src'))
  return files
}

/** The digest of the module's sources: the same text wherever it is computed from the same files */
export function engineBuild() {
  const hash = createHash('sha256')
  const named = sourceFiles().map((file) => ({ name: relative(ENGINE_DIR, file).split(sep).join('/'), file }))
  named.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const { name, file } of named) {
    hash.update(name)
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

/** What a bundler defines for the application's code: the build its engine module must report */
export function engineBuildDefine() {
  return { __ENGINE_BUILD__: JSON.stringify(engineBuild()) }
}
