// The app's token store (ADR-0044) as an e2e case reaches it from outside. This test process is another process to the
// app's, so its own SQLite (`node:sqlite`) takes the store's locks the way the other process of token-stats C27 does.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** The store's file in a settings directory (engine/src/store/) */
export const STORE_FILE = 'token-store.sqlite'

/**
 * Holds the app's token store for writing until released, as another process in the middle of a write would: a write
 * the app makes meanwhile waits for it, and fails once its wait is over (token-stats C3, C27)
 */
export function holdStoreWrites(userData: string): { release(): void } {
  const db = new DatabaseSync(join(userData, STORE_FILE))
  db.exec('BEGIN IMMEDIATE')
  return {
    release: () => {
      db.exec('ROLLBACK')
      db.close()
    }
  }
}

/**
 * The combinations the store's group results were combined under (token-stats, Implementation Decisions, Cache), each
 * once: none before the app has made the store or stored a result, as no file is made here
 */
export function storedCombinations(userData: string): string[] {
  const file = join(userData, STORE_FILE)
  if (!existsSync(file)) return []
  const db = new DatabaseSync(file)
  try {
    return db.prepare('SELECT DISTINCT combination FROM results ORDER BY combination').all().map((row) => String(row['combination']))
  } catch {
    // No results table yet: the store is being made
    return []
  } finally {
    db.close()
  }
}
