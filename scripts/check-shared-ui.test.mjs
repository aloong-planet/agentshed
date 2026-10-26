// Exercise the shared-UI gate's command line on a copy of the prototypes with planted faults: a comment on a page is
// not markup, so a reference, a declaration or a mount point that exists only in a comment must count as missing.
//
// The gate takes its root from its own location, so the tree holds a copy of the gate under scripts/, a real copy of
// docs/prototypes/ and symbolic links to everything else. The prototypes must be copied: the gate walks them with
// readdirSync's file types, where a link to a directory is not a directory, and a linked page would be skipped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))

/** Each plant replaces one string, which must occur exactly once in its page */
const PLANTS = {
  // The issue's two mutations: each page's comment names the asset whose real reference goes
  'global-search/prototype-search.html': [['<link rel="stylesheet" href="../_shared/app-window.css">\n', '']],
  'project-list/prototype-list.html': [['  <script src="../_shared/project-side.js"></script>\n', '']],
  // The same with a comment after code on the same line
  'shell/prototype-app-shell.html': [
    ['  <script src="../_shared/app-rail.js"></script>\n', ''],
    ["  let lang='zh';\n", "  let lang='zh'; // the rail is drawn by ../_shared/app-rail.js\n"],
    // An asset named in a comment on a page that does not declare its block
    ['<style>\n', "<style>\n/* the toasts' styles live in ../_shared/toast.css */\n"]
  ],
  // A // inside a string is no comment: the code after it on the line still counts
  'session-view/prototype-session.html': [
    [
      "  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n",
      "  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n  const docsUrl = 'https://example.test/'; const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')\n"
    ]
  ],
  // A declaration and a mount point that survive only in a comment
  'agents-page/prototype-agents.html': [
    ['<div class="chart" id="chart" data-shared-block="trend-chart"></div>', '<!-- data-shared-block="trend-chart" --><div class="chart" id="chart"></div>']
  ],
  'project-detail/prototype-detail.html': [['<div class="xaxis" id="ovxaxis"></div>', '<!-- id="ovxaxis" --><div class="xaxis"></div>']],
  // The tab identity script, commented out
  'skills-view/prototype-skills-preview.html': [['<script src="../app-identity.js"></script>', '<!-- <script src="../app-identity.js"></script> -->']]
}

/** Pages whose case needs a comment still naming the asset once its real reference is gone, or the case plants nothing */
const NAMED_IN_A_COMMENT = {
  'global-search/prototype-search.html': '_shared/app-window.css',
  'project-list/prototype-list.html': '_shared/project-side.js',
  'shell/prototype-app-shell.html': '_shared/app-rail.js'
}

/** Run the gate on a planted copy; returns its exit code and output */
function runGate() {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-shared-ui-'))
  try {
    for (const e of readdirSync(repo)) if (!['docs', 'scripts', '.git'].includes(e)) symlinkSync(join(repo, e), join(root, e))
    mkdirSync(join(root, 'docs'))
    for (const e of readdirSync(join(repo, 'docs'))) if (e !== 'prototypes') symlinkSync(join(repo, 'docs', e), join(root, 'docs', e))
    cpSync(join(repo, 'docs/prototypes'), join(root, 'docs/prototypes'), { recursive: true })
    mkdirSync(join(root, 'scripts'))
    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
    for (const [page, swaps] of Object.entries(PLANTS)) {
      const file = join(root, 'docs/prototypes', page)
      let html = readFileSync(file, 'utf8')
      for (const [from, to] of swaps) {
        assert.equal(html.split(from).length, 2, `${page}: the planted string must occur exactly once: ${from}`)
        html = html.replace(from, to)
      }
      const asset = NAMED_IN_A_COMMENT[page]
      assert.ok(!asset || html.includes(asset), `${page}: no comment names ${asset} any more — plant one, or this case tests nothing`)
      writeFileSync(file, html)
    }
    const r = spawnSync(process.execPath, [join(root, 'scripts/check-shared-ui.mjs')], { encoding: 'utf8' })
    return { status: r.status, out: `${r.stdout}${r.stderr}` }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const run = runGate()
const problems = run.out.split('\n').filter((line) => /^ {4}\S/.test(line)).map((line) => line.trim())
const reported = (line) => problems.includes(line)

test('the planted run fails, and only on the planted pages', () => {
  assert.equal(run.status, 1, run.out)
  assert.ok(problems.length > 0, run.out)
  const planted = Object.keys(PLANTS).map((page) => `docs/prototypes/${page}`)
  for (const p of problems) assert.ok(planted.some((page) => p.startsWith(`${page}:`)), p)
})

test("a page without its asset's link is reported, though its comment names the asset", () => {
  assert.ok(reported('docs/prototypes/global-search/prototype-search.html: declares app-window but does not reference _shared/app-window.css'), run.out)
})

test("a page without its asset's script is reported, though a script comment names the asset", () => {
  assert.ok(reported('docs/prototypes/project-list/prototype-list.html: declares project-side but does not reference _shared/project-side.js'), run.out)
})

test("a page without its asset's script is reported, though a comment after code on the same line names the asset", () => {
  assert.ok(reported('docs/prototypes/shell/prototype-app-shell.html: declares app-rail but does not reference _shared/app-rail.js'), run.out)
})

test('a // inside a string is not a comment: the code after it on the line is read', () => {
  assert.ok(reported('docs/prototypes/session-view/prototype-session.html: follows the mode but still styles by prefers-color-scheme'), run.out)
})

test('a declaration left only in a comment does not declare the block', () => {
  assert.ok(reported('docs/prototypes/agents-page/prototype-agents.html: references trend-chart assets without declaring data-shared-block="trend-chart"'), run.out)
})

test("a mount point's id left only in a comment does not count", () => {
  assert.ok(reported('docs/prototypes/project-detail/prototype-detail.html: declares trend-chart but is missing the xaxis mount point'), run.out)
})

test('an asset named in a comment on a page that does not declare its block is not reported', () => {
  assert.ok(!problems.some((p) => p.startsWith('docs/prototypes/shell/prototype-app-shell.html: references toast assets')), run.out)
})

test('a tab identity script left only in a comment does not count', () => {
  assert.ok(reported('docs/prototypes/skills-view/prototype-skills-preview.html: does not include ../app-identity.js in <head>'), run.out)
})
