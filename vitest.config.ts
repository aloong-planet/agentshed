import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    // The data layer and the contract validation are pure Node modules, depending on neither Electron nor
    // jsdom
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  }
})
