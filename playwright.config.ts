import { defineConfig } from '@playwright/test'

// E2E 驱动真实 Electron;需先 pnpm build(out/ 产物存在)。
// 串行执行(保守取舍,非硬约束):每例 userData 独立(launch 一律 --user-data-dir
// 临时目录),单实例锁按 userData 界定作用域,并不互撞——原注释"撞锁与共享 userData"
// 出生即假(它与每例隔离的 launch 助手是同一个 commit 写的,84a642c)。串行真正防的
// 是多 Electron 实例并行时资源抖动放大时序 flake;若引入共享 userData / 读真实数据根
// 的用例,才是必须串行。
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']]
})
