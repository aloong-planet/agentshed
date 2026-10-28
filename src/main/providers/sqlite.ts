// The runtime's built-in SQLite module (Node's `node:sqlite`, present in Electron 43), used to read Antigravity CLI's
// conversation databases (token-stats::CON-002).
//
// Fetched with `process.getBuiltinModule` rather than a static import: Vite 5's import analysis does not know
// `node:sqlite` as a built-in — it strips the `node:` prefix and goes looking for a package called `sqlite` — so a
// static import fails to load under Vitest; and `createRequire(import.meta.url)` would break the scripts that bundle
// the scan as CommonJS (`pnpm bench:scan`, `pnpm restore:archive`), where `import.meta` is empty. The type import below
// is erased at compile time and never reaches a bundler.
import type * as Sqlite from 'node:sqlite'

const sqlite = process.getBuiltinModule('node:sqlite') as typeof Sqlite

export const DatabaseSync = sqlite.DatabaseSync
export type DatabaseSync = Sqlite.DatabaseSync
