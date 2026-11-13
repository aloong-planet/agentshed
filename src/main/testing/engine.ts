// The engine module the tests load (ADR-0045): the development build, with the panic seam, which vitest's global setup
// builds (scripts/testing/engine-setup.mjs) at the path an unpackaged run loads.
import { fileURLToPath } from 'node:url'
import { ENGINE_BUILD, type EngineModule, type EngineSource } from '../engine-module'

export const TEST_ENGINE: EngineSource = {
  path: fileURLToPath(new URL('../../../engine/dist/agentshed_engine.node', import.meta.url)),
  build: ENGINE_BUILD
}

/** The panic seam a build made for tests exports (engine/src/seams.rs) */
export interface PanicSeam extends EngineModule {
  /** Names the file the module panics while parsing, or none; one for the whole process */
  seamPanicWhileParsing(file: string | null): void
  /** A stand-in for a function that parses a session file: answers with the file once the seam lets it through */
  seamParse(file: string): string
}
