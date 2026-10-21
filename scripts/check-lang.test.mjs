// Exercise the working-language gate's CLI in real temporary Git repositories, as check-raw-nul.test.mjs does
// for its sibling gate. Covers the prototype exemption: the prototype skill's verbatim copies are checked like
// any other tooling, while mockups and this project's own registries stay exempt.
//
// Gap: a template the skill adds later is covered only once it is named both in the gate and here (#296).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const gate = fileURLToPath(new URL('./check-lang.mjs', import.meta.url))

// Built from code points, so that this file holds no Chinese of its own
const CN = String.fromCodePoint(0x53d8, 0x5f02)
const CHINESE_NAME = String.fromCodePoint(0x7b80, 0x4f53, 0x4e2d, 0x6587)

/**
 * One file per exemption rule, each holding one line of Chinese its rule permits. The gate reports a rule that
 * matches no file as dead, so without these every run would fail.
 */
const SEEDS = {
  'scripts/check-shared-ui.mjs': `const side = /${CN}/\n`,
  'src/shared/i18n/zh.ts': `export const zh = { a: '${CN}' }\n`,
  'site/src/i18n/ui.ts': `export const ui = { a: '${CN}' }\n`,
  'e2e/app.spec.ts': `const label = '${CN}'\n`,
  'docs/specs/i18n.md': `The value \`${CN}\` is cited.\n`,
  'docs/prototypes/seed/prototype-seed.html': `<p>${CN}</p>\n`,
  'README.md': `${CN}\n`,
  'README.fr.md': `- [${CHINESE_NAME}](README.md)\n`
}

/** A file of the given type whose second line is a Chinese comment */
const withChinese = (file) => (file.endsWith('.html') ? `<!doctype html>\n<!-- ${CN} -->\n` : `// English\n// ${CN}\n`)

/** Run the gate on the seeds plus `files`, all staged in a fresh repository */
function check(files = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'agentshed-lang-gate-'))
  try {
    execFileSync('git', ['init', '-q', cwd])
    for (const [name, text] of Object.entries({ ...SEEDS, ...files })) {
      mkdirSync(dirname(join(cwd, name)), { recursive: true })
      writeFileSync(join(cwd, name), text)
    }
    execFileSync('git', ['add', '-A'], { cwd })
    return spawnSync(process.execPath, [gate], { cwd, encoding: 'utf8' })
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

test('the seeds alone pass, one permitted line each', () => {
  const result = check()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Working language: 8 line\(s\)/)
})

for (const file of [
  'docs/prototypes/index.html',
  'docs/prototypes/app-identity.js',
  'docs/prototypes/demo-dimensions.js',
  'docs/prototypes/demo-harness.js'
]) {
  test(`Chinese in the skill's copy ${file} is reported like any other tooling`, () => {
    const result = check({ [file]: withChinese(file) })
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, /found 1 problem\(s\)/)
    assert.ok(result.stderr.includes(`${file}:2 `), result.stderr)
    assert.ok(result.stderr.includes('the tooling beside it gets no exemption'), result.stderr)
  })
}

test("Chinese in the skill's copy sync-mmd.mjs is reported, since .mjs is not an exempt type", () => {
  const file = 'docs/prototypes/sync-mmd.mjs'
  const result = check({ [file]: withChinese(file) })
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /found 1 problem\(s\)/)
  assert.ok(result.stderr.includes(`${file}:2 `), result.stderr)
})

// The permitted count rising from the seeds' 8 to 9 shows the file was read and its line permitted, not skipped
for (const [file, what] of [
  ['docs/prototypes/shell/prototype-app-shell.html', 'a mockup page'],
  ['docs/prototypes/project-list/visibility/index.html', 'a logic page that shares the gallery shell’s file name'],
  ['docs/prototypes/manifest.js', 'the manifest, whose names and questions address the reviewer'],
  ['docs/prototypes/dimensions.js', 'the dimension registry, whose labels address the reviewer']
]) {
  test(`Chinese stays permitted in ${what}`, () => {
    const result = check({ [file]: withChinese(file) })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Working language: 9 line\(s\)/)
  })
}
