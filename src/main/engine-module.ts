// The engine module (ADR-0045) as the application's threads load it: the scan worker, every parse worker and the
// main process each load it once, through Node-API, from the path the main process works out. No other engine exists:
// a module that will not load, or that is another build's, fails every scan and every question-index read that asks
// for it (token-stats, Scans and the window). Nothing here imports electron, which a worker thread cannot load.
import { join } from 'node:path'

/** What the application calls in the engine module */
export interface EngineModule {
  /** The build the module belongs to (scripts/lib/engine-build.mjs) */
  build(): string
}

/** Where a thread loads the engine module from, and the build it must report; plain data, so it crosses to a worker */
export interface EngineSource {
  path: string
  build: string
}

/** Defined by every bundler of this code from the module's sources (scripts/lib/engine-build.mjs) */
declare const __ENGINE_BUILD__: string

/** The build this code was made with: a module reporting another one is from another build */
export const ENGINE_BUILD: string = __ENGINE_BUILD__

/**
 * The test seam that points an unpackaged run at another module file: e2e's way to a module that will not load. A
 * packaged build refuses it at launch, by its prefix (ADR-0042), and never reads it here either.
 */
export const ENGINE_MODULE_SEAM = 'AGENTSHED_ENGINE_MODULE'

/**
 * Where the engine module is. A packaged build ships it outside the asar archive, in its resources
 * (electron-builder.yml); an unpackaged run loads the development build (scripts/build-engine.mjs), two levels above
 * the directory of the built main process, out/main, as above src/main.
 */
export function engineModulePath(run: {
  packaged: boolean
  resourcesPath: string
  mainDir: string
  env: Readonly<Record<string, string | undefined>>
}): string {
  if (run.packaged) return join(run.resourcesPath, 'engine', 'agentshed_engine.node')
  const seam = run.env[ENGINE_MODULE_SEAM]
  if (seam) return seam
  return join(run.mainDir, '..', '..', 'engine', 'dist', 'agentshed_engine.node')
}

/** What each path gave this thread, once: the module, or why it would not load */
const loaded = new Map<string, { module: Record<string, unknown> } | { error: Error }>()

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * The engine module, confirmed as this build's own. The path is opened once per thread; a load that failed fails again
 * for the rest of the run, as no build of the module can change under a running app.
 */
export function loadEngineModule(source: EngineSource): EngineModule {
  let got = loaded.get(source.path)
  if (!got) {
    try {
      const holder = { exports: {} as Record<string, unknown> }
      process.dlopen(holder, source.path)
      got = { module: holder.exports }
    } catch (error) {
      got = { error: new Error(`the engine module will not load from ${source.path}: ${messageOf(error)}`) }
    }
    loaded.set(source.path, got)
  }
  if ('error' in got) throw got.error
  const build = got.module['build']
  const reported = typeof build === 'function' ? (build as () => unknown)() : undefined
  if (reported !== source.build) {
    throw new Error(`the engine module at ${source.path} is another build's (${JSON.stringify(reported)}), not this build's (${JSON.stringify(source.build)})`)
  }
  return got.module as unknown as EngineModule
}
