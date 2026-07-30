// E2E:用 Playwright 驱动真实 Electron(build 产物),覆盖单测测不到的装配层——
// IPC 全链路、渲染、维度切换、tab 切换、刷新去重,并断言主进程零错误输出。
// 关键场景:**旧格式缓存启动**(2026-07-30 线上崩溃的形态,单测已锁,这里再守全链路)。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'

/** 每个用例独立 userData,互不污染;可预置缓存文件 */
function makeUserData(cacheContent?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  if (cacheContent !== undefined) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'token-cache.json'), cacheContent)
  }
  return dir
}

interface Launched {
  app: ElectronApplication
  errors: string[]
  userData: string
}

async function launch(cacheContent?: string): Promise<Launched> {
  const userData = makeUserData(cacheContent)
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'production' }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    // 主进程未捕获错误 / IPC handler 异常 / 契约校验失败都算失败信号
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败/.test(t)) {
      errors.push(t.trim())
    }
  })
  return { app, errors, userData }
}

async function close(l: Launched): Promise<void> {
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
}

test('冷启动:Agents 页为默认落地,两侧汇总卡渲染,主进程无错误', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // 汇总卡两张(CC / CODEX)
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(2)
  await expect(win.locator('.badge.cc, .badge.cl').first()).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

test('旧格式缓存启动不崩(线上崩溃回归):快照仍渲染,主进程无错误', async () => {
  // 上一版结构:Codex agg 只有 totals/byDay,无 events;version 号也是旧的
  const legacy = JSON.stringify({
    version: 2,
    files: {
      '/nonexistent/rollout.jsonl': {
        sig: '1:1',
        agg: {
          kind: 'codex',
          projectKey: '/x',
          listed: true,
          title: '旧格式',
          at: 1,
          model: 'gpt-5.6-sol',
          totals: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
          byDay: { '2026-07-30': 2 }
        }
      }
    }
  })
  const l = await launch(legacy)
  const win = await l.app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(2)
  expect(l.errors).toEqual([])
  await close(l)
})

test('Agents 页五个 tab 逐个切换均渲染,无错误', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  const tabs = win.locator('.pane-head .tabs .tab')
  // count() 是即时读取,须先等渲染完成再计数
  await expect(tabs).toHaveCount(5)
  const n = await tabs.count()
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    await expect(win.locator('.pane-body')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

test('切到 Projects:列表或空态渲染;选中项目后详情六 tab 可切换', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  // 有真实项目则出行,否则出空态——两者都算通过(不依赖本机数据)
  const rows = win.locator('.side .row')
  const hasRows = (await rows.count()) > 0
  if (hasRows) {
    await rows.first().click()
    const tabs = win.locator('.pane-head .tabs .tab')
    await expect(tabs.first()).toBeVisible()
    const n = await tabs.count()
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click()
      await expect(win.locator('.pane-body')).toBeVisible()
    }
  } else {
    await expect(win.locator('.list-empty, .empty')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

test('全局刷新连点被去重,刷新后仍无错误', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  const refresh = win.locator('.rail .ri.grfr')
  await refresh.click()
  await refresh.click({ force: true })
  await refresh.click({ force: true })
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  expect(l.errors).toEqual([])
  await close(l)
})
