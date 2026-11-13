import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { engineBuildDefine } from './scripts/lib/engine-build.mjs'

export default defineConfig({
  // The build the engine module must report (ADR-0045), as electron-vite defines it for the app
  define: engineBuildDefine(),
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      // Unit tests never load the real electron package: see src/main/testing/electron-stub.ts
      electron: resolve('src/main/testing/electron-stub.ts')
    }
  },
  test: {
    // The data layer and the contract validation are pure Node modules, depending on neither Electron nor
    // jsdom — the electron alias above keeps that true for modules that import it for their runtime half
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    // Builds the engine module the tests load, once per run, from the sources the define above was computed from
    globalSetup: ['scripts/testing/engine-setup.mjs']
  }
})
