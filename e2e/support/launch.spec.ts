import type {} from '../../src/renderer/src/env'
// The one way to start the app (test-layers::US-004): what a start pins, what a case can replace, and the check of what
// the main process reports. The check runs after a case, so a case that should trip it is marked to fail: such a case
// also passes on a failure from another cause, but the allowed case takes the same steps and must pass.
// Gap: the window taking no foreground is driven on macOS only, because the seam has a darwin guard and Linux has nothing
// to drive.
import { rmSync } from 'node:fs'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from '../close-app'
import { mkEmptyProjectHome } from './homes'
import { failOnMainErrors, makeUserData, startApp } from './launch'

const main = failOnMainErrors()

/** Runs the steps on an app of its own, closing it and removing its directories afterwards */
async function withApp(steps: (win: Page, app: ElectronApplication) => Promise<void>, env?: Record<string, string>): Promise<void> {
  const userData = makeUserData()
  const home = mkEmptyProjectHome()
  const { app } = await startApp({ userData, home, errors: main.errors, env })
  try {
    await steps(await app.firstWindow(), app)
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
}

/** A read no snapshot lists: the handler refuses it over the real channel, and the main process reports the refusal */
const provoke = async (win: Page): Promise<void> => {
  const answer = await win.evaluate(async () => {
    try {
      await window.agentshed.readArtifact('/nowhere/listed.md')
      return 'read'
    } catch {
      return 'refused'
    }
  })
  expect(answer).toBe('refused')
  await expect.poll(() => main.errors.length).toBeGreaterThan(0)
}

test('an error the case did not allow fails it', async () => {
  test.fail()
  await withApp(provoke)
})

test('an error the case allowed does not', async () => {
  main.allow(/artifact-not-whitelisted/)
  await withApp(provoke)
})

test('an allowance nothing matched fails the case', async () => {
  test.fail()
  main.allow(/an error no case provokes/)
  await withApp(async (win) => {
    await win.waitForSelector('.rail .ri')
  })
})

test('an allowance nothing matched fails the case even when another did match', async () => {
  test.fail()
  main.allow(/artifact-not-whitelisted/)
  main.allow(/an error no case provokes/)
  await withApp(provoke)
})

test('an error sharing a chunk of stderr with an allowed one still fails the case', async () => {
  test.fail()
  main.allow(/prefs-write-failed/)
  await withApp(async (_win, app) => {
    // One write, so the two lines arrive as one chunk every time
    await app.evaluate(() => {
      process.stderr.write('agentshed-error:{"code":"prefs-write-failed"}\nTypeError: another report\n')
    })
    await expect.poll(() => main.errors.length).toBeGreaterThan(0)
  })
})

test('an error reported while the app quits fails the case', async () => {
  test.fail()
  await withApp(async (_win, app) => {
    await app.evaluate(({ app: running }) => {
      running.on('will-quit', () => process.stderr.write('TypeError: reported while quitting\n'))
    })
  })
})

test('a case can replace a pinned value', async () => {
  await withApp(async (win) => {
    await expect(win.locator('.ri.set')).toHaveAttribute('title', '设置')
  }, { AGENTSHED_SYSTEM_LANGUAGES: 'zh-Hans-CN' })
})

test('English is pinned whatever the host says', async () => {
  const host = process.env.AGENTSHED_SYSTEM_LANGUAGES
  process.env.AGENTSHED_SYSTEM_LANGUAGES = 'zh-Hans-CN'
  try {
    await withApp(async (win) => {
      await expect(win.locator('.ri.set')).toHaveAttribute('title', 'Settings')
    })
  } finally {
    if (host === undefined) delete process.env.AGENTSHED_SYSTEM_LANGUAGES
    else process.env.AGENTSHED_SYSTEM_LANGUAGES = host
  }
})

test('a start takes no foreground', async () => {
  test.skip(process.platform !== 'darwin', 'the seam has a darwin guard')
  await withApp(async (win, app) => {
    await win.waitForSelector('.rail .ri')
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  })
})
