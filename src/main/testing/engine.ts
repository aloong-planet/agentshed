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
  /** Names the entry the module panics while the session walk reads it — a rollout, a Grok update stream, an agy
   * database — or none; one for the whole process */
  seamPanicWhileWalking(file: string | null): void
  /** Names the file the module panics on while it reads that file's ranges, or none; one for the whole process */
  seamPanicWhileReading(file: string | null): void
  /** A stand-in for a function that parses a session file: answers with the file once the seam lets it through */
  seamParse(file: string): string
}

/** The copy seam a build made for tests exports (engine/src/seams.rs) */
export interface CopySeam extends EngineModule {
  /** Watches the directories the module makes in `parent` to copy agy's databases into, or none; one for the whole
   * process */
  seamWatchCopiesUnder(parent: string | null): void
  /** Each directory made in the watched one since it was named, with its mode as made */
  seamCopiesMade(): Array<{ path: string; mode: number }>
}

/** The store-write seam a build made for tests exports (engine/src/seams.rs) */
export interface StoreWriteSeam extends EngineModule {
  /** Makes the next write to a token store fail after this many of its statements, or none fail; one for the whole
   * process, spent by the write it fails */
  seamCutStoreWriteAfter(statements: number | null): void
}

/** The JSON string seam a build made for tests exports (engine/src/seams.rs) */
export interface JsonStringSeam extends EngineModule {
  /** Reads `text` as one string value through the reader every line is read by: the string, or null when the reader
   * refuses the text */
  seamReadJsonString(text: string): string | null
}
