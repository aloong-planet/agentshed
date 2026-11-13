// The gate on an engine module just built (scripts/build-engine.mjs; ADR-0045): the module packaging ships carries no
// test seam and reports this build, and the development build reports this build too. The modules here are stand-ins
// for a loaded module's exports; that the real build passes is shown by every build, which runs this same check on
// what cargo wrote, packaging's included (build/engine-before-pack.cjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargoArgs, checkBuiltModule } from './build-engine.mjs'

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

test('only the development build is asked for the seams; the packaged build is not', () => {
  assert.ok(cargoArgs({ packaged: false }).join(' ').includes('--features test-seams'))
  assert.ok(!cargoArgs({ packaged: true }).includes('test-seams'))
})
