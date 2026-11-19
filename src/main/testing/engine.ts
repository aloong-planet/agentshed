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
  /** Names the file the module panics on while it reads that file's ranges or one of its turns, or none; one for the
   * whole process */
  seamPanicWhileReading(file: string | null): void
  /** Names the file the module panics on while it assembles the blocks of one of its turns, or none; one for the whole
   * process */
  seamPanicWhileAssembling(file: string | null): void
  /** A stand-in for a function that parses a session file: answers with the file once the seam lets it through */
  seamParse(file: string): string
}

/** The hold seam a build made for tests exports (engine/src/seams.rs) */
export interface HoldSeam extends EngineModule {
  /** Holds every read of `file`'s ranges or turns, and every full-text search of it, on the read's own thread before it opens the
   * file, until it is released; one for the whole process. A read held for five seconds panics instead. */
  seamHoldReadsOf(file: string): void
  /** Releases the reads of `file`, or of every file: those waiting go on, and those to come are not held. It returns once
   * those waiting have left the gate, so that holding the file again right after it holds only the reads that come later */
  seamReleaseReadsOf(file: string | null): void
  /** The file of each read waiting at the gate now, in the order they came to it */
  seamReadsHeld(): string[]
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

/** The observed-reads seam a build made for tests exports (engine/src/seams.rs) */
export interface ObservedReadsSeam extends EngineModule {
  /** Has every read of one of `file`'s turns from now on hand over, for its body, the lines the read kept, unassembled
   * (`ObservedBody`), in place of the body its side makes of them, or, given false, the body again; keyed by file, one
   * table for the whole process */
  seamObserveTurnReadsOf(file: string, observed: boolean): void
}

/** A turn read's body under the observed-reads seam: the lines the read kept, once the side left out those the turn
 * does not hold, each as text with its line feed left off */
export interface ObservedBody {
  keptLines: string[]
}

/** The line-limit seam a build made for tests exports (engine/src/seams.rs) */
export interface LineLimitSeam extends EngineModule {
  /** Holds the lines the line reader takes from `file` to `limit` bytes from now on, or, given null, to the reader's own
   * limit again; keyed by file, one table for the whole process */
  seamLimitLinesOf(file: string, limit: number | null): void
  /** Reads `file` through the line reader, through its zstd stream when `cold`: how many lines it gave; throws when it
   * cannot be read to its end */
  seamEachLine(file: string, cold: boolean): number
}
