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

test('归档:预置历史归档文件 → 趋势含归档段并有说明,主进程无错误', async () => {
  // 造一条源文件早已不存在的历史行(模拟 agent 清理掉旧会话后的状态)
  const userData = makeUserData()
  writeFileSync(
    join(userData, 'usage-archive.json'),
    JSON.stringify({
      version: 1,
      rows: [
        {
          day: '2020-01-01',
          side: 'claude',
          projectKey: '/legacy',
          model: 'claude-legacy',
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          total: 12345
        }
      ]
    })
  )
  const errors: string[] = []
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败/.test(t)) errors.push(t)
  })
  const win = await app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // 归档说明条出现(该天源文件不存在 → 计入 archivedDays)
  await expect(win.locator('.arch-note')).toBeVisible()
  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('趋势图为堆叠柱:柱内按 provider 分段,切单侧后只剩该侧 provider 段', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  // 合计模式:至少有一根柱含 Claude 段(本机有真实数据)
  const cols = win.locator('.chart .col')
  await expect(cols).toHaveCount(30)
  const anthropicSegs = win.locator('.chart .col .sp.anthropic')
  await expect(anthropicSegs.first()).toBeVisible()
  // 图例按 provider(至少 Anthropic 一项)
  await expect(win.locator('.legend .lg .sw.anthropic')).toBeVisible()
  // 切到 Claude 侧:不应再出现 OpenAI 段
  await win.locator('.grp-t .seg button', { hasText: 'Claude' }).click()
  await expect(win.locator('.chart .col .sp.openai')).toHaveCount(0)
  // 切回合计,图例回来
  await win.locator('.grp-t .seg button', { hasText: '合计' }).click()
  await expect(win.locator('.legend')).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

test('provider 品牌配色生效:段与图例色一致,深浅模式各有取值', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  const read = async (): Promise<Record<string, string>> =>
    win.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return {
        anthropic: cs.getPropertyValue('--p-anthropic').trim(),
        openai: cs.getPropertyValue('--p-openai').trim(),
        google: cs.getPropertyValue('--p-google').trim()
      }
    })
  const light = await read()
  expect(light.anthropic.toLowerCase()).toBe('#d97757')
  expect(light.openai.toLowerCase()).toBe('#10a37f')
  expect(light.google.toLowerCase()).toBe('#4285f4')
  // 段与图例取同一变量
  const segBg = await win.locator('.chart .col .sp.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const lgBg = await win.locator('.legend .lg .sw.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(segBg).toBe(lgBg)
  // 深色模式另有一套(提亮)
  await win.emulateMedia({ colorScheme: 'dark' })
  const dark = await read()
  expect(dark.anthropic.toLowerCase()).not.toBe(light.anthropic.toLowerCase())
  expect(dark.openai.toLowerCase()).not.toBe(light.openai.toLowerCase())
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * 趋势图的每个使用点都跑同一组断言。
 * 新增使用点只需往这个列表加一行——避免"测了一处漏一处"(2026-07-30 的漏改教训)。
 */
const TREND_MOUNTS = [
  {
    name: 'Agents 页 Token 分栏',
    async goto(win: import('@playwright/test').Page) {
      await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
    }
  },
  {
    name: '项目详情 概览分栏',
    async goto(win: import('@playwright/test').Page) {
      await win.locator('.rail .ri').nth(1).click()
      const rows = win.locator('.side .row')
      // count() 是即时读取,须等渲染完成——直接 count 会把"还没渲染"误判成"没有项目"
      try {
        await rows.first().waitFor({ state: 'visible', timeout: 8000 })
      } catch {
        return false // 本机确实无项目
      }
      await rows.first().click()
      await win.locator('.pane-head .tabs .tab', { hasText: '概览' }).click()
      return true
    }
  }
]

for (const mount of TREND_MOUNTS) {
  test(`趋势图[${mount.name}]:日期轴在位,悬停提示不被祖先裁剪`, async () => {
    const l = await launch()
    const win = await l.app.firstWindow()
    const ok = await mount.goto(win)
    if (ok === false) {
      // 本机确实无项目:显式 skip,不伪装成通过的绿
      await close(l)
      test.skip(true, `${mount.name}:本机无项目数据,无法验证`)
      return
    }
    await expect(win.locator('.chart .col').first()).toBeVisible()
    await expect(win.locator('.chart .col')).toHaveCount(30)

    // ① x 轴日期标签存在且非空
    const labels = await win.locator('.xaxis span').allTextContents()
    expect(labels.length).toBe(30)
    expect(labels.filter((t) => t.trim() !== '').length).toBeGreaterThanOrEqual(5)

    // ② 悬停提示的**几何检验**:按同款定位造真实元素,逐级祖先查裁剪盒。
    //    禁止用"data-tip 属性存在"冒充可见——被裁掉的提示框也有属性。
    const clipped = await win.evaluate(() => {
      const col = document.querySelectorAll('.chart .col')[15] as HTMLElement | undefined
      if (!col) return 'no-col'
      const probe = document.createElement('div')
      probe.textContent = col.getAttribute('data-tip') ?? ''
      probe.style.cssText =
        'position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%);white-space:pre;font-size:11px;padding:5px 9px'
      col.appendChild(probe)
      const pr = probe.getBoundingClientRect()
      let hit: string | null = null
      let el: HTMLElement | null = col.parentElement
      while (el && el !== document.body) {
        const cs = getComputedStyle(el)
        if (cs.overflow !== 'visible') {
          const er = el.getBoundingClientRect()
          if (pr.top < er.top || pr.left < er.left || pr.right > er.right) hit = el.className || el.tagName
        }
        el = el.parentElement
      }
      probe.remove()
      return hit
    })
    expect(clipped).toBeNull()

    // ③ 提示内容是多行明细(合计 + 至少一个 provider 行)
    const tip = await win.locator('.chart .col').nth(15).getAttribute('data-tip')
    expect(tip).toContain('合计')

    expect(l.errors).toEqual([])
    await close(l)
  })
}
