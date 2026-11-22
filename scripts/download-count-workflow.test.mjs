// A static test of the download count's workflow (.github/workflows/download-count.yml; landing-page::REQ-011/AC-04,
// Failure G3, Implementation Decisions "The collection"): it runs every hour and on demand, one run at a time, its
// credentials fail closed and reach only the counting step, and only a manual run can accept a gap.
//
// Conditions and env values are evaluated with @actions/expressions against event contexts shaped as GitHub
// documents them for the two triggers. Gap: GitHub's runner evaluates with its own implementation, and the run's
// effects need the secrets; the first scheduled run after the secrets are written closes it (docs/ops/download-count.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { evaluate, holds, jobEnv, strings } from './testing/workflow.mjs'

const require = createRequire(import.meta.url)
// The js-yaml electron-builder ships, through the packaging asset's own loader: no second YAML parser here
const yaml = require('../build/mac-packaging.cjs').yamlParser()
const workflow = yaml.load(readFileSync(new URL('../.github/workflows/download-count.yml', import.meta.url), 'utf8'))
const [jobId, ...otherJobs] = Object.keys(workflow.jobs ?? {})
const job = workflow.jobs?.[jobId]
const countStep = () => job.steps.find((step) => step.run === 'node scripts/download-count.mjs') ?? assert.fail('no counting step')

const SECRETS = {
  CF_ANALYTICS_API_TOKEN: 'cf-token',
  CF_ZONE_ID: 'zone',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'key',
  R2_BUCKET: 'agentshed-releases'
}
// Event contexts as GitHub documents them: a scheduled run has no inputs; a dispatch has its boolean input
const schedule = { github: { event_name: 'schedule', ref: 'refs/heads/main' }, inputs: {}, secrets: SECRETS }
const dispatch = (acceptGap) => ({ github: { event_name: 'workflow_dispatch', ref: 'refs/heads/main' }, inputs: { accept_gap: acceptGap }, secrets: SECRETS })

test('the count runs every hour at minute 47, and on demand with a gap input that is off by default', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch'])
  assert.deepEqual(workflow.on.schedule, [{ cron: '47 * * * *' }])
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ['accept_gap'])
  const input = workflow.on.workflow_dispatch.inputs.accept_gap
  assert.equal(input.type, 'boolean')
  assert.equal(input.default, false)
})

test('one run at a time, queued rather than cancelled, reading the repository only', () => {
  assert.deepEqual(otherJobs, [])
  assert.deepEqual(workflow.concurrency, { group: 'download-count', 'cancel-in-progress': false })
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  // The collection's margin under notOlderThan (scripts/download-count.mjs, MARGIN_MS) is a quarter of an hour
  assert.ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] < 15, String(job['timeout-minutes']))
})

test('a missing credential fails the run first, naming the six secrets, and the credentials reach only the counting step', () => {
  const requirement = job.steps.find((step) => step.name === 'Require the credentials') ?? assert.fail('no requirement')
  assert.equal(job.steps.indexOf(requirement), 0)
  const stepContext = (context) => ({ github: context.github, inputs: context.inputs, env: jobEnv(job, context) })
  assert.equal(holds(requirement.if, stepContext(schedule)), false)
  assert.equal(holds(countStep().if, stepContext(schedule)), true)
  for (const name of Object.keys(SECRETS)) {
    for (const secrets of [{ ...SECRETS, [name]: '' }, Object.fromEntries(Object.entries(SECRETS).filter(([key]) => key !== name))]) {
      assert.equal(holds(requirement.if, stepContext({ ...schedule, secrets })), true, `without ${name}`)
    }
  }
  const result = spawnSync('bash', ['-e', '-c', requirement.run], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /::error::.*CF_ANALYTICS_API_TOKEN.*CF_ZONE_ID.*R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_BUCKET/)

  const at = `jobs.${jobId}.steps.${job.steps.indexOf(countStep())}.env`
  const MAPPED = { AWS_ACCESS_KEY_ID: 'R2_ACCESS_KEY_ID', AWS_SECRET_ACCESS_KEY: 'R2_SECRET_ACCESS_KEY' }
  const counted = ['CF_ANALYTICS_API_TOKEN', 'CF_ZONE_ID', 'R2_ACCOUNT_ID', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'R2_BUCKET']
  const reads = [...strings(workflow)].filter(({ value }) => value.includes('secrets.'))
  assert.deepEqual(reads.map(({ path }) => path).sort(), [...Object.keys(job.env).map((name) => `jobs.${jobId}.env.${name}`), ...counted.map((name) => `${at}.${name}`)].sort())
  for (const { path, value } of reads) {
    if (path.startsWith(`jobs.${jobId}.env.`)) {
      // The boolean only compares: a secret's value never becomes the value of the job's env
      for (const use of value.matchAll(/secrets\.(\w+)(\s*[^\s])?/g)) assert.equal(use[2]?.trim(), '!', `${path}: ${use[0]}`)
    } else {
      const variable = path.split('.').pop()
      assert.equal(value, `\${{ secrets.${MAPPED[variable] ?? variable} }}`, path)
    }
  }
  assert.equal(countStep().env.GITHUB_TOKEN, '${{ github.token }}')
  for (const { path, value } of [...strings(workflow)].filter(({ path }) => path.endsWith('.run'))) assert.ok(!value.includes('${{'), path)
})

// Failure G3: a scheduled run never accepts a gap; a manual run does only when asked to
test('only a manual run with the gap input on tells the count to accept a gap', () => {
  const acceptGap = (context) => evaluate(countStep().env.ACCEPT_GAP, context).coerceString()
  assert.equal(acceptGap(schedule), 'false')
  assert.equal(acceptGap({ ...schedule, inputs: { accept_gap: true } }), 'false')
  assert.equal(acceptGap(dispatch(false)), 'false')
  assert.equal(acceptGap(dispatch(true)), 'true')
  assert.equal(workflow.env.DOWNLOAD_HOST, 'https://dl.agentshed.aloongplanet.com')
})
