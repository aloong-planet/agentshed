// CI wiring: the actual YAML's triggers, conditions, commands and final exit status. Rules are tested
// in ci-scope/ci-gate tests. Gap: GitHub's scheduler and hosted runner need the actual PR CI run;
// evaluating expressions locally does not prove scheduling or the online ruleset configuration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { ESLint } from 'eslint'
import { truthy } from '@actions/expressions/result'
import { evaluate } from './testing/workflow.mjs'

const require = createRequire(import.meta.url)
const yaml = require('../build/mac-packaging.cjs').yamlParser()
const workflow = yaml.load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const job = (id) => workflow.jobs[id] ?? assert.fail(`Missing ${id}`)
const commands = (id) => job(id).steps.filter((step) => step.run).map((step) => step.run)

test('every target PR and main push gets classification, policy and a gate with the existing cancellation policy', () => {
  assert.deepEqual(workflow.on, { push: { branches: ['main'] }, pull_request: { branches: ['main'] } })
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(workflow.concurrency, { group: '${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': true })
  for (const id of ['changes', 'repo-policy']) {
    assert.equal(job(id).if, undefined)
    assert.equal(job(id)['continue-on-error'], undefined)
  }
  assert.ok(commands('changes').includes('node scripts/ci-scope.mjs'))
  assert.equal(job('changes').steps.find((step) => step.uses?.startsWith('actions/checkout@')).with['fetch-depth'], 0)
  assert.deepEqual(job('changes').outputs, { app: '${{ steps.scope.outputs.app }}', site: '${{ steps.scope.outputs.site }}' })
  assert.equal(job('changes').steps.find((step) => step.run === 'node scripts/ci-scope.mjs').id, 'scope')
})

test('product jobs follow classification independently and do not require another product to run', () => {
  for (const [app, site, expected] of [
    ['false', 'false', []],
    ['true', 'false', ['app-checks', 'e2e']],
    ['false', 'true', ['site-checks']],
    ['true', 'true', ['app-checks', 'e2e', 'site-checks']]
  ]) {
    const context = { needs: { changes: { outputs: { app, site } } } }
    const running = ['app-checks', 'e2e', 'site-checks'].filter((id) => truthy(evaluate(job(id).if, context)))
    assert.deepEqual(running, expected)
  }
  for (const id of ['app-checks', 'e2e', 'site-checks']) {
    assert.deepEqual([job(id).needs].flat(), ['changes'])
    assert.equal(job(id)['continue-on-error'], undefined)
  }
})

test('the split retains the original product and repository checks with independent installs', () => {
  const expected = {
    'app-checks': ['pnpm install --frozen-lockfile', 'pnpm typecheck', 'pnpm lint:app', 'pnpm test', 'pnpm test:scripts', 'pnpm check:i18n'],
    'site-checks': ['pnpm install --frozen-lockfile', 'pnpm install --frozen-lockfile', 'pnpm lint:site', 'pnpm test:site'],
    'repo-policy': ['pnpm install --frozen-lockfile', 'pnpm test:ci', 'pnpm check:ui', 'pnpm check:lang', 'pnpm check:nul']
  }
  for (const [id, runs] of Object.entries(expected)) assert.deepEqual(commands(id), runs, id)
  for (const [id, config] of Object.entries(workflow.jobs)) {
    for (const step of config.steps) {
      const label = `${id}: ${step.name ?? step.run ?? step.uses}`
      const failureArtifact = id === 'e2e' && step.uses?.startsWith('actions/upload-artifact@')
      assert.equal(step.if, failureArtifact ? 'failure()' : undefined, `${label} must not skip required work`)
      assert.equal(step['continue-on-error'], undefined, `${label} must not swallow failure`)
    }
  }
  for (const id of ['app-checks', 'e2e', 'repo-policy']) {
    assert.ok(job(id).steps.every((step) => step['working-directory'] !== 'site'), id)
  }
  assert.equal(job('site-checks').steps.filter((step) => step.run === 'pnpm install --frozen-lockfile' && step['working-directory'] === 'site').length, 1)
  assert.ok(commands('e2e').includes('xvfb-run -a pnpm e2e'))
  assert.equal(pkg.scripts.e2e, 'electron-vite build && playwright test')
  assert.ok(pkg.scripts.verify.includes('pnpm test:ci'))
  assert.ok(pkg.scripts.verify.includes('pnpm test:site'))
  assert.ok(pkg.scripts.verify.includes('pnpm e2e'))
})

test('the stable gate and compatibility check propagate real command failures and cannot be dependency-skipped', () => {
  const gate = job('ci-gate')
  assert.equal(gate.name, 'CI gate')
  assert.equal(gate.if, '${{ always() }}')
  assert.deepEqual([...gate.needs].sort(), ['app-checks', 'changes', 'e2e', 'repo-policy', 'site-checks'])
  assert.equal(gate['continue-on-error'], undefined)
  const step = gate.steps.find((item) => item.env?.NEEDS_JSON) ?? assert.fail('Missing gate step')
  assert.equal(step.run, 'node scripts/ci-gate.mjs')
  const needs = {
    changes: { result: 'success', outputs: { app: 'false', site: 'true' } },
    'repo-policy': { result: 'success' }, 'app-checks': { result: 'skipped' },
    e2e: { result: 'skipped' }, 'site-checks': { result: 'success' }
  }
  const run = (block, env) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', block], { env: { ...process.env, ...env }, encoding: 'utf8' })
  const gateEnv = () => ({ NEEDS_JSON: evaluate(step.env.NEEDS_JSON, { needs }).coerceString() })
  assert.equal(run(step.run, gateEnv()).status, 0)
  needs['site-checks'].result = 'failure'
  const failed = run(step.run, gateEnv())
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /site-checks: failure/)
  assert.equal(run(step.run, { NEEDS_JSON: '{bad-json' }).status, 1)

  const legacy = job('checks')
  assert.equal(legacy.name, 'typecheck + unit tests + shared-piece consistency')
  assert.equal(job('e2e').name, 'e2e(Electron)')
  assert.equal(legacy.if, '${{ always() }}')
  assert.equal(legacy['continue-on-error'], undefined)
  assert.deepEqual([legacy.needs].flat(), ['ci-gate'])
  for (const result of ['success', 'failure', 'cancelled', 'skipped', '']) {
    const alias = legacy.steps.find((item) => item.run)
    const env = { GATE_RESULT: evaluate(alias.env.GATE_RESULT, { needs: { 'ci-gate': { result } } }).coerceString() }
    assert.equal(run(alias.run, env).status, result === 'success' ? 0 : 1, result)
  }
})

test('application and website lint inputs partition the full lint input without requiring site packages to enumerate', async () => {
  assert.equal(pkg.scripts.lint, 'eslint . --max-warnings 0')
  assert.equal(pkg.scripts['lint:app'], 'eslint . --ignore-pattern site/ --max-warnings 0')
  assert.equal(pkg.scripts['lint:site'], 'eslint site/ --max-warnings 0')
  const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean))]
  assert.ok(files.length > 0)
  const fullLint = new ESLint()
  const appLint = new ESLint({ ignorePatterns: ['site/'] })
  const full = []
  const app = []
  const site = []
  for (const file of files) {
    if (!(await fullLint.isPathIgnored(file))) {
      full.push(file)
      if (file.startsWith('site/')) site.push(file)
    }
    if (!(await appLint.isPathIgnored(file))) app.push(file)
  }
  assert.ok(site.includes('site/src/download.ts'))
  assert.ok(app.includes('src/main/index.ts'))
  assert.ok(app.includes('scripts/ci-scope.mjs'))
  assert.ok(app.every((file) => !file.startsWith('site/')))
  assert.deepEqual([...app, ...site].sort(), full.sort())
})
