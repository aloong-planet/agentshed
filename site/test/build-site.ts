// Vitest global setup: one fresh build of the site per test run, into a new temporary directory.
//
// The built-site check reads what the build produced, so it must never read an old one: a check of a stale
// dist/ looks exactly like a change that did not take. Building here, rather than in a `build && test`
// script, keeps a bare `vitest run` honest too. The tests only read the output, so they share it.
//
// The directory is made under the site's own node_modules/.cache, not the operating system's temporary directory:
// Astro moves the built assets into outDir with a rename, which fails (EXDEV) when outDir is on another filesystem
// than the site, as the temporary directory is on GitHub's ubuntu-26.04 runners.
//
// It is built as production, as `astro build` builds it: Vitest runs with NODE_ENV=test, and Vite takes a set
// NODE_ENV as given and builds as production only for "production", so the build would otherwise ship the dev
// server's choices (import.meta.env.DEV true).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'astro'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The build output directory */
    builtSite: string
  }
}

export default async function setup(project: TestProject): Promise<() => void> {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const cache = join(root, 'node_modules', '.cache')
  mkdirSync(cache, { recursive: true })
  const outDir = mkdtempSync(join(cache, 'agentshed-site-'))
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({ root, outDir, logLevel: 'warn' })
  } finally {
    process.env.NODE_ENV = nodeEnv
  }
  project.provide('builtSite', outDir)
  return () => rmSync(outDir, { recursive: true, force: true })
}
