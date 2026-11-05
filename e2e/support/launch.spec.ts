import type {} from '../../src/renderer/src/env'
// The one way to start the app (test-layers::US-004): what a start lets a case replace, and the check of what the main
// process reports. The check runs after a case, so a case that should trip it is marked to fail: a case that fails for
// another reason would pass here too, but the allowed case takes the same steps and must pass.
import { rmSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { closeApp } from '../close-app'
import { mkEmptyProjectHome } from './homes'
import { failOnMainErrors, makeUserData, startApp } from './launch'

const main = failOnMainErrors()

/** Runs the steps on an app of the file's own, closing it and removing its directories afterwards */
async function withApp(steps: (win: Awaited<ReturnType<Awaited<ReturnType<typeof startApp>>['app']['firstWindow']>>) => Promise<void>, env?: Record<string, string>): Promise<void> {
  const userData = makeUserData()
  const home = mkEmptyProjectHome()
  const { app } = await startApp({ userData, home, errors: main.errors, env })
  try {
    await steps(await app.firstWindow())
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
}

/** A read no snapshot lists: the handler refuses it over the real channel, and the main process reports the refusal */
const provoke = async (win: Parameters<Parameters<typeof withApp>[0]>[0]): Promise<void> => {
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

test('a case can replace a pinned value', async () => {
  await withApp(async (win) => {
    await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
  }, { AGENTSHED_SYSTEM_LANGUAGES: 'zh-Hans-CN' })
})
