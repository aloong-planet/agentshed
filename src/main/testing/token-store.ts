// The token store (ADR-0044) as a test reads and changes it from outside the engine — as another connection, a disk or
// a hand would — never through the engine. The file name and the table are the store's own (engine/src/store/).
//
// Inside this process every statement goes through the module's own SQLite (the store-statement seam,
// engine/src/seams.rs), never through `node:sqlite`: a second copy of SQLite in the process does not see the engine's
// locks, and closing its connection to the store takes them away and deletes the store's log from under the engine. A
// holder of the store's write lock is another process, as the other process of token-stats C27 is.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEngineModule, type EngineModule } from '../engine-module'
import { TEST_ENGINE } from './engine'

/** The store's file in a settings directory */
export const STORE_FILE = 'token-store.sqlite'

export const storePath = (cacheDir: string): string => join(cacheDir, STORE_FILE)

/** The store-statement seam a build made for tests exports (engine/src/seams.rs) */
interface StoreStatementSeam extends EngineModule {
  seamStoreStatement(dir: string, sql: string, params: Array<string | null>): Array<Array<string | null>>
}

/** Runs one statement against the store in `cacheDir`, as another connection would, and gives the rows it gives: each
 * value as text, a blob as `x'…'`, or null */
export function onStore(cacheDir: string, sql: string, ...params: Array<string | null>): Array<Array<string | null>> {
  return (loadEngineModule(TEST_ENGINE) as StoreStatementSeam).seamStoreStatement(cacheDir, sql, params)
}

/** One row as the store holds it: each column as text, a blob as `x'…'`, or null */
export interface StoredRow {
  path: string | null
  sig: string | null
  agg: string | null
  resume: string | null
}

/** Every row the store holds, in the store's order */
export function storeRows(cacheDir: string): StoredRow[] {
  return onStore(cacheDir, 'SELECT path, sig, agg, resume FROM entries ORDER BY rowid').map(([path, sig, agg, resume]) => ({ path, sig, agg, resume }))
}

/** Every entry the store holds, by path, its aggregate and resume state read back from their text */
export function storedEntries(cacheDir: string): Map<string, { sig: string | null; agg: Record<string, unknown>; resume: unknown }> {
  const out = new Map<string, { sig: string | null; agg: Record<string, unknown>; resume: unknown }>()
  for (const row of storeRows(cacheDir)) {
    out.set(String(row.path), {
      sig: row.sig,
      agg: JSON.parse(String(row.agg)) as Record<string, unknown>,
      resume: row.resume === null ? null : (JSON.parse(row.resume) as unknown)
    })
  }
  return out
}

/** The structure version the store records */
export function storeVersion(cacheDir: string): number {
  return Number(onStore(cacheDir, 'PRAGMA user_version')[0]?.[0])
}

/** The store's own files, byte for byte: the store and its log, '(none)' for one not there. The shared-memory file is
 * no data of the store, and a reader writes to it. */
export function storeFileBytes(cacheDir: string): string[] {
  return ['', '-wal'].map((suffix) => {
    const file = storePath(cacheDir) + suffix
    return existsSync(file) ? readFileSync(file).toString('base64') : '(none)'
  })
}

/** How many pages the store's file holds */
export function storePages(cacheDir: string): number {
  return Number(onStore(cacheDir, 'PRAGMA page_count')[0]?.[0])
}

/**
 * Another process with the store open, until it is let go: holding the store's write lock, as one in the middle of a
 * write is — a write the engine makes meanwhile waits for it, and fails once its wait is over (token-stats C27) — or
 * only connected to it, which keeps the store's log and shared-memory files there.
 */
export async function openElsewhere(cacheDir: string, { lock }: { lock: boolean }): Promise<{ release(): Promise<void> }> {
  const script =
    "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); " +
    "const locked = process.argv[2] === 'lock'; db.prepare('SELECT count(*) FROM entries').get(); if (locked) db.exec('BEGIN IMMEDIATE'); " +
    "console.log('open'); process.stdin.resume(); process.stdin.on('end', () => { if (locked) db.exec('ROLLBACK'); db.close() })"
  const other = spawn(process.execPath, ['-e', script, storePath(cacheDir), lock ? 'lock' : 'connect'], { stdio: ['pipe', 'pipe', 'ignore'] })
  const exited = new Promise<void>((resolve) => other.on('exit', () => resolve()))
  await new Promise<void>((resolve, reject) => {
    other.stdout.on('data', (b: Buffer) => b.toString().includes('open') && resolve())
    void exited.then(() => reject(new Error('the other process ended before it had the store open')))
  })
  return {
    release: async () => {
      other.stdin.end()
      await exited
    }
  }
}
