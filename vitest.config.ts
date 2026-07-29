import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    // 数据层与契约校验均为纯 Node 模块,不依赖 Electron / jsdom
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  }
})
