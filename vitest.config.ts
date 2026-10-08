import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
    include: ['src/**/*.test.ts'],
    globals: false
  }
})
