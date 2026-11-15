// The runtime's built-in SQLite module (Node's `node:sqlite`, present in Electron 43). The application reads no
// database through it: the engine module reads agy's and keeps the token store. Its users are `pnpm bench:scan`, which
// copies the app's token store with `VACUUM INTO` and reads copies of a store, and the test fixtures, which write agy's
// conversation databases.
//
// Fetched with `process.getBuiltinModule` rather than a static import: Vite 5's import analysis does not know
// `node:sqlite` as a built-in — it strips the `node:` prefix and goes looking for a package called `sqlite` — so a
// static import fails to load under Vitest; and `createRequire(import.meta.url)` would break the scripts that bundle
// the scan as CommonJS (`pnpm bench:scan`, `pnpm restore:archive`), where `import.meta` is empty. The type import below
// is erased at compile time and never reaches a bundler.
import type * as Sqlite from 'node:sqlite'

const sqlite = process.getBuiltinModule('node:sqlite')

export const DatabaseSync = sqlite.DatabaseSync
export type DatabaseSync = Sqlite.DatabaseSync
