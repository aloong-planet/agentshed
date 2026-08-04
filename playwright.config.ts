import { defineConfig } from '@playwright/test'

// E2E 驱动真实 Electron;需先 pnpm build(out/ 产物存在)。
// 串行执行:多实例会撞单实例锁与共享 userData。
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']]
})
