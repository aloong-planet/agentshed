// Exercise the working-language gate's CLI in real temporary Git repositories, as check-raw-nul.test.mjs does
// for its sibling gate. Covers the prototype exemption: the prototype skill's verbatim copies, recognised by the
// marker in their first comment whatever they are called, are checked like any other tooling, while mockups and
// this project's own registries stay exempt.
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

/** The prototype skill's copy header as `docs/prototypes/demo-harness.js` carries it: two comment lines, the marker on the first */
const JS_COPY_HEADER =
  "// Demo harness dock (copied from the prototype skill's template; do not edit by hand — change the skill\n" +
  '// template and copy it again). Scaffolding, not part of any design.\n'

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

// Each copy's Chinese sits on the line given; the shapes are the real copies' headers where one exists
for (const [what, file, text, line] of [
  [
    'an HTML copy (its header after the doctype)',
    'docs/prototypes/index.html',
    "<!doctype html>\n<!-- Prototype gallery shell (copied from the prototype skill's template; do not edit by hand — change the skill template and copy it again). -->\n" +
      `<!-- ${CN} -->\n`,
    3
  ],
  ['a JS copy (its header two comment lines)', 'docs/prototypes/demo-harness.js', `${JS_COPY_HEADER}// ${CN}\n`, 3],
  [
    'a CSS copy (its header a block comment)',
    'docs/prototypes/demo-dock.css',
    `/* Demo dock styles (copied from the prototype skill's template; do not edit by hand) */\n/* ${CN} */\n`,
    2
  ],
  ['a copy under a name no list ever held', 'docs/prototypes/demo-notes.js', `${JS_COPY_HEADER}// ${CN}\n`, 3],
  [
    'a JS copy behind a #! line',
    'docs/prototypes/demo-tool.js',
    "#!/usr/bin/env node\n// Diagram sync (copied from the prototype skill's template; do not edit by hand)\n" + `// ${CN}\n`,
    3
  ],
  // The headers are hand-wrapped prose, so a reworded title moves the marker onto a later line of the same comment
  [
    'a JS copy whose marker is on the second line of its header',
    'docs/prototypes/demo-strip.js',
    '// Demo strip: the bar along the bottom of each prototype page, its title reworded so that the marker\n' +
      "// falls on the next line (copied from the prototype skill's template; do not edit by hand)\n" +
      `// ${CN}\n`,
    3
  ],
  [
    'an HTML copy whose header runs on past the marker line',
    'docs/prototypes/index.html',
    '<!doctype html>\n<!-- Prototype gallery shell, its title on a line of its own\n' +
      "     (copied from the prototype skill's template; do not edit by hand — change the skill template and copy it again).\n" +
      '     Depends on manifest.js in the same directory. -->\n' +
      `<!-- ${CN} -->\n`,
    5
  ],
  [
    'a CSS copy whose block header runs on past the marker line',
    'docs/prototypes/demo-panel.css',
    '/* Demo panel styles, its title reworded so that the marker\n' +
      "   falls on the next line (copied from the prototype skill's template; do not edit by hand).\n" +
      '   Scaffolding, not part of any design. */\n' +
      `/* ${CN} */\n`,
    4
  ],
  // HTML allows a doctype in either case and an indented comment; an indented // run is still one run
  [
    'an HTML copy behind an upper-case doctype, its header indented',
    'docs/prototypes/shell.html',
    "<!DOCTYPE html>\n  <!-- Prototype gallery shell (copied from the prototype skill's template; do not edit by hand) -->\n" +
      `<!-- ${CN} -->\n`,
    3
  ],
  [
    'a JS copy whose // header is indented, the marker on its second line',
    'docs/prototypes/demo-indented.js',
    '  // Demo tool, its header indented inside the file\n' +
      "  // (copied from the prototype skill's template; do not edit by hand)\n" +
      `  // ${CN}\n`,
    3
  ]
]) {
  test(`Chinese in ${what} is reported: the copy is recognised by its header`, () => {
    const result = check({ [file]: text })
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, /found 1 problem\(s\)/)
    assert.ok(result.stderr.includes(`${file}:${line} `), result.stderr)
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

// The marker counts only inside the first comment: each file below lacks it there and stays on the mockup side
for (const [what, file, text] of [
  [
    'a mockup page that quotes the marker below its first comment',
    'docs/prototypes/notes/prototype-notes.html',
    '<!doctype html>\n<!-- Notes on the gallery -->\n' +
      "<!-- The shell says it is copied from the prototype skill's template -->\n" +
      `<p>${CN}</p>\n`
  ],
  [
    'a script whose // header ends at code, the marker quoted after it',
    'docs/prototypes/dimensions.js',
    `// The demo dimensions every prototype page shares\n// ${CN}\nwindow.DEMO_DIMENSIONS = {}\n` +
      "// The gallery shell is copied from the prototype skill's template\n"
  ],
  [
    'a script that opens with code, the marker quoted after it',
    'docs/prototypes/_shared/notes.js',
    `window.NOTES = ['${CN}']\n` + "// The skill's copies say they are copied from the prototype skill's template\n"
  ],
  [
    'a stylesheet whose /* header closes without the marker, the marker quoted after it',
    'docs/prototypes/_shared/panel.css',
    '/* Panel styles, kept by hand: the baseline the app follows,\n   not checked against the app. */\n' +
      "/* The gallery shell is copied from the prototype skill's template */\n" +
      `.panel::after { content: '${CN}' }\n`
  ],
  [
    'a script whose // header ends at a blank line, the marker quoted after it, as the manifest is laid out',
    'docs/prototypes/manifest.js',
    `// The prototype registry (a hard rule: add or remove an entry whenever a prototype is created or deleted)\n// ${CN}\n\n` +
      "// The gallery shell (index.html) is copied from the prototype skill's template\nwindow.PROTOTYPES = []\n"
  ],
  // No marker at all: the first comment runs to the end of the file, which has no newline after it
  ['a script of comments only, without the marker', 'docs/prototypes/_shared/placeholder.js', `// Placeholder\n// ${CN}`]
]) {
  test(`Chinese stays permitted in ${what}`, () => {
    const result = check({ [file]: text })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Working language: 9 line\(s\)/)
  })
}
