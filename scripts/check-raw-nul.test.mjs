// Exercise the gate's CLI in real temporary Git indexes. This tests text/binary classification,
// not image aesthetics or Dock integration; those require the prepared image and native previews.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const gate = fileURLToPath(new URL('./check-raw-nul.mjs', import.meta.url))
/** `staged` names the files to `git add`; the rest stay untracked. By default every file is staged. */
function check(files, staged = Object.keys(files)) {
  const cwd = mkdtempSync(join(tmpdir(), 'agentshed-nul-gate-'))
  try {
    execFileSync('git', ['init', '-q', cwd])
    for (const [name, bytes] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, name)), { recursive: true })
      writeFileSync(join(cwd, name), bytes)
    }
    if (staged.length) execFileSync('git', ['add', '--', ...staged], { cwd })
    return spawnSync(process.execPath, [gate], { cwd, encoding: 'utf8' })
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

test('accepts real PNG and ICNS artwork under new filenames', () => {
  const result = check({
    'new-production.png': readFileSync(new URL('../build/icon.png', import.meta.url)),
    'another-development.png': readFileSync(new URL('../build/icon-dev.png', import.meta.url)),
    'native.icns': readFileSync(new URL('../build/icon.icns', import.meta.url))
  })
  assert.equal(result.status, 0, result.stderr)
})

test('rejects NUL-bearing source even alongside valid artwork', () => {
  const result = check({
    'source.ts': Buffer.from('export const key = "a\0b"'),
    'valid.png': readFileSync(new URL('../build/icon.png', import.meta.url))
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /source\.ts/)
  assert.doesNotMatch(result.stderr, /valid\.png:/)
})

for (const name of ['pretend.png', 'pretend.icns', 'binary.dat']) {
  test(`does not exempt unrecognised content in ${name}`, () => {
    const result = check({ [name]: Buffer.from('text\0with a NUL') })
    assert.equal(result.status, 1)
    assert.ok(result.stderr.includes(name), result.stderr)
  })
}

// The artwork is there because the gate fails when its binary-format exemption matches nothing.
test('accepts searchable source with an escaped NUL', () => {
  const result = check({
    'source.ts': 'export const key = "a\\x00b"',
    'valid.png': readFileSync(new URL('../build/icon.png', import.meta.url))
  })
  assert.equal(result.status, 0, result.stderr)
})

// A file not yet `git add`-ed is exactly what an author runs the gate on before committing (#201).
test('rejects a NUL in a new file that is not staged yet', () => {
  const result = check(
    {
      'fresh.ts': Buffer.from('export const key = "a\0b"'),
      'valid.png': readFileSync(new URL('../build/icon.png', import.meta.url))
    },
    ['valid.png']
  )
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /fresh\.ts/)
})

test('does not scan a git-ignored file, such as build output', () => {
  const result = check(
    {
      '.gitignore': 'out/\n',
      'out/bundle.js': Buffer.from('var k = "a\0b"'),
      'valid.png': readFileSync(new URL('../build/icon.png', import.meta.url))
    },
    ['.gitignore', 'valid.png']
  )
  assert.equal(result.status, 0, result.stderr)
})
