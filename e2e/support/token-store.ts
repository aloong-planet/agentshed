// The app's token store (ADR-0044) as an e2e case reaches it from outside. This test process is another process to the
// app's, so its own SQLite (`node:sqlite`) takes the store's locks the way the other process of token-stats C27 does.
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
