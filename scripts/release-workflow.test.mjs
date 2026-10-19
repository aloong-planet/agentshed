// A static test of the release workflow (.github/workflows/release.yml; mac-distribution Testing Decisions): the
// four tiers follow the trigger, a manual run cannot reach publishing under any input, publishing needs the macOS
// gate job, credentials fail closed and stay confined, and the tag check comes before packaging.
//
// Conditions are evaluated with @actions/expressions, GitHub's published parser and evaluator for the expression
// language, against event contexts shaped as GitHub documents them for the two triggers. It is a regression guard
// only. Gap: GitHub's runner evaluates with its own implementation, and the jobs' real effects need GitHub, Apple
// and the secrets. The dispatch contexts are closed by the manual runs of both tiers; the tag contexts by the
// first pre-release tag's run and the first formal release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Evaluator, Lexer, Parser, data } from '@actions/expressions'
import { truthy } from '@actions/expressions/result'
import { parse as parseToml } from 'smol-toml'

const require = createRequire(import.meta.url)
// The js-yaml electron-builder ships, through the packaging asset's own loader: no second YAML parser here
const yaml = require('../build/mac-packaging.cjs').yamlParser()
const workflow = yaml.load(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'))
const profiles = parseToml(readFileSync(new URL('../capabilities.toml', import.meta.url), 'utf8'))['macos-distribution'].profiles

function toData(value) {
  if (value === undefined || value === null) return new data.Null()
  if (typeof value === 'string') return new data.StringData(value)
  if (typeof value === 'boolean') return new data.BooleanData(value)
  const dictionary = new data.Dictionary()
  for (const [key, item] of Object.entries(value)) dictionary.add(key, toData(item))
  return dictionary
}

const TEMPLATE = /^\$\{\{([\s\S]*)\}\}$/

/** One expression, as GitHub's evaluator reads it; a status function (success(), always()…) is not known here */
function evaluate(expression, context) {
  const { tokens } = new Lexer(expression.trim().replace(TEMPLATE, '$1')).lex()
  return new Evaluator(new Parser(tokens, Object.keys(context), []).parse(), toData(context)).evaluate()
}

/** Whether a job's or a step's `if` holds; no `if` always holds */
const holds = (condition, context) => condition === undefined || truthy(evaluate(condition, context))

/** A job's env as the runner sets it: each `${{ }}` value evaluated and turned into a string, the rest literal */
function jobEnv(job, context) {
  return Object.fromEntries(
    Object.entries(job.env ?? {}).map(([key, value]) => [key, TEMPLATE.test(value.trim()) ? evaluate(value, context).coerceString() : String(value)])
  )
}

// Event contexts shaped as GitHub documents them: a tag push has refs/tags/<tag>; a dispatch has the branch or tag
// it was dispatched on, and its inputs (none when dispatched without them)
const FORMAL_TAGS = ['v0.2.0', 'v1.0.0']
const PRE_RELEASE_TAGS = ['v0.1.0-beta', 'v0.1.0-beta.2', 'v0.2.0-alpha.1', 'v0.2.0-rc.1', 'v0.2.0-dev']
const ALL_SECRETS = { CSC_LINK: 'base64', CSC_KEY_PASSWORD: 'p', APPLE_ID: 'a@b.c', APPLE_APP_SPECIFIC_PASSWORD: 'p', APPLE_TEAM_ID: 'T' }
const push = (tag) => ({
  label: `push of ${tag}`,
  tagPush: true,
  github: { event_name: 'push', ref: `refs/tags/${tag}`, ref_name: tag },
  inputs: {},
  secrets: ALL_SECRETS
})
const dispatch = (verify, ref) => ({
  label: `dispatch on ${ref} with verify ${verify}`,
  tagPush: false,
  github: { event_name: 'workflow_dispatch', ref, ref_name: ref.replace(/^refs\/(heads|tags)\//, '') },
  inputs: verify === undefined ? {} : { verify },
  secrets: ALL_SECRETS
})
const BRANCH = 'refs/heads/feat/release-workflow'
const CONTEXTS = [
  ...[...FORMAL_TAGS, ...PRE_RELEASE_TAGS].map(push),
  dispatch(true, BRANCH),
  dispatch(true, 'refs/tags/v0.2.0'),
  dispatch(false, BRANCH),
  dispatch(false, 'refs/tags/v0.2.0'),
  dispatch(undefined, BRANCH)
]
/** The release profile for every tag and for a dispatch with the switch on; the local profile otherwise */
const expectedProfile = (context) => (context.tagPush || context.inputs.verify === true ? 'release' : 'local')

const gate = () => workflow.jobs?.gate ?? assert.fail('no gate job')
/** The context a gate step's `if` sees: the event, its inputs and the gate job's env */
const stepContext = (context) => ({ github: context.github, inputs: context.inputs, env: jobEnv(gate(), context) })
const packagingSteps = () => gate().steps.filter((step) => Object.values(profiles).some((profile) => step.run === profile.command))

test('the workflow runs on a v* tag push and on a manual dispatch with the verify switch, and on nothing else', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['push', 'workflow_dispatch'])
  assert.deepEqual(workflow.on.push, { tags: ['v*'] })
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.verify.type, 'boolean')
  assert.equal(workflow.on.workflow_dispatch.inputs.verify.default, false)
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ['verify'])
})

test('the tier follows the trigger: every tag and a dispatch with the switch run the release profile, any other dispatch the local one', () => {
  assert.equal(CONTEXTS.length, 12)
  assert.equal(packagingSteps().length, 2)
  for (const context of CONTEXTS) {
    const running = packagingSteps().filter((step) => holds(step.if, stepContext(context)))
    assert.deepEqual(
      running.map((step) => step.run),
      [profiles[expectedProfile(context)].command],
      context.label
    )
  }
})

test('publishing runs only on a tag push, after the gate job passed; a manual run cannot reach it under any input', () => {
  const publish = workflow.jobs?.publish ?? assert.fail('no publish job')
  assert.deepEqual([publish.needs].flat(), ['gate'])
  assert.ok(CONTEXTS.some((context) => !context.tagPush) && CONTEXTS.some((context) => context.tagPush))
  for (const context of CONTEXTS) {
    // evaluate() knows no status function, so a condition with always() or failure() throws here: GitHub adds
    // success() only to a condition without one, and that is what skips publishing after a failed gate
    assert.equal(holds(publish.if, { github: context.github, inputs: context.inputs }), context.tagPush, context.label)
  }
  // Only publishing may write: the workflow's default token reads, and no other job widens it
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(publish.permissions, { contents: 'write' })
  for (const [id, job] of Object.entries(workflow.jobs)) if (id !== 'publish') assert.equal(job.permissions, undefined, id)
})

// Semver's pre-release, which scripts/release-tag.mjs makes exact for every tag that reaches publishing
test('publishing marks every suffixed tag a pre-release, -beta.2 included, and a plain version formal', () => {
  const publish = workflow.jobs?.publish ?? assert.fail('no publish job')
  assert.ok(FORMAL_TAGS.length > 0 && PRE_RELEASE_TAGS.length > 0)
  for (const tag of FORMAL_TAGS) assert.equal(jobEnv(publish, push(tag)).PRERELEASE, 'false', tag)
  for (const tag of PRE_RELEASE_TAGS) assert.equal(jobEnv(publish, push(tag)).PRERELEASE, 'true', tag)
})

const without = (...names) => Object.fromEntries(Object.entries(ALL_SECRETS).filter(([name]) => !names.includes(name)))
const emptied = (...names) => ({ ...ALL_SECRETS, ...Object.fromEntries(names.map((name) => [name, ''])) })
const stepNamed = (name) => gate().steps.find((step) => step.name === name) ?? assert.fail(`no step named ${name}`)
const indexOf = (step) => gate().steps.indexOf(step)
/** A step's run block as the runner runs it when no shell is named (bash -e) */
const runBlock = (step) => spawnSync('bash', ['-e', '-c', step.run], { encoding: 'utf8' })

test('a missing certificate fails every tier at once, naming the secrets, before anything is checked out or built', () => {
  const tiers = [push('v0.2.0'), dispatch(true, BRANCH), dispatch(false, BRANCH)]
  const missing = [without('CSC_LINK'), emptied('CSC_LINK'), without('CSC_KEY_PASSWORD'), emptied('CSC_KEY_PASSWORD')]
  const requirement = stepNamed('Require the Developer ID certificate')
  for (const context of tiers) {
    assert.equal(jobEnv(gate(), context).HAS_CSC, 'true', context.label)
    assert.equal(holds(requirement.if, stepContext(context)), false, context.label)
    for (const secrets of missing) {
      const bare = { ...context, secrets }
      assert.equal(jobEnv(gate(), bare).HAS_CSC, 'false', `${context.label} ${JSON.stringify(Object.keys(secrets))}`)
      assert.equal(holds(requirement.if, stepContext(bare)), true, context.label)
    }
  }
  const later = gate().steps.filter((step) => step.uses?.startsWith('actions/checkout@') || step.run === 'pnpm install --frozen-lockfile' || packagingSteps().includes(step))
  assert.equal(later.length, 4)
  for (const step of later) assert.ok(indexOf(requirement) < indexOf(step), step.name ?? step.uses ?? step.run)
  const result = runBlock(requirement)
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /::error::.*CSC_LINK.*CSC_KEY_PASSWORD/)
})

test('missing Apple credentials fail the release tiers before packaging, and leave the local tier alone', () => {
  const requirement = stepNamed('Require the Apple notarization credentials')
  for (const name of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
    for (const context of [push('v0.2.0'), push('v0.1.0-beta'), dispatch(true, BRANCH)]) {
      assert.equal(jobEnv(gate(), context).HAS_APPLE, 'true', context.label)
      assert.equal(holds(requirement.if, stepContext(context)), false, context.label)
      const bare = { ...context, secrets: without(name) }
      assert.equal(jobEnv(gate(), bare).HAS_APPLE, 'false', `${context.label} without ${name}`)
      assert.equal(holds(requirement.if, stepContext(bare)), true, `${context.label} without ${name}`)
    }
    assert.equal(holds(requirement.if, stepContext({ ...dispatch(false, BRANCH), secrets: without(name) })), false, `local without ${name}`)
  }
  for (const step of packagingSteps()) assert.ok(indexOf(requirement) < indexOf(step), step.name)
  const result = runBlock(requirement)
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /::error::.*APPLE_ID.*APPLE_APP_SPECIFIC_PASSWORD.*APPLE_TEAM_ID/)
})

test('a tag push checks the tag against the package version before packaging; a dispatch does not', () => {
  const check = gate().steps.find((step) => step.run === 'node scripts/release-tag.mjs') ?? assert.fail('no tag check')
  for (const context of CONTEXTS) assert.equal(holds(check.if, stepContext(context)), context.tagPush, context.label)
  const install = gate().steps.find((step) => step.run === 'pnpm install --frozen-lockfile')
  assert.ok(indexOf(install) < indexOf(check))
  for (const step of packagingSteps()) assert.ok(indexOf(check) < indexOf(step), step.name)
})

// Failure B1: Apple takes 2–30 minutes per submission, and a release submits twice (the app, then the DMG)
test("the gate job's time limit leaves room for two submissions of up to 30 minutes and the build", () => {
  assert.ok(gate()['timeout-minutes'] >= 2 * 30 + 15, String(gate()['timeout-minutes']))
})

test("the packages and Apple's logs are kept with the run, and publishing takes exactly that artifact", () => {
  const uploads = gate().steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'))
  const kept = uploads.find((step) => step.if === undefined) ?? assert.fail('no upload after a passing packaging')
  for (const step of packagingSteps()) assert.ok(indexOf(step) < indexOf(kept), step.name)
  assert.deepEqual(kept.with.path.trim().split('\n').map((line) => line.trim()).sort(), ['release/*/*.dmg', 'release/*/*.notary-log.json'])
  assert.equal(kept.with['if-no-files-found'], 'error')
  // A failed gate keeps whatever logs Apple returned
  const failed = uploads.find((step) => /\bfailure\(\)/.test(step.if ?? '')) ?? assert.fail('no upload after a failure')
  assert.equal(failed.with.path.trim(), 'release/*/*.notary-log.json')
  assert.notEqual(failed.with.name, kept.with.name)

  const publish = workflow.jobs?.publish ?? assert.fail('no publish job')
  const download = publish.steps.find((step) => step.uses?.startsWith('actions/download-artifact@')) ?? assert.fail('no download')
  assert.equal(download.with.name, kept.with.name)
  const run = publish.steps.find((step) => step.run?.startsWith('node scripts/publish-release.mjs')) ?? assert.fail('no publish step')
  assert.equal(run.run, `node scripts/publish-release.mjs ${download.with.path}`)
  assert.ok(publish.steps.indexOf(download) < publish.steps.indexOf(run))
  assert.equal(run.env.GH_TOKEN, '${{ github.token }}')
})

// The gate job holds the signing certificate and Apple's credentials, and publishing can write releases: every
// action runs at a reviewed commit, never at a tag that can move (the owner's decision, 2026-10-18)
test('every action is pinned to a full commit', () => {
  const uses = [...strings(workflow)].filter(({ path }) => path.endsWith('.uses'))
  assert.ok(uses.length >= 6)
  for (const { path, value } of uses) assert.match(value, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, path)
})

/** Every string in the parsed workflow, with the path that leads to it */
function* strings(value, path = []) {
  if (typeof value === 'string') yield { path: path.join('.'), value }
  else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) yield* strings(item, [...path, key])
}

test('credentials reach only the packaging steps and the two R2 steps, the local packaging never gets Apple credentials, and no run block interpolates', () => {
  const release = packagingSteps().find((step) => step.run === profiles.release.command)
  const local = packagingSteps().find((step) => step.run === profiles.local.command)
  const at = (step) => `jobs.gate.steps.${indexOf(step)}.env`
  // The step of each R2 job that runs the mirror script, and the secret each of its variables holds
  const r2Step = (id) => `jobs.${id}.steps.${job(id).steps.findIndex((step) => step.run?.startsWith('node scripts/mirror-release.mjs'))}.env`
  const R2_ENV = { AWS_ACCESS_KEY_ID: 'R2_ACCESS_KEY_ID', AWS_SECRET_ACCESS_KEY: 'R2_SECRET_ACCESS_KEY', R2_ACCOUNT_ID: 'R2_ACCOUNT_ID', R2_BUCKET: 'R2_BUCKET' }
  const reads = [...strings(workflow)].filter(({ value }) => value.includes('secrets.'))
  const expected = [
    'jobs.gate.env.HAS_CSC',
    'jobs.gate.env.HAS_APPLE',
    ...['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].map((name) => `${at(release)}.${name}`),
    ...['CSC_LINK', 'CSC_KEY_PASSWORD'].map((name) => `${at(local)}.${name}`),
    ...['mirror', 'pointer'].flatMap((id) => [`jobs.${id}.env.HAS_R2`, ...Object.keys(R2_ENV).map((name) => `${r2Step(id)}.${name}`)])
  ]
  assert.deepEqual(reads.map(({ path }) => path).sort(), expected.sort())
  for (const { path, value } of reads) {
    if (/^jobs\.\w+\.env\.HAS_/.test(path)) {
      // The booleans only compare: a secret's value never becomes the value of an env variable here
      for (const use of value.matchAll(/secrets\.(\w+)(\s*[^\s])?/g)) assert.equal(use[2]?.trim(), '!', `${path}: ${use[0]}`)
    } else {
      const variable = path.split('.').pop()
      assert.equal(value, `\${{ secrets.${R2_ENV[variable] ?? variable} }}`, path)
    }
  }
  const runs = [...strings(workflow)].filter(({ path }) => path.endsWith('.run'))
  assert.ok(runs.length >= 5)
  for (const { path, value } of runs) assert.ok(!value.includes('${{'), path)
})

test('after a failed requirement nothing else runs: no later step in the gate job overrides the stop with a status function', () => {
  const requirement = stepNamed('Require the Developer ID certificate')
  const later = gate().steps.slice(indexOf(requirement) + 1).filter((step) => step.if !== undefined && !/\bfailure\(\)/.test(step.if))
  assert.ok(later.length >= 2)
  // evaluate() knows no status function, so one would throw here
  for (const step of later) holds(step.if, stepContext(push('v0.2.0')))
  // The one step that runs after a failure keeps Apple's logs, and is handed no credential
  for (const step of gate().steps.filter((step) => /\bfailure\(\)/.test(step.if ?? ''))) {
    assert.equal(step.env, undefined, step.name)
    assert.ok(step.uses?.startsWith('actions/upload-artifact@'), step.name)
  }
})

// #236: the mirror and pointer jobs (mac-distribution::REQ-002/AC-03, REQ-003, REQ-004, CON-004)
const job = (id) => workflow.jobs?.[id] ?? assert.fail(`no ${id} job`)
/** A formal release's tag push, judged from the tag lists above rather than from the workflow's own test */
const formalPush = (context) => context.tagPush && FORMAL_TAGS.includes(context.github.ref_name)

test('the mirror and the pointer run for a formal tag push only: never for a pre-release, a dispatch or a pull request', () => {
  assert.ok(CONTEXTS.some(formalPush) && CONTEXTS.some((context) => context.tagPush && !formalPush(context)))
  for (const id of ['mirror', 'pointer']) {
    for (const context of CONTEXTS) {
      assert.equal(holds(job(id).if, { github: context.github, inputs: context.inputs }), formalPush(context), `${id}: ${context.label}`)
    }
  }
})

test('the mirror follows the published GitHub release, and the pointer follows the mirror; a failed job before them skips them', () => {
  assert.deepEqual([job('mirror').needs].flat().sort(), ['gate', 'publish'])
  assert.deepEqual([job('pointer').needs].flat().sort(), ['gate', 'mirror'])
  // evaluate() knows no status function: one here would throw, and GitHub's implicit success() would not apply
  for (const id of ['mirror', 'pointer']) holds(job(id).if, { github: push('v0.2.0').github, inputs: {} })
})

const R2_SECRETS = { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'key', R2_BUCKET: 'agentshed-releases' }

test('a missing R2 credential fails the mirror and the pointer first, naming the four secrets (CON-003)', () => {
  const names = Object.keys(R2_SECRETS)
  assert.equal(names.length, 4)
  for (const id of ['mirror', 'pointer']) {
    const context = { ...push('v0.2.0'), secrets: { ...ALL_SECRETS, ...R2_SECRETS } }
    const env = (secrets) => jobEnv(job(id), { ...context, secrets })
    const requirement = job(id).steps.find((step) => step.name === 'Require the R2 credentials') ?? assert.fail(`${id}: no R2 requirement`)
    assert.equal(job(id).steps.indexOf(requirement), 0, `${id}: the requirement comes first`)
    assert.equal(env(context.secrets).HAS_R2, 'true', id)
    assert.equal(holds(requirement.if, { github: context.github, inputs: {}, env: env(context.secrets) }), false, id)
    for (const name of names) {
      for (const secrets of [{ ...context.secrets, [name]: '' }, Object.fromEntries(Object.entries(context.secrets).filter(([key]) => key !== name))]) {
        assert.equal(env(secrets).HAS_R2, 'false', `${id} without ${name}`)
        assert.equal(holds(requirement.if, { github: context.github, inputs: {}, env: env(secrets) }), true, `${id} without ${name}`)
      }
    }
    const result = runBlock(requirement)
    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /::error::.*R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_BUCKET/)
  }
})

test("the mirror and the pointer read the gate job's artifact and the download host the certificate check settled", () => {
  const kept = gate().steps.find((step) => step.uses?.startsWith('actions/upload-artifact@') && step.if === undefined) ?? assert.fail('no upload')
  for (const [id, verb] of [['mirror', 'upload'], ['pointer', 'pointer']]) {
    const steps = job(id).steps
    const download = steps.find((step) => step.uses?.startsWith('actions/download-artifact@')) ?? assert.fail(`${id}: no download`)
    assert.equal(download.with.name, kept.with.name, id)
    const script = steps.find((step) => step.run?.startsWith('node scripts/mirror-release.mjs')) ?? assert.fail(`${id}: no mirror script`)
    assert.equal(script.run, `node scripts/mirror-release.mjs ${verb} ${download.with.path}`, id)
    assert.ok(steps.indexOf(download) < steps.indexOf(script), id)
    // What the step sees: the workflow's env, then the job's, then its own
    const env = { ...workflow.env, ...job(id).env, ...script.env }
    assert.equal(env.DOWNLOAD_HOST, 'https://dl.agentshed.aloongplanet.com', id)
  }
})
