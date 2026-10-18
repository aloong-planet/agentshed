import { defineConfig } from 'vitest/config'

// The site's tests: unit tests next to the modules they test (src/), and the built-site check (test/)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/build-site.ts']
  }
})
