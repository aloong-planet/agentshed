// Exercise the shared-UI gate's command line on a copy of the prototypes with planted faults: a comment on a page is
// not markup, so a reference, a declaration or a mount point that exists only in a comment must count as missing; a
// chart answers for its own declaration; and a shared block is known by its files in _shared/.
//
// The gate takes its root from its own location, so the tree holds a copy of the gate under scripts/, real copies of
// docs/prototypes/ and src/, and symbolic links to everything else. The prototypes must be copied: the gate walks them
// with readdirSync's file types, where a link to a directory is not a directory, and a linked page would be skipped.
// src/ is copied so a plant in the app's source never writes the repository's own file.
//
// Not driven here: the gate's check that every key of its block-specific table is a shared block. Driving it needs a
// block renamed across the pages, which would undo the trend-chart cases in the same run; it was run once on a copy of
// the gate with the key renamed (#314's records).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))

/** Each plant replaces one string, which must occur exactly once in its file (keyed by its path from the root) */
const PLANTS = {
  // The issue's two mutations: each page's comment names the asset whose real reference goes
  'docs/prototypes/global-search/prototype-search.html': [
    ['<link rel="stylesheet" href="../_shared/app-window.css">\n', ''],
    // A new shared stylesheet, linked without a declaration
    ['<link rel="stylesheet" href="../_shared/theme.css">\n', '<link rel="stylesheet" href="../_shared/theme.css">\n<link rel="stylesheet" href="../_shared/side-note.css">\n']
  ],
  'docs/prototypes/project-list/prototype-list.html': [
    ['  <script src="../_shared/project-side.js"></script>\n', ''],
    // A declaration that names no block
    ['<div class="topbar" style="gap:12px">', '<div class="topbar" style="gap:12px" data-shared-block="pie-chart">']
  ],
  // The same with a comment after code on the same line
  'docs/prototypes/shell/prototype-app-shell.html': [
    ['  <script src="../_shared/app-rail.js"></script>\n', ''],
    ["  let lang='zh';\n", "  let lang='zh'; // the rail is drawn by ../_shared/app-rail.js\n"],
    // An asset named in a comment on a page that does not declare its block
    ['<style>\n', "<style>\n/* the toasts' styles live in ../_shared/toast.css */\n"]
  ],
  // A /* inside a string opens no comment: the code after it still counts
  'docs/prototypes/plugins-view/prototype-plugin-skill-preview.html': [
    [
      "  let lang = DemoDimensions.get('language')\n",
      "  let lang = DemoDimensions.get('language')\n  const globs = ['ideas/*.md', window.matchMedia('(prefers-color-scheme: dark)'), 'src/**/*.ts']\n"
    ]
  ],
  // A template's line that starts with // is template text, not a comment
  'docs/prototypes/skill-install/prototype-install.html': [['  const T={\n', '  const note = `\n// prefers-color-scheme is how the app reads the system appearance\n`\n  const T={\n']],
  // A // inside a regular expression is no comment either (the pages' own URL test)
  'docs/prototypes/project-detail/prototype-detail-stale-note.html': [
    [
      "const PATH = '/Users/you/Projects/removed-experiment-2025';\n",
      "const PATH = '/Users/you/Projects/removed-experiment-2025';\nconst isUrl = (u) => /^https?:\\/\\//i.test(u); const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')\n"
    ]
  ],
  // A // inside a string is no comment: the code after it on the line still counts
  'docs/prototypes/session-view/prototype-session.html': [
    [
      "  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n",
      "  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n  const docsUrl = 'https://example.test/'; const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')\n"
    ]
  ],
  // Declarations that survive only in a comment: the page declares trend-chart nowhere while it links its assets
  'docs/prototypes/agents-page/prototype-agents.html': [
    ['<div class="chart" id="chart" data-shared-block="trend-chart"></div>', '<!-- data-shared-block="trend-chart" --><div class="chart" id="chart"></div>'],
    ['<div class="chart" id="skChart" data-shared-block="trend-chart"></div>', '<!-- data-shared-block="trend-chart" --><div class="chart" id="skChart"></div>']
  ],
  'docs/prototypes/project-detail/prototype-detail.html': [
    // A mount point that survives only in a comment
    ['<div class="xaxis" id="ovxaxis"></div>', '<!-- id="ovxaxis" --><div class="xaxis"></div>'],
    // Charts beside one that declares trend-chart: one without a declaration, one whose declaration is in a comment
    [
      '<div class="chart" id="ovchart" data-shared-block="trend-chart"></div>',
      '<div class="chart" id="ovchart" data-shared-block="trend-chart"></div><div class="chart" id="ovchart2"></div><!-- data-shared-block="trend-chart" --><div class="chart" id="ovchart3"></div>'
    ],
    // A chart written in a script template
    ['  const pl = (n, one, other) => n === 1 ? one : other\n', '  const pl = (n, one, other) => n === 1 ? one : other\n  const extraChart = \'<div class="chart" id="ovchart4"></div>\'\n'],
    // A block that was never in a registry loses its stylesheet
    ['<link rel="stylesheet" href="../_shared/totals-card.css">\n', '']
  ],
  // The tab identity script, commented out; and md-preview, declared in a script template, loses its stylesheet
  'docs/prototypes/skills-view/prototype-skills-preview.html': [
    ['<script src="../app-identity.js"></script>', '<!-- <script src="../app-identity.js"></script> -->'],
    ['<link rel="stylesheet" href="../_shared/md-preview.css">\n', '']
  ],
  // What trend-chart's file names cannot say: its style invariant, and its app component's required prop
  'docs/prototypes/_shared/trend-chart.css': [['  overflow: visible;\n', '  overflow: hidden;\n']],
  'src/renderer/src/DetailPane.tsx': [['        archivedDays={snap.archivedDays}\n', '']]
}

/** Files added (with their content) or removed (null), keyed by their path from the root */
const FILES = {
  // A new shared block, and a script added to an existing one
  'docs/prototypes/_shared/side-note.css': '.side-note {\n  color: var(--text-2);\n}\n',
  'docs/prototypes/_shared/totals-card.js': ';(function () {})()\n',
  // A common library whose file is gone
  'docs/prototypes/_shared/startup-skeleton.css': null
}

/** Pages whose own comment, not a plant, must still name the asset once its real reference is gone, or the case plants
 * nothing */
const NAMED_IN_A_COMMENT = {
  'docs/prototypes/global-search/prototype-search.html': '_shared/app-window.css',
  'docs/prototypes/project-list/prototype-list.html': '_shared/project-side.js'
}

/** Run the gate on a planted copy; returns its exit code and output */
function runGate() {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-shared-ui-'))
  try {
    for (const e of readdirSync(repo)) if (!['docs', 'scripts', 'src', '.git'].includes(e)) symlinkSync(join(repo, e), join(root, e))
    mkdirSync(join(root, 'docs'))
    for (const e of readdirSync(join(repo, 'docs'))) if (e !== 'prototypes') symlinkSync(join(repo, 'docs', e), join(root, 'docs', e))
    cpSync(join(repo, 'docs/prototypes'), join(root, 'docs/prototypes'), { recursive: true })
    cpSync(join(repo, 'src'), join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'scripts'))
    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
    for (const [path, swaps] of Object.entries(PLANTS)) {
      const file = join(root, path)
      let text = readFileSync(file, 'utf8')
      for (const [from, to] of swaps) {
        assert.equal(text.split(from).length, 2, `${path}: the planted string must occur exactly once: ${from}`)
        text = text.replace(from, to)
      }
      const asset = NAMED_IN_A_COMMENT[path]
      assert.ok(!asset || text.includes(asset), `${path}: no comment names ${asset} any more — plant one, or this case tests nothing`)
      writeFileSync(file, text)
    }
    for (const [path, content] of Object.entries(FILES)) {
      if (content === null) rmSync(join(root, path))
      else writeFileSync(join(root, path), content, { flag: 'wx' })
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

test('the planted run fails, and only on what was planted', () => {
  assert.equal(run.status, 1, run.out)
  assert.ok(problems.length > 0, run.out)
  // The common-library list lives in the gate, so a library with no file is reported there
  const planted = [...Object.keys(PLANTS), ...Object.keys(FILES), 'scripts/check-shared-ui.mjs']
  for (const p of problems) assert.ok(planted.some((path) => p.startsWith(`${path}:`)), p)
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

test('a // inside a regular expression is not a comment: the code after it on the line is read', () => {
  assert.ok(reported('docs/prototypes/project-detail/prototype-detail-stale-note.html: follows the mode but still styles by prefers-color-scheme'), run.out)
})

test('a /* inside a string opens no comment: the code after it is read', () => {
  assert.ok(reported('docs/prototypes/plugins-view/prototype-plugin-skill-preview.html: follows the mode but still styles by prefers-color-scheme'), run.out)
})

test("a template's line that starts with // is read", () => {
  assert.ok(reported('docs/prototypes/skill-install/prototype-install.html: follows the mode but still styles by prefers-color-scheme'), run.out)
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

test('a chart without its own declaration is reported, though its page declares the block on another chart', () => {
  assert.ok(reported('docs/prototypes/project-detail/prototype-detail.html: chart container #ovchart2 declares no shared block'), run.out)
})

test("a chart whose declaration is only in a comment is reported", () => {
  assert.ok(reported('docs/prototypes/project-detail/prototype-detail.html: chart container #ovchart3 declares no shared block'), run.out)
})

test('a chart written in a script template is judged as well', () => {
  assert.ok(reported('docs/prototypes/project-detail/prototype-detail.html: chart container #ovchart4 declares no shared block'), run.out)
})

test('a declaration that names no shared block is reported', () => {
  assert.ok(reported('docs/prototypes/project-list/prototype-list.html: data-shared-block="pie-chart" names no shared block'), run.out)
})

test("a block known only by its files is checked: totals-card's stylesheet removed", () => {
  assert.ok(reported('docs/prototypes/project-detail/prototype-detail.html: declares totals-card but does not reference _shared/totals-card.css'), run.out)
})

test("a block known only by its files is checked: md-preview's stylesheet removed, its declaration in a script template", () => {
  assert.ok(reported('docs/prototypes/skills-view/prototype-skills-preview.html: declares md-preview but does not reference _shared/md-preview.css'), run.out)
})

test('a new shared stylesheet is a block: a page linking it without a declaration is reported', () => {
  assert.ok(reported('docs/prototypes/global-search/prototype-search.html: references side-note assets without declaring data-shared-block="side-note"'), run.out)
})

test("a file added to a block joins its contract: a page declaring the block without referencing the file is reported", () => {
  assert.ok(reported('docs/prototypes/agents-page/prototype-agents.html: declares totals-card but does not reference _shared/totals-card.js'), run.out)
})

test("trend-chart's style invariant is still checked", () => {
  assert.ok(
    reported('docs/prototypes/_shared/trend-chart.css: .col violates an invariant (clipping the bar cuts off the tooltip pseudo-element positioned outside it)'),
    run.out
  )
})

test("trend-chart's app component is still checked for its required prop", () => {
  assert.ok(reported('src/renderer/src/DetailPane.tsx: <TrendChart> is missing archivedDays'), run.out)
})

test('a common library with no file in _shared is reported', () => {
  assert.ok(reported('scripts/check-shared-ui.mjs: COMMON_LIBRARIES lists startup-skeleton, but _shared has no startup-skeleton.css or startup-skeleton.js'), run.out)
})
