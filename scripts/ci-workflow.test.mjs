// CI wiring: the actual YAML's triggers, conditions, commands and final exit status. Rules are tested
// in ci-routing/ci-gate tests. Gap: GitHub's scheduler and hosted runner need the actual PR CI run;
// evaluating expressions locally does not prove scheduling or the online ruleset configuration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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
  assert.deepEqual(job('changes').outputs, { app: '${{ steps.scope.outputs.app }}' })
  assert.equal(job('changes').steps.find((step) => step.run === 'node scripts/ci-scope.mjs').id, 'scope')
})

test('the application jobs follow classification', () => {
  for (const [app, expected] of [
    ['false', []],
    ['true', ['app-checks', 'e2e']]
  ]) {
    const context = { needs: { changes: { outputs: { app } } } }
    const running = ['app-checks', 'e2e'].filter((id) => truthy(evaluate(job(id).if, context)))
    assert.deepEqual(running, expected)
  }
  for (const id of ['app-checks', 'e2e']) {
    assert.deepEqual([job(id).needs].flat(), ['changes'])
    assert.equal(job(id)['continue-on-error'], undefined)
  }
})

test('the jobs retain the application and repository checks with independent installs', () => {
  const expected = {
    'app-checks': ['pnpm install --frozen-lockfile', 'rustup toolchain install --no-self-update', 'pnpm typecheck', 'pnpm lint', 'pnpm test', 'pnpm test:scripts', 'pnpm check:i18n'],
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
  assert.ok(commands('e2e').includes('xvfb-run -a pnpm e2e'))
  assert.equal(pkg.scripts.e2e, 'node scripts/build-engine.mjs --quiet && electron-vite build && playwright test')
  // The engine module (ADR-0045) builds from source wherever the app is tested: the toolchain engine/ pins is installed
  // there, before the tests and the e2e run that build it
  for (const [id, builds] of [['app-checks', 'pnpm test'], ['e2e', 'xvfb-run -a pnpm e2e']]) {
    const runs = commands(id)
    const install = job(id).steps.find((step) => step.run === 'rustup toolchain install --no-self-update') ?? assert.fail(`${id}: no toolchain install`)
    assert.equal(install['working-directory'], 'engine', id)
    assert.ok(runs.indexOf(install.run) < runs.indexOf(builds), id)
  }
  assert.ok(pkg.scripts.verify.includes('pnpm test:ci'))
  assert.ok(pkg.scripts.verify.includes('pnpm e2e'))
})

test('the stable gate propagates real command failures and cannot be dependency-skipped', () => {
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['app-checks', 'changes', 'ci-gate', 'e2e', 'repo-policy'])
  const gate = job('ci-gate')
  assert.equal(gate.name, 'CI gate')
  assert.equal(gate.if, '${{ always() }}')
  assert.deepEqual([...gate.needs].sort(), ['app-checks', 'changes', 'e2e', 'repo-policy'])
  assert.equal(gate['continue-on-error'], undefined)
  const step = gate.steps.find((item) => item.env?.NEEDS_JSON) ?? assert.fail('Missing gate step')
  assert.equal(step.run, 'node scripts/ci-gate.mjs')
  const needs = {
    changes: { result: 'success', outputs: { app: 'true' } },
    'repo-policy': { result: 'success' }, 'app-checks': { result: 'success' },
    e2e: { result: 'success' }
  }
  const run = (block, env) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', block], { env: { ...process.env, ...env }, encoding: 'utf8' })
  const gateEnv = () => ({ NEEDS_JSON: evaluate(step.env.NEEDS_JSON, { needs }).coerceString() })
  assert.equal(run(step.run, gateEnv()).status, 0)
  needs['app-checks'].result = 'failure'
  const failed = run(step.run, gateEnv())
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /app-checks: failure/)
  assert.equal(run(step.run, { NEEDS_JSON: '{bad-json' }).status, 1)
})

test('the application job runs the full lint', () => {
  assert.equal(pkg.scripts.lint, 'eslint . --max-warnings 0')
  assert.ok(commands('app-checks').includes('pnpm lint'))
})
