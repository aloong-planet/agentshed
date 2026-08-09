import { defineConfig } from '@playwright/test'

// E2E drives a real Electron; `pnpm build` has to run first (so the out/ build exists).
// Serial execution (a conservative choice, not a hard constraint): every case has its own userData
// (launch always passes --user-data-dir
// with a temporary directory) and the single-instance lock is scoped by userData, so they do not collide
// — the original comment about lock collisions and a shared userData
// was false the day it was written (it and the per-case isolating launch helper came from the same
// commit, 84a642c). What serial execution really prevents
// is several parallel Electron instances amplifying timing flakes through resource contention; a case
// that shares a userData or reads the real data roots
// is the kind that would genuinely require it.
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']]
})
