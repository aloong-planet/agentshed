// [DEBUG-t0d4y] 诊断探针(token 当天统计缺失 bug,Phase 1 反馈回路)——
// 断言用户症状:app 不重启、不手动刷新时,新产生的会话数据应自动出现。
// 现状预期:红(超时)——除启动与手动 ↻ 外不存在任何重扫触发。修复后转正式回归测试。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron } from '@playwright/test'

function usageLine(model: string, at: Date, out: number): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: at.toISOString(),
    message: {
      model,
      usage: {
        input_tokens: 10,
        output_tokens: out,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0
      }
    }
  })
}

test('探针:新会话数据无需手动刷新自动出现(当前实现应红)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-probe-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const now = new Date()
  writeFileSync(join(cdir, 'a.jsonl'), usageLine('claude-fable-5', new Date(now.getTime() - 3600e3), 111111) + '\n')

  const userData = mkdtempSync(join(tmpdir(), 'agentshed-probe-ud-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENTSHED_HOME_OVERRIDE: home,
      AGENTSHED_NO_FOREGROUND: '1'
    }
  })
  const win = await app.firstWindow()
  // 初扫完成:合计卡出现非零值
  const total = win.locator('.stats .v').first()
  await expect(total).not.toHaveText(/^0(\s|$)/, { timeout: 15_000 })
  const t0 = await total.textContent()

  // 追加"新产生"的会话数据(相当于 agent 在别处继续烧 token)
  writeFileSync(join(cdir, 'b.jsonl'), usageLine('claude-fable-5', now, 555555) + '\n')

  // 症状断言:不点 ↻,合计应在合理时间内自行变化——现状没有任何触发器,应超时红
  await expect
    .poll(async () => (await total.textContent()) !== t0, { timeout: 20_000, intervals: [1000] })
    .toBe(true)

  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})
