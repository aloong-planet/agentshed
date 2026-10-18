// Vitest global setup: one fresh build of the site per test run, into a new temporary directory.
//
// The built-site check reads what the build produced, so it must never read an old one: a check of a stale
// dist/ looks exactly like a change that did not take. Building here, rather than in a `build && test`
// script, keeps a bare `vitest run` honest too. The tests only read the output, so they share it.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  const outDir = mkdtempSync(join(tmpdir(), 'agentshed-site-'))
  await build({ root: fileURLToPath(new URL('..', import.meta.url)), outDir, logLevel: 'warn' })
  project.provide('builtSite', outDir)
  return () => rmSync(outDir, { recursive: true, force: true })
}
