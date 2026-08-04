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
  /** 本次用的 fixture home(有则随 close 一并清理) */
  home?: string
}

/**
 * home 为 fixture 目录时经 AGENTSHED_HOME_OVERRIDE 注入(见 src/main/roots.ts)。
 *
 * **一律传 home,没有例外。** 不传就读开发机真实 ~/.claude,两种坏处:
 *   1. 断言数据的用例结果取决于跑测试的人有多少会话记录——自己机器上绿、CI 上红;
 *   2. 就算只断言通用 UI,每个用例都是独立 userData,缓存必然是空的,于是每次都要
 *      全量重扫真实数据(本机 638MB)。这会把用例推到断言超时的边缘——2026-08-02
 *      升 CACHE_VERSION 后,仅剩的两条读真实 home 的用例就是这么红的。
 *
 * **测试静音(AGENTSHED_NO_FOREGROUND)**:本地 macOS 上窗口不显示,免得 18 个实例
 * 轮番抢前台;CI 的 xvfb 不受影响(seam 有 darwin 守卫)。有效性已验:DOM 文本/几何/
 * 计算样式/toBeVisible 都走 layout 与 CDP,与窗口是否上屏无关(两类已知可红的变异在
 * 隐藏体制下重放仍红,2026-08-04)。**边界:真焦点语义除外**——document.hasFocus()、
 * autofocus、:focus 样式在隐藏窗口下不同;将来写输入框类用例(如票 08 搜索)时,
 * 要么经 CDP 显式聚焦,要么该用例单独去掉此变量,不许沉默依赖窗口聚焦。
 */
/**
 * `home` **必填**(2026-08-03 从可选改为必填):省略它 app 就去扫开发者的真实 `~/.claude`,
 * 用例结果随各人的数据量而变——CI 上 home 是空的所以照绿,本地却会超时挂掉。
 * 靠"记得传"守不住,交给 typecheck。
 */
async function launch(cacheContent: string | undefined, home: string): Promise<Launched> {
  const userData = makeUserData(cacheContent)
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      // 测试静音:不抢前台(macOS accessory 策略,见 src/main/index.ts)
      AGENTSHED_NO_FOREGROUND: '1'
    }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    // 主进程未捕获错误 / IPC handler 异常 / 契约校验失败都算失败信号
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|契约校验失败/.test(t)) {
      errors.push(t.trim())
    }
  })
  return { app, errors, userData, home }
}

async function close(l: Launched): Promise<void> {
  await l.app.close()
  rmSync(l.userData, { recursive: true, force: true })
  if (l.home) rmSync(l.home, { recursive: true, force: true })
}

/** 本地日(与主进程 localDay 同口径);趋势窗口是「近 30 天」,时间戳必须相对 now 算 */
function localDayOffset(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0) // 正午,避开时区把日期推到窗口外
  return d
}

/**
 * 造一个带两侧用量的 fixture home:Claude(→ Anthropic 段)+ Codex(→ OpenAI 段)。
 * 趋势图按 provider 分段,所以两侧都要有,否则「切到 Claude 侧后 OpenAI 段归零」
 * 这条断言在没有 OpenAI 数据时会**恒真**——测不出任何东西。
 */
function mkUsageHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-usage-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))

  // Claude:projects 全树扫描,目录名与注册表无关(未注册目录也计入全局)
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-') // 与 encodeClaudeProjectDir 同规则
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const usage = (model: string, at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at.toISOString(),
      message: {
        model,
        usage: {
          input_tokens: inTok,
          output_tokens: outTok,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0
        }
      }
    })
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(2).toISOString(), message: { role: 'user', content: '示例提问' } }),
      usage('claude-fable-5', localDayOffset(2), 1200, 300),
      // 第二条真实提问 —— 让两侧的提问条数不相等,条数断言才分得出"真读到了"
      // 与"两边都恰好是 1"。中间夹一条工具回灌,它不算提问(spec B1)。
      JSON.stringify({
        type: 'user',
        timestamp: localDayOffset(1).toISOString(),
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '工具返回' }] }
      }),
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: '第二个提问' } }),
      usage('claude-opus-5', localDayOffset(1), 800, 200),
      usage('claude-fable-5', localDayOffset(0), 500, 100)
    ].join('\n') + '\n'
  )

  // 预热会话:只有一条 Warmup,有 token 但没人问过任何东西(spec A3a → 不入列)
  writeFileSync(
    join(cdir, 'warmup.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(1).toISOString(), message: { role: 'user', content: 'Warmup' } }),
      usage('claude-fable-5', localDayOffset(1), 300, 60)
    ].join('\n') + '\n'
  )

  // Codex:sessions 全树,首行 session_meta 的 cwd 决定归属
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const turn = (at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      timestamp: at.toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: inTok,
            cached_input_tokens: 0,
            cache_write_input_tokens: 0,
            output_tokens: outTok,
            total_tokens: inTok + outTok
          }
        }
      }
    })
  writeFileSync(
    join(sdir, 'rollout-019fb0c0-1111-7af3-af7d-8505cedf1ec2.jsonl'),
    [
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'session_meta', payload: { cwd: proj } }),
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      // 真实提问:没有它这条会话按 spec A3a 不入列
      JSON.stringify({ timestamp: localDayOffset(2).toISOString(), type: 'event_msg', payload: { type: 'user_message', message: 'Codex 侧的提问' } }),
      turn(localDayOffset(2), 900, 150),
      // 停在昨天:与 Claude 侧(今天)拉开差距,"最近在前"才有得可判。
      // 两侧同时间戳的话,排序断言只能证明 reverse 有效,证不了按时间排。
      turn(localDayOffset(1), 400, 80)
    ].join('\n') + '\n'
  )
  return home
}

/**
 * 票 03b:Codex fork 的 fixture home。
 * **本机真实数据里真 fork 数为 0**(244 个会话中 9 个带 parent 的全是 subagent,
 * 按 A3 不入列),所以这条路径只能靠构造覆盖——形态照 codex.ts 实际读的字段来:
 * payload.id / payload.forked_from_id / 顶层 timestamp 当 fork 时刻。
 */
function mkForkHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-fork-'))
  const proj = join(home, 'fork-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })

  const PARENT = '019fb0c0-aaaa-7af3-af7d-8505cedf1ec2'
  const q = (at: Date, message: string): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'event_msg', payload: { type: 'user_message', message } })
  const usage = (at: Date, inTok: number, outTok: number): string =>
    JSON.stringify({
      timestamp: at.toISOString(),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: inTok, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: outTok, total_tokens: inTok + outTok } }
      }
    })
  const meta = (at: Date, id: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'session_meta', payload: { cwd: proj, id, ...extra } })
  const ctx = (at: Date): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } })

  // 父会话:两条提问
  writeFileSync(
    join(sdir, `rollout-${PARENT}.jsonl`),
    [meta(localDayOffset(4), PARENT), ctx(localDayOffset(4)), q(localDayOffset(4), '父会话第一问'), usage(localDayOffset(4), 500, 100), q(localDayOffset(3), '父会话第二问'), usage(localDayOffset(3), 300, 60)].join('\n') + '\n'
  )
  // 子会话:fork 自父,重放了父的两条(时间戳被改写),再加一条新的 → 应剩 1 条、标 ⑂ fork
  const CHILD = '019fb0c0-bbbb-7af3-af7d-8505cedf1ec2'
  writeFileSync(
    join(sdir, `rollout-${CHILD}.jsonl`),
    [meta(localDayOffset(2), CHILD, { forked_from_id: PARENT }), ctx(localDayOffset(2)), q(localDayOffset(2), '父会话第一问'), q(localDayOffset(2), '父会话第二问'), q(localDayOffset(2), '子会话的新问'), usage(localDayOffset(2), 200, 40)].join('\n') + '\n'
  )
  // 孤儿 fork:父不在扫描集内 → 只能启发式,标 ⑂? 剥离存疑
  const ORPHAN = '019fb0c0-cccc-7af3-af7d-8505cedf1ec2'
  writeFileSync(
    join(sdir, `rollout-${ORPHAN}.jsonl`),
    [meta(localDayOffset(1), ORPHAN, { forked_from_id: '019fb0c0-dead-7af3-af7d-8505cedf1ec2' }), ctx(localDayOffset(1)), q(localDayOffset(1), '孤儿会话的问'), usage(localDayOffset(1), 100, 20)].join('\n') + '\n'
  )
  return home
}

/** 有注册项目、但该项目一个会话都没有 —— 会话分栏的空态 */
function mkEmptyProjectHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-noses-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  return home
}

test('冷启动:Agents 页为默认落地,两侧汇总卡渲染,主进程无错误', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // 汇总卡两张(CC / CODEX)
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(2)
  await expect(win.locator('.badge.cc, .badge.cl').first()).toBeVisible()
  // #18:打包版渲染页必须跑在 app:// 上而非 file://(回退到 file:// 会静默丢掉
  // "可读范围锁死在产物目录"的保护,只有断言协议才拦得住)
  expect(win.url()).toMatch(/^app:\/\//)
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
  const l = await launch(legacy, mkUsageHome())
  const win = await l.app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect(win.locator('.pane-head .stats .stat')).toHaveCount(2)
  expect(l.errors).toEqual([])
  await close(l)
})

test('Agents 页七个 tab 逐个切换均渲染,无错误', async () => {
  const l = await launch(undefined, mkUsageHome())
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

// 原本是一条 if/else:有真实项目走 A 分支,没有走 B 分支。后果是**覆盖面不确定**
// ——开发机永远走 A,CI 永远走 B,没有任何一台机器把两条都测到;而 B 分支从没被
// 执行过,里面的 locator 同时命中侧栏与主区两个空态(strict mode violation),
// 写完就没跑过。拆成两条各自预置 fixture home 的确定性用例。
test('切到 Projects:有项目时出行,选中后详情各 tab 可切换', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  const rows = win.locator('.side .row')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  const tabs = win.locator('.pane-head .tabs .tab')
  await expect(tabs.first()).toBeVisible()
  const n = await tabs.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    await expect(win.locator('.pane-body')).toBeVisible()
  }
  expect(l.errors).toEqual([])
  await close(l)
})

test('切到 Projects:一个项目都没有时出侧栏空态', async () => {
  const l = await launch(undefined, mkdtempSync(join(tmpdir(), 'agentshed-e2e-nohome-')))
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row')).toHaveCount(0)
  // 限定在侧栏内:主区另有一个 .empty(「选择一个项目查看详情」),不限定就多命中
  await expect(win.locator('.side .list-empty')).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

// 票 session-view/02:会话分栏。fixture home 造两侧会话 + 一个只有 Warmup 的
// 预热会话(spec A3a:不入列但 token 照计),断言列表、排序、口径说明与空态。
test('会话分栏:列出会话、可切排序、预热会话不入列', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: '会话' }).click()

  // fixture 里 Claude 侧 2 个(1 真实 + 1 预热)、Codex 侧 1 个 → 只应列出 2 个
  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(2)
  await expect(win.locator('.pane-body .grp-t')).toContainText('2 个会话')
  // 预热会话的标题不得出现
  await expect(win.locator('.pane-body .card')).not.toContainText('Warmup')

  // 项目列表那个数字与本分栏必须同源:fixture 有 3 个会话文件(含 1 个预热),
  // 只有 2 个入列。改动前项目列表读的是文件数管线,会显示 3 —— 同一个概念两个数字。
  const meta = (await win.locator('.side .row .meta').first().innerText()).trim()
  expect(meta, `项目列表的会话数应与会话分栏一致,实际: ${meta}`).toMatch(/(^|\D)2$/)

  // 默认最近在前:第一行是较晚活动的那条
  const titleOf = async (i: number): Promise<string> =>
    (await rows.nth(i).locator('.t').innerText()).trim()
  // fixture 里 Claude 侧最后活动在今天、Codex 侧在昨天 —— 断言的是**具体哪条在前**,
  // 不是"两条不一样"。后者在时间戳相同时也成立,证不了按时间排序。
  expect(await titleOf(0)).toBe('示例提问')
  expect(await titleOf(1)).toBe('Codex 侧的提问')

  // 切最早在前 → 顺序翻转,条数不变
  await win.locator('.pane-body .seg button', { hasText: '最早在前' }).click()
  await expect(rows).toHaveCount(2)
  expect(await titleOf(0)).toBe('Codex 侧的提问')
  expect(await titleOf(1)).toBe('示例提问')
  await expect(win.locator('.pane-body .grp-t')).toContainText('正序')

  expect(l.errors).toEqual([])
  await close(l)
})

// 票 session-view/03a:提问条数上行。两条会话的条数**故意不相等**——都写 1 的话,
// 断言分不出"真按会话读到了"与"两边碰巧一样"。
test('会话分栏:每行显示本会话的真实提问条数', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: '会话' }).click()

  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(2)
  const countOf = async (i: number): Promise<string> =>
    (await rows.nth(i).locator('.n').innerText()).trim()

  // 默认最近在前:第 0 行是 Claude 侧(2 条真实提问,中间那条 tool_result 不算),
  // 第 1 行是 Codex 侧(1 条)
  expect(await rows.nth(0).locator('.t').innerText()).toBe('示例提问')
  expect(await countOf(0), 'Claude 侧两条真实提问,工具回灌不计入').toBe('2 提问')
  expect(await countOf(1), 'Codex 侧一条真实提问').toBe('1 提问')

  expect(l.errors).toEqual([])
  await close(l)
})

test('会话分栏:排序选择在切走分栏后仍然记得', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: '会话' }).click()
  await win.locator('.pane-body .seg button', { hasText: '最早在前' }).click()
  await expect(win.locator('.pane-body .grp-t')).toContainText('正序')

  // 切走再切回:tab 是条件渲染,组件会被卸载,组件内 useState 存不住
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: '会话' }).click()
  await expect(win.locator('.pane-body .grp-t')).toContainText('正序')
  await expect(
    win.locator('.pane-body .se .t').first(),
    '切回来应保持"最早在前",第一行是较早的那条'
  ).toHaveText('Codex 侧的提问')

  expect(l.errors).toEqual([])
  await close(l)
})

test('会话分栏:无会话项目出空态;概览会话卡可点入本分栏', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: '会话' }).click()
  await expect(win.locator('.pane-body .none')).toContainText('暂无会话')
  expect(l.errors).toEqual([])
  await close(l)
})

test('概览的会话卡点一下进「会话」分栏', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  // 概览是默认分栏,直接点第一张会话卡
  await win.locator('.pane-body .se.row-btn').first().click()
  await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('会话')
  await expect(win.locator('.pane-body .grp-t')).toContainText('个会话')
  expect(l.errors).toEqual([])
  await close(l)
})

test('全局刷新连点被去重,刷新后仍无错误', async () => {
  const l = await launch(undefined, mkUsageHome())
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
  // 必须给 fixture home:本用例只关心 userData 里的归档文件,却因为没注入 home 而去扫
  // **开发者的真实 ~/.claude**;又因为 makeUserData() 每次都是全新临时目录,token 缓存
  // 恒为冷,于是首屏耗时随各人的数据量走。CI 上 home 是空的所以一直绿,本机 600MB+
  // 数据下本地实测三次挂两次(2026-08-03,票 03a)。
  // 这是本文件开头那条纪律的漏网之鱼——它没走 launch(),直接调了 electron.launch。
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: mkEmptyProjectHome(),
      AGENTSHED_NO_FOREGROUND: '1'
    }
  })
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
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  // 合计模式:fixture 预置了两侧用量 → Anthropic 与 OpenAI 段都该在
  const cols = win.locator('.chart .col')
  await expect(cols).toHaveCount(30)
  const anthropicSegs = win.locator('.chart .col .sp.anthropic')
  await expect(anthropicSegs.first()).toBeVisible()
  // 图例按 provider(至少 Anthropic 一项)
  await expect(win.locator('.legend .lg .sw.anthropic')).toBeVisible()
  // 先钉住「切换前 OpenAI 段确实存在」——否则下面那条归零断言在无 Codex
  // 数据时恒真,测不出任何东西(原来读真实 home 时就有这个隐患)
  expect(await win.locator('.chart .col .sp.openai').count()).toBeGreaterThan(0)
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
  const l = await launch(undefined, mkUsageHome())
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
  // 必须先等样式表真正应用再读 CSS 变量:直接读会拿到空串(样式未加载完)。
  // 这个竞态一直在,只是 app:// 改变了加载时序后才稳定暴露——用渲染完成的元素做闸。
  await expect(win.locator('.chart .col').first()).toBeVisible()
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
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      // 测试静音:不抢前台(macOS accessory 策略,见 src/main/index.ts)
      AGENTSHED_NO_FOREGROUND: '1'
    }
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
      // fixture home 保证有且只有一个项目,不再需要"本机没项目就 skip"的分支
      await rows.first().waitFor({ state: 'visible', timeout: 8000 })
      await rows.first().click()
      await win.locator('.pane-head .tabs .tab', { hasText: '概览' }).click()
    }
  }
]

for (const mount of TREND_MOUNTS) {
  test(`趋势图[${mount.name}]:日期轴在位,悬停提示不被祖先裁剪`, async () => {
    // 必须喂 fixture 数据:无数据时「标签数 === 数据柱数」是 0 === 0,
    // 整套几何断言空过——跑了但什么都没验证。项目详情那条更直接:
    // 没项目就被 skip 掉,在 CI 上等于零覆盖。
    const l = await launch(undefined, mkUsageHome())
    const win = await l.app.firstWindow()
    await mount.goto(win)
    await expect(win.locator('.chart .col').first()).toBeVisible()
    await expect(win.locator('.chart .col')).toHaveCount(30)
    // 先钉住确实有数据柱,否则下面按数据柱做的几何检验会因空集合而恒真
    expect(await win.locator('.chart .col .sp').count()).toBeGreaterThan(0)

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

// 票 session-view/03b:fork 与剥离存疑两种标记
test('会话分栏:fork 会话剥掉重放前缀并标 ⑂ fork;父缺失的标 ⑂? 剥离存疑', async () => {
  const l = await launch(undefined, mkForkHome())
  const win = await l.app.firstWindow()
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: '会话' }).click()

  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(3)

  const rowOf = (title: string): ReturnType<typeof win.locator> =>
    win.locator('.pane-body .card .se').filter({ hasText: title })

  // 父会话:不是 fork,两条提问,无标记
  await expect(rowOf('父会话第一问').locator('.n')).toHaveText('2 提问')
  await expect(rowOf('父会话第一问').locator('.pill')).toHaveCount(0)

  // 子会话:重放的两条被剥掉,只剩自己那条;标 ⑂ fork
  const child = rowOf('子会话的新问')
  await expect(child.locator('.n'), '重放前缀未剥离的话会是 3 提问').toHaveText('1 提问')
  await expect(child.locator('.pill.fork')).toHaveText('⑂ fork')
  await expect(child.locator('.pill.forkq')).toHaveCount(0)

  // 孤儿 fork:父不在扫描集内,标存疑而不是确定
  const orphan = rowOf('孤儿会话的问')
  await expect(orphan.locator('.pill.forkq')).toContainText('剥离存疑')
  await expect(orphan.locator('.pill.fork')).toHaveCount(0)

  expect(l.errors).toEqual([])
  await close(l)
})
