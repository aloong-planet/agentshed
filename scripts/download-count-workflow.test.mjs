// A static test of the download count's workflow (.github/workflows/download-count.yml; download-count Failures G3 and
// G8): the watchdog runs every hour and on demand, holds no secret, and has no input, so nothing in it can accept a
// gap; the count and its gaps are the Worker's.
//
// Gap: GitHub's runner runs it with its own implementation; the first scheduled run after the merge shows it reading
// the statistics file through the download host (docs/ops/download-count.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { strings } from './testing/workflow.mjs'

const require = createRequire(import.meta.url)
// The js-yaml electron-builder ships, through the packaging asset's own loader: no second YAML parser here
const yaml = require('../build/mac-packaging.cjs').yamlParser()
const workflow = yaml.load(readFileSync(new URL('../.github/workflows/download-count.yml', import.meta.url), 'utf8'))

// Failure G3: a gap is accepted only through the Worker's setting, so no run here takes an input
test('the watchdog runs every hour at minute 47, and on demand with no input', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch'])
  assert.deepEqual(workflow.on.schedule, [{ cron: '47 * * * *' }])
  assert.equal(workflow.on.workflow_dispatch, null)
})

// Failure G8: the watchdog holds no secret, so nothing it runs can write the count
test('the watchdog reads no secret and no token, reads the repository only, and runs the watch on the download host', () => {
  const read = [...strings(workflow)].filter(({ value }) => /secrets\.|github\.token/.test(value))
  assert.deepEqual(read, [])
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  const [jobId, ...otherJobs] = Object.keys(workflow.jobs)
  assert.deepEqual(otherJobs, [])
  const { steps } = workflow.jobs[jobId]
  assert.equal(steps.at(-1).run, 'node scripts/download-count-watchdog.mjs')
  assert.equal(steps.filter((step) => 'run' in step).length, 1)
  assert.equal(workflow.env.DOWNLOAD_HOST, 'https://dl.agentshed.aloongplanet.com')
  for (const { path, value } of strings(workflow)) assert.ok(!value.includes('${{'), path)
})
