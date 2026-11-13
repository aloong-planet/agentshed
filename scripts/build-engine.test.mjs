// The gate on an engine module just built (scripts/build-engine.mjs; ADR-0045): the module packaging ships carries no
// test seam and reports this build, and the development build reports this build too. The modules here are stand-ins
// for a loaded module's exports; that the real build passes is shown by every build, which runs this same check on
// what cargo wrote, packaging's included (build/engine-before-pack.cjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { cargoArgs, checkBuiltModule, libraryPath } from './build-engine.mjs'
import { REPO } from './lib/engine-build.mjs'

const require = createRequire(import.meta.url)
// The js-yaml electron-builder ships, through the packaging asset's own loader: no second YAML parser here
const yaml = require('../build/mac-packaging.cjs').yamlParser()

const build = 'b1'
const exportsOf = (reported, ...seams) => Object.fromEntries([['build', () => reported], ...seams.map((name) => [name, () => {}])])

test('the module packaging ships is refused when it exports a test seam, a seam named after this one included', () => {
  for (const seams of [['seamPanicWhileParsing', 'seamParse'], ['seamNotWrittenYet']]) {
    assert.throws(() => checkBuiltModule(exportsOf(build, ...seams), { build, packaged: true }), new RegExp(`exports test seams \\(${seams.join(', ')}\\)`))
  }
})

test('a module just built is refused when it reports another build, or none, packaged or not', () => {
  for (const packaged of [true, false]) {
    assert.throws(() => checkBuiltModule(exportsOf('b0'), { build, packaged }), /reports build "b0", not this build's "b1"/)
    assert.throws(() => checkBuiltModule({}, { build, packaged }), /reports build undefined, not this build's "b1"/)
  }
})

test('a module of this build passes: the packaged one without seams, the development one with them', () => {
  assert.doesNotThrow(() => checkBuiltModule(exportsOf(build), { build, packaged: true }))
  assert.doesNotThrow(() => checkBuiltModule(exportsOf(build, 'seamPanicWhileParsing', 'seamParse'), { build, packaged: false }))
})

test('packaging copies into the app the library the packaged build writes and checks', () => {
  const config = yaml.load(readFileSync(join(REPO, 'electron-builder.yml'), 'utf8'))
  const entries = (config.mac?.extraResources ?? []).filter((entry) => entry?.to === 'engine/agentshed_engine.node')
  assert.equal(entries.length, 1)
  assert.equal(join(REPO, entries[0].from), libraryPath({ packaged: true, platform: 'darwin' }))
})

test('only the development build is asked for the seams; the packaged build is not', () => {
  assert.ok(cargoArgs({ packaged: false }).join(' ').includes('--features test-seams'))
  assert.ok(!cargoArgs({ packaged: true }).includes('test-seams'))
})
