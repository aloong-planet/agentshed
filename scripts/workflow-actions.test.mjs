// A static test of every workflow (.github/workflows/): every action runs at a reviewed commit, never at a tag or branch
// that can move, with the release it came from in a comment on its line, and one action is at one release everywhere.
// The release workflow's gate job holds the signing certificate and Apple's credentials, and its publish job can
// write releases (the owner's decision of 2026-10-18); the CI and message-language jobs are the checks a pull request
// needs to merge into main, so an action that moved under its tag could pass a bad one (the owner's decision of
// 2026-10-26, #253).
//
// Gap: no offline check can tell which release a commit is, or which major is current. Whoever updates a pin resolves
// the release's tag to its commit (as #253 did, docs/.workings/macos-release-line/evidence/ticket-253/) and changes
// every workflow together.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// The js-yaml electron-builder ships, through the packaging asset's own loader: no second YAML parser here
const yaml = require('../build/mac-packaging.cjs').yamlParser()

const DIR = new URL('../.github/workflows/', import.meta.url)
const workflows = readdirSync(DIR)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => {
    const text = readFileSync(new URL(name, DIR), 'utf8')
    return { name, text, uses: [...strings(yaml.load(text))].filter(({ path }) => path.endsWith('.uses')).map(({ value }) => value) }
  })

/** Every string in the parsed workflow, with the path that leads to it */
function* strings(value, path = []) {
  if (typeof value === 'string') yield { path: path.join('.'), value }
  else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) yield* strings(item, [...path, key])
}

/** A `uses:` line with its version comment: the value, then `# v<major>.<minor>.<patch>` */
const PINNED_LINE = /^\s*(?:-\s+)?uses:\s*(\S+)\s+#\s*(v\d+\.\d+\.\d+)\s*$/

test('every action in every workflow is pinned to a full commit', () => {
  assert.ok(['ci.yml', 'message-language.yml', 'release.yml'].every((name) => workflows.some((workflow) => workflow.name === name)))
  for (const { name, uses } of workflows) {
    assert.ok(uses.length > 0, `${name}: no action`)
    for (const value of uses) assert.match(value, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, name)
  }
})

test("each action's line names its release in a comment, and the lines account for every action", () => {
  for (const { name, text, uses } of workflows) {
    const commented = text.split('\n').flatMap((line) => line.match(PINNED_LINE)?.[1] ?? [])
    assert.deepEqual(commented, uses, name)
  }
})

/** For each key, the values seen and the workflows each was seen in */
function collect(pairs) {
  const seen = new Map()
  for (const [key, value, name] of pairs) {
    const values = seen.get(key) ?? new Map()
    values.set(value, [...new Set([...(values.get(value) ?? []), name])])
    seen.set(key, values)
  }
  return seen
}

test('an action is at one commit, and a commit names one release, in every workflow', () => {
  const refs = collect(workflows.flatMap(({ name, uses }) => uses.map((value) => [...value.split('@'), name])))
  // checkout is in all three: the check compares workflows that share an action
  assert.ok([...refs.values()].some((values) => new Set([...values.values()].flat()).size > 1))
  for (const [action, values] of refs) assert.equal(values.size, 1, `${action}: ${JSON.stringify(Object.fromEntries(values))}`)
  const releases = collect(workflows.flatMap(({ name, text }) => text.split('\n').flatMap((line) => {
    const match = line.match(PINNED_LINE)
    return match ? [[match[1], match[2], name]] : []
  })))
  for (const [value, values] of releases) assert.equal(values.size, 1, `${value}: ${JSON.stringify(Object.fromEntries(values))}`)
})
