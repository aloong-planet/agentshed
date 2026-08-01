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

test('Agents 页七个 tab 逐个切换均渲染,无错误', async () => {
  const l = await launch()
  const win = await l.app.firstWindow()
  const tabs = win.locator('.pane-head .tabs .tab')
  // count() 是即时读取,须先等渲染完成再计数
  await expect(tabs).toHaveCount(7)
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
 * v2 组件(Subagents/Memory/Plugins):预置 fixture home(AGENTSHED_HOME_OVERRIDE 注入)
 * 全链路断言 F3 双向场景与新分栏渲染——不依赖本机真实数据。
 */
test('F3+新分栏:project-scope 插件双向显示;Subagents/Memory 抽屉全链路', async () => {
  // 造 fixture home:demo 项目 + project-scope 插件(含 skills/hooks)+ 双端 subagents + memory
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // 插件包(skills + hooks)
  const pkg = join(home, 'plug-pkg')
  mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
  writeFileSync(join(pkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(pkg, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: 先问后做\n---\nx')
  mkdirSync(join(pkg, 'hooks'), { recursive: true })
  writeFileSync(
    join(pkg, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [] }] } })
  )
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@official': [
          { scope: 'project', version: '6.2.0', installPath: pkg, projectPath: demo }
        ]
      }
    })
  )
  mkdirSync(join(demo, '.claude'), { recursive: true })
  writeFileSync(join(demo, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': true } }))
  // 双端 subagents
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'agents', 'code-reviewer.md'),
    '---\ndescription: 审代码\ntools: Read, Grep\n---\nYou are a reviewer.'
  )
  mkdirSync(join(home, '.codex', 'agents'), { recursive: true })
  writeFileSync(
    join(home, '.codex', 'agents', 'code-reviewer.toml'),
    'name = "code-reviewer"\ndescription = "审代码"\ndeveloper_instructions = "You are a reviewer."\n'
  )
  // demo 项目的 memory
  const enc = demo.replace(/[^A-Za-z0-9]/g, '-')
  mkdirSync(join(home, '.claude', 'projects', enc, 'memory'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'projects', enc, 'memory', 'MEMORY.md'),
    '# 记忆主文件\n- 要点甲\n- [踩坑](pitfalls.md) 有效相对链接\n- [已删条目](gone.md) 失效目标\n'
  )
  writeFileSync(join(home, '.claude', 'projects', enc, 'memory', 'pitfalls.md'), '# 踩坑\n独特内容乙')

  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败/.test(t)) errors.push(t)
  })
  const win = await app.firstWindow()
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })

  // ① Subagents 分栏:双端同名合并一行,点行直开抽屉,抽屉内切双端
  await tab('Subagents').click()
  const row = win.locator('.it.row-btn', { hasText: 'code-reviewer' })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(win.locator('.drawer')).toBeVisible()
  await expect(win.locator('.drawer .kv')).toContainText('Read, Grep')
  await win.locator('.drawer .sideseg button', { hasText: 'Codex' }).click()
  await expect(win.locator('.drawer .kv')).toContainText('sandbox_mode')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // 抽屉盖住窗口中心,点左侧可见 mask 区

  // ② 全局 Plugins:F3 之一——user 层未启用;展开可见内含 skills 与 hooks 摘要
  await tab('Plugins').click()
  const plugRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(plugRow).toContainText('未启用')
  await plugRow.click()
  await expect(win.locator('.exp-area')).toContainText('superpowers:brainstorming')
  await expect(win.locator('.exp-area')).toContainText('SessionStart × 1')

  // ③ 全局 Memory:行展开文件列表,点文件抽屉经白名单按需读取
  await tab('Memory').click()
  const memRow = win.locator('.it.row-btn', { hasText: 'demo-proj' })
  await memRow.click()
  await win.locator('.sub-list .it.row-btn', { hasText: 'pitfalls.md' }).click()
  await expect(win.locator('.drawer .raw')).toContainText('独特内容乙')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // 抽屉盖住窗口中心,点左侧可见 mask 区

  // ④ demo 详情:F3 之二——project 层启用;Skills 分栏含插件命名空间条目(只读)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  const detRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(detRow).toContainText('启用')
  await expect(detRow).toContainText('project 层')
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const nsSkill = win.locator('.it', { hasText: 'superpowers:brainstorming' })
  await expect(nsSkill).toBeVisible()
  await expect(nsSkill.locator('.ins')).toHaveCount(0) // G3:插件条目无装卸按钮
  // ⑤ 详情 Memory:MEMORY.md 主体直接渲染
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('要点甲')

  // ⑥ 主文件里的相对链接:点击**不得导航整窗**(2026-08-02 bug 回归点),
  //    有效目标在 app 内开抽屉;失效目标提示且仍不导航。
  const urlBefore = win.url()
  await win.locator('.pane-body .md a', { hasText: '踩坑' }).click()
  await expect(win.locator('.drawer .raw')).toContainText('独特内容乙')
  expect(win.url()).toBe(urlBefore)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.pane-body .md a', { hasText: '已删' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url()).toBe(urlBefore)

  // ⑦ 抽屉宽度 = min(680, 右侧内容区 80%):窄窗下不得盖满内容区(2026-08-02 bug)。
  //    几何检验,不看 CSS 声明——声明对了但变量没接线照样会盖满。
  const drawerGeom = async (): Promise<{ pane: number; drawer: number; left: number; paneLeft: number }> =>
    win.evaluate(() => {
      const d = document.querySelector('.drawer') as HTMLElement
      const pane = document.querySelector('.stage .pane') as HTMLElement
      const dr = d.getBoundingClientRect()
      const pr = pane.getBoundingClientRect()
      return { pane: pr.width, drawer: dr.width, left: dr.left, paneLeft: pr.left }
    })
  for (const [w, label] of [
    [1400, '宽窗'],
    [900, '窄窗']
  ] as const) {
    await win.setViewportSize({ width: w, height: 800 })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
    await win.locator('.it.row-btn', { hasText: 'pitfalls.md' }).click()
    const g = await drawerGeom()
    expect(Math.abs(g.drawer - Math.min(680, g.pane * 0.8)), `${label}:宽度规则`).toBeLessThan(2)
    expect(g.left, `${label}:抽屉不得盖满内容区`).toBeGreaterThan(g.paneLeft + 1)
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  }

  expect(errors).toEqual([])
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
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

    // ① x 轴几何检验:标签集合 = 当前视图数据日(默认窗宽放得下全部标签),
    //    互不重叠、不越出轴容器、逐标钉对应柱中心(首尾贴边 clamp 例外)。
    //    禁止用"span 数量/非空数"冒充可见——重叠与越界的标签也非空。
    //    已知缺口:窗口缩放的 ResizeObserver 接线与 resize+刷新并发未自动化
    //    (补测条件:electron setBounds 的稳定驱动;简略逻辑本身由 axis.test.ts 覆盖)。
    const checkAxis = (): Promise<string[]> => win.evaluate(() => {
      const axisEl = document.querySelector('.xaxis') as HTMLElement | null
      const chartEl = document.querySelector('.chart') as HTMLElement | null
      if (!axisEl || !chartEl) return ['no-mount']
      const problems: string[] = []
      const aR = axisEl.getBoundingClientRect()
      const spans = Array.from(axisEl.children) as HTMLElement[]
      const cols = Array.from(chartEl.children) as HTMLElement[]
      const dataCols = cols.filter((c) => c.querySelector('.sp'))
      if (spans.length !== dataCols.length)
        problems.push(`标签数 ${spans.length} ≠ 数据柱数 ${dataCols.length}`)
      let prevRight = -Infinity
      for (const s of spans) {
        const r = s.getBoundingClientRect()
        if (r.left < prevRight + 1) problems.push(`重叠:${s.textContent}`)
        prevRight = r.right
        if (r.left < aR.left - 0.5 || r.right > aR.right + 0.5) problems.push(`越界:${s.textContent}`)
        const day = s.getAttribute('data-day')
        const col = cols.find((c) => c.getAttribute('data-day') === day)
        if (!col) {
          problems.push(`无对应柱:${s.textContent}`)
          continue
        }
        const cR = col.getBoundingClientRect()
        const off = Math.abs((cR.left + cR.right) / 2 - (r.left + r.right) / 2)
        const atEdge = r.left <= aR.left + 1.5 || r.right >= aR.right - 1.5
        if (off > 1 && !atEdge) problems.push(`偏移 ${off.toFixed(1)}px:${s.textContent}`)
      }
      return problems
    })
    expect(await checkAxis()).toEqual([])

    // 视图切换后轴跟随当前视图的数据日(合计→Claude→合计,往返无残留)
    for (const m of ['Claude', '合计']) {
      await win.locator('.grp-t .seg button', { hasText: m }).click()
      expect(await checkAxis(), `切到 ${m} 后`).toEqual([])
    }

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
