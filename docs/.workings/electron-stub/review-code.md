# Review — code (step 5), unit tests without the real electron package

Date: 2026-10-08 · Scope: `vitest.config.ts` (alias), `src/main/testing/electron-stub.ts`,
`e2e/global-setup.ts`.

## ① Underlying premises — no finding

- electron 43 has no install script: its `index.js` downloads the binary on the first `require` when
  `dist/` is missing (read from the package).
- In Node, the real package exports only an executable path, so every named import is `undefined` —
  the stub reproduces that. Measured: an import of a name the stub does not export (`dialog`) is
  `undefined`, not an error, so the stub needs no list of names.
- Only `security.ts`, `app-protocol.ts` and `system-language.ts` import electron for values; the
  renderer imports nothing from electron.

## ② Runnability — one finding, fixed

- **Hidden coupling: e2e relied on the unit tests' download.** On macOS the e2e global setup copies
  `node_modules/electron/dist` (`scripts/quiet-electron.sh`), which exits 1 when `dist/` is absent. In a
  fresh checkout the unit tests had always downloaded it first as a side effect. Reproduced: with the
  stub alone, `pnpm e2e` failed at that step. Fixed by requiring electron at the start of the global
  setup — one serial download in one process, before any worker; a no-op when installed.
- Fresh-state result with both changes: unit tests 0 downloads, 725 passed, `dist/` still absent
  afterwards; e2e one download (in the setup), 89 passed.
- `pnpm dev` and `smoke` resolve electron through electron-vite in a single process; unchanged.

## ③ Security — no finding

No runtime code changed.

## ④ Consistency — no finding

The stub sits under `src/main/` so `tsconfig.node.json` covers it (outside every tsconfig, lint would
fail on it). The vitest comment "pure Node modules, depending on neither Electron nor jsdom" is now
enforced by the alias rather than only stated.

## Refactor list

None.
