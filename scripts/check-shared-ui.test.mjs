// Exercise the shared-UI gate's command line on a copy of the prototypes with planted faults: a comment on a page is
// not markup, so a reference, a declaration or a mount point that exists only in a comment must count as missing; a
// chart answers for its own declaration; a shared block is known by its files in _shared/; a UI prototype page has its
// notes file beside it and a header of at most one one-line comment naming it; and every list the gate
// mirrors from the product — colours, themes, sides, languages, READMEs, rail items, the documents it scans — is read
// from where its members are defined, so a member added there is checked, and a source it cannot read is reported.
//
// The gate takes its root from its own location, so the tree holds a copy of the gate under scripts/, real copies of
// docs/prototypes/, src/, the root's READMEs and package.json, an empty docs/.workings, and symbolic links to everything
// else. The prototypes must be copied: the gate walks them with readdirSync's file types, where a link to a directory is not a
// directory, and a linked page would be skipped. The rest is copied so a plant never writes the repository's own file.
// Three trees: the planted one; one whose sources' declarations are renamed or emptied; and one whose source files are
// gone. They cannot share a tree: the first adds a member to a source the second renames, and the second keeps theme.css,
// without which the swatch rule stops before the check its missing themes reach.
//
// Not driven here: the gate's check that every key of its block-specific table is a shared block. Driving it needs a
// block renamed across the pages, which would undo the trend-chart cases in the same run; it was run once on a copy of
// the gate with the key renamed (#314's records). Nor the chip rule's stop when it reads no label: without it, the
// rule would only add lines to a run already red for the missing source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))

/** A planted prototype page: the doctype, the header comments given, the root element, and comments inside the page */
function page(header, inside = '') {
  return `<!doctype html>\n${header}<html lang="zh-CN">\n<head>\n${inside}<meta charset="utf-8">\n<title>Planted</title>\n</head>\n<body></body>\n</html>\n`
}

/** Each plant replaces one string, which must occur exactly once in its file, or every match of a global pattern, which
 * must match at least once (keyed by the file's path from the root) */
const PLANTS = {
  // The issue's two mutations: each page's comment names the asset whose real reference goes (the search page's own
  // comment no longer names it, so the plant leaves one in the link's place)
  'docs/prototypes/global-search/prototype-search.html': [
    ['<link rel="stylesheet" href="../_shared/app-window.css">\n', '<!-- the window frame: ../_shared/app-window.css -->\n'],
    // A new shared stylesheet, linked without a declaration
    ['<link rel="stylesheet" href="../_shared/theme.css">\n', '<link rel="stylesheet" href="../_shared/theme.css">\n<link rel="stylesheet" href="../_shared/side-note.css">\n']
  ],
  'docs/prototypes/project-list/prototype-list.html': [
    ['  <script src="../_shared/project-side.js"></script>\n', ''],
    // A declaration that names no block, and an empty one
    ['<div class="topbar" style="gap:12px">', '<div class="topbar" style="gap:12px" data-shared-block="pie-chart">'],
    ['<b>Agentshed</b>', '<b data-shared-block="">Agentshed</b>']
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
    ],
    // The new rail item's route, sent nowhere
    [
      '<nav class="rail" data-shared-block="app-rail" data-rail-current="agents"></nav>',
      '<nav class="rail" data-shared-block="app-rail" data-rail-current="agents" data-rail-logs="nowhere/missing"></nav>'
    ]
  ],
  // A rail item added
  'docs/prototypes/_shared/app-rail.js': [
    [
      "    { id: 'settings', icon: 'Settings', route: 'appearance/settings', bottom: true }\n",
      "    { id: 'logs', icon: 'Folder', route: 'agents-page/agents' },\n    { id: 'settings', icon: 'Settings', route: 'appearance/settings', bottom: true }\n"
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
    // Charts beside one that declares trend-chart: one without a declaration (its class a list of two tokens), one whose
    // declaration is in a comment
    [
      '<div class="chart" id="ovchart" data-shared-block="trend-chart"></div>',
      '<div class="chart" id="ovchart" data-shared-block="trend-chart"></div><div class="chart wide" id="ovchart2"></div><!-- data-shared-block="trend-chart" --><div class="chart" id="ovchart3"></div>'
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
  'src/renderer/src/theme.css': [
    [
      '     the rounded corner is carried by the topmost segment instead */\n  overflow: visible;\n',
      '     the rounded corner is carried by the topmost segment instead */\n  overflow: hidden;\n'
    ],
    // A provider colour added
    ['  --p-other: #9aa0a6;\n', '  --p-other: #9aa0a6;\n  --p-mistral: #fa520f;\n'],
    // A theme added, light and dark
    [
      '  --accent-soft-deep: #d9d0bf;\n}\n',
      "  --accent-soft-deep: #d9d0bf;\n}\nhtml[data-theme='green'] {\n  --card: #fbfffb;\n  --accent-soft: #e8f5e9;\n  --accent: #2e7d32;\n  --text: #1b261c;\n}\n"
    ],
    [
      '    --accent-soft-deep: #4c412f;\n  }\n',
      "    --accent-soft-deep: #4c412f;\n  }\n  html[data-theme='green'] {\n    --card: #141a15;\n    --accent-soft: #1f2b20;\n    --accent: #66bb6a;\n    --text: #e3ece4;\n  }\n"
    ]
  ],
  'src/shared/appearance.ts': [["export const APPEARANCE_THEMES = ['purple', 'blue', 'amber'] as const", "export const APPEARANCE_THEMES = ['purple', 'blue', 'amber', 'green'] as const"]],
  // The new theme's swatches, the light accent one digit off the sheet's
  'src/renderer/src/SettingsPane.tsx': [
    ["    amber: ['#fffcf7', '#f3ead4', '#6b5220', '#3a342c']\n", "    amber: ['#fffcf7', '#f3ead4', '#6b5220', '#3a342c'],\n    green: ['#fbfffb', '#e8f5e9', '#2e7d33', '#1b261c']\n"],
    ["    amber: ['#221e1a', '#2e2820', '#c4a46a', '#ebe4d8']\n", "    amber: ['#221e1a', '#2e2820', '#c4a46a', '#ebe4d8'],\n    green: ['#141a15', '#1f2b20', '#66bb6a', '#e3ece4']\n"]
  ],
  'src/renderer/src/DetailPane.tsx': [['        archivedDays={snap.archivedDays}\n', '']],
  // Hard-coded colours: --p-xai (light), the new provider colour, dark blue's --accent and blue's light --accent-soft in a
  // file the provider colour rule did not search; a dark provider colour in one it did
  'src/renderer/src/TrendSpan.tsx': [
    ["import { TREND_WINDOW_DAYS, type TrendSpan } from '@shared/trend'\n", "import { TREND_WINDOW_DAYS, type TrendSpan } from '@shared/trend'\nconst PLANTED = ['#ad98d0', '#fa520f', '#7a9dc4', '#eef2f7']\n"]
  ],
  'src/renderer/src/TokenViz.tsx': [["import { useTrendSpan } from './TrendSpan'\n", "import { useTrendSpan } from './TrendSpan'\nconst PLANTED_DARK = '#e8916f'\n"]],
  // A provider colour in a .ts module, which the rules list beside the .tsx files
  'src/renderer/src/skill-content-query.ts': [["import { displayQuery } from './display-queries'\n", "import { displayQuery } from './display-queries'\nconst PLANTED = '#d97757'\n"]],
  // A side added; copy naming it beside another side; its chip label hard-coded
  'src/renderer/src/side-badge.ts': [
    // The full name a constant the gate cannot read; the short name below still names the side
    ["  claude: 'Claude Code',\n  codex: 'Codex',\n  grok: 'Grok',\n  antigravity: 'Antigravity'\n}", "  claude: 'Claude Code',\n  codex: 'Codex',\n  grok: 'Grok',\n  antigravity: 'Antigravity',\n  gemini: GEMINI_FULL_NAME\n}"],
    // ...and a spread the gate cannot read
    ["  claude: 'Claude',\n  codex: 'Codex',\n  grok: 'Grok',\n  antigravity: 'Antigravity'\n}", "  claude: 'Claude',\n  codex: 'Codex',\n  grok: 'Grok',\n  antigravity: 'Antigravity',\n  gemini: 'Gemini',\n  ...EXTRA_SHORT_NAMES\n}"],
    ["  antigravity: 'ANTIGRAVITY'\n}", "  antigravity: 'ANTIGRAVITY',\n  gemini: 'GEMINI'\n}"]
  ],
  'src/shared/i18n/en.ts': [['export const en: Locale = {\n', "export const en: Locale = {\n  plantedSides: 'Works with Codex and Gemini',\n"]],
  'src/renderer/src/StartupHint.tsx': [["import { RefreshCw } from './icons'\n", "import { RefreshCw } from './icons'\nconst PLANTED_CHIP = 'GEMINI'\n"]],
  // A language added (its dictionary in FILES), and a member the gate cannot read
  'src/shared/i18n/index.ts': [["export const LANGUAGES = ['zh', 'en'] as const", "export const LANGUAGES = ['zh', 'en', 'fr', ...EXTRA_LANGUAGES] as const"]],
  // A ticket number in the English README, and one in the package manifest's prose
  'README.en.md': [['# Agentshed\n', '# Agentshed\n\nSee ticket 12.\n']],
  'package.json': [['  "description": "', '  "description": "See ticket 12. ']]
}

/** Files added (with their content) or removed (null), keyed by their path from the root */
const FILES = {
  // A new shared block, and a script added to an existing one
  'docs/prototypes/_shared/side-note.css': '.side-note {\n  color: var(--text-2);\n}\n',
  'docs/prototypes/_shared/totals-card.js': ';(function () {})()\n',
  // A common library whose file is gone
  'docs/prototypes/_shared/startup-skeleton.css': null,
  // The new language's dictionary, in en.ts's form: it enumerates sides and names a rail control that is not exempt
  'src/shared/i18n/fr.ts':
    "export const fr: Locale = {\n  rail: {\n    agents: 'Agents',\n    refresh: 'Actualiser'\n  },\n  railHint: 'Cliquez sur Actualiser',\n  sidesNote: 'Claude Code et Codex'\n}\n",
  // A README the others do not link, which links one that does not exist
  'README.fr.md': '# Agentshed\n\n[Chinese](README.md) · [English](README.en.md) · [German](README.de.md) · **French**\n',
  // Ticket numbers: in a new root document, in a new docs/ directory, and in the construction records
  'HANDBOOK.md': 'See ticket 12.\n',
  'docs/guides/notes.md': 'See ticket 12.\n',
  'docs/.workings/notes/notes.md': 'See ticket 12.\n',
  // A component in a new subdirectory: a provider colour, and a <TrendChart> without its required prop
  'src/renderer/src/panes/Planted.tsx': "const PLANTED = '#10a37f'\nexport const Planted = ({ days }) => <TrendChart days={days} />\n",
  // UI prototype pages and their notes files (prototype-pages::REQ-005), each head in the real pages' form. Without a
  // notes file: a prototype page, a candidates page, and a page whose same-name notes file is in another directory
  'docs/prototypes/planted/prototype-lone.html': page('<!-- Notes: prototype-lone.md -->\n'),
  'docs/prototypes/planted/candidates-lone.html': page('<!-- Notes: candidates-lone.md -->\n'),
  'docs/prototypes/planted-b/prototype-moved.html': page('<!-- Notes: prototype-moved.md -->\n'),
  'docs/prototypes/planted/prototype-moved.md': '# prototype-moved\n',
  // In shape: a one-line header naming the notes file beside it, and a comment after the root element
  'docs/prototypes/planted/prototype-paired.html': page('<!-- Notes: prototype-paired.md -->\n', '<!-- a comment inside the page, not its header -->\n'),
  'docs/prototypes/planted/prototype-paired.md': '# prototype-paired\n',
  // In shape as well: no header comment at all ("at most one")
  'docs/prototypes/planted/prototype-bare.html': page(''),
  'docs/prototypes/planted/prototype-bare.md': '# prototype-bare\n',
  // A logic page is no UI page: no notes file, and a header of two comments
  'docs/prototypes/planted/logic/index.html': page('<!-- A logic prototype -->\n<!-- its question -->\n'),
  // Headers out of shape, each beside its notes file: two comments, one over two lines, one naming another page's notes
  // file (as a page copied from another would), one naming none
  'docs/prototypes/planted/prototype-two.html': page('<!-- Notes: prototype-two.md -->\n<!-- Question: how the list sorts -->\n'),
  'docs/prototypes/planted/prototype-two.md': '# prototype-two\n',
  'docs/prototypes/planted/prototype-tall.html': page('<!-- A UI prototype · the list.\n     Notes: prototype-tall.md -->\n'),
  'docs/prototypes/planted/prototype-tall.md': '# prototype-tall\n',
  'docs/prototypes/planted/prototype-unnamed.html': page('<!-- Notes: prototype-two.md -->\n'),
  'docs/prototypes/planted/prototype-unnamed.md': '# prototype-unnamed\n',
  // ...and one naming no file at all
  'docs/prototypes/planted/prototype-nameless.html': page('<!-- A UI prototype · the list -->\n'),
  'docs/prototypes/planted/prototype-nameless.md': '# prototype-nameless\n'
}

/** The second tree: every source the gate derives a list from, renamed away or emptied */
const MISSING_PLANTS = {
  'src/renderer/src/side-badge.ts': [
    ['export const SIDE_FULL_NAME', 'export const SIDE_LONG_NAME'],
    ['export const SIDE_SHORT_NAME', 'export const SIDE_BRIEF_NAME'],
    ['export const SIDE_CHIP_LABEL', 'export const SIDE_TAG_LABEL']
  ],
  'src/shared/i18n/index.ts': [['export const LANGUAGES = ', 'export const LOCALES = ']],
  'src/shared/appearance.ts': [
    ['export const APPEARANCE_THEMES = ', 'export const THEMES = '],
    ['export const DEFAULT_THEME', 'export const FIRST_THEME']
  ],
  'docs/prototypes/_shared/app-rail.js': [['  const ITEMS = [\n', '  const ITEMS = [], OLD_ITEMS = [\n']],
  'src/renderer/src/theme.css': [
    [/--p-(?=[a-z])/g, '--provider-'],
    [/--accent/g, '--hue']
  ]
}
const MISSING_FILES = { 'README.md': null, 'README.en.md': null }

/** The third tree: every file a mirrored list is read from, gone (the READMEs' absence is the second tree's) */
const ABSENT_FILES = {
  'src/renderer/src/side-badge.ts': null,
  'src/shared/i18n/index.ts': null,
  'src/shared/appearance.ts': null,
  'docs/prototypes/_shared/app-rail.js': null,
  'src/renderer/src/theme.css': null
}

/** Copied into the tree, or made an empty directory there; everything else is a link to the repository */
const COPIED = ['docs/prototypes', 'src', 'README.md', 'README.en.md', 'package.json']
const EMPTY = ['docs/.workings']

/** Pages where a comment, the page's own or a planted one, must still name the asset once its real reference is gone, or
 * the case plants nothing */
const NAMED_IN_A_COMMENT = {
  'docs/prototypes/global-search/prototype-search.html': '_shared/app-window.css',
  'docs/prototypes/project-list/prototype-list.html': '_shared/project-side.js'
}

/** A plant or a file change must land in the tree's own part: a path resolves through its nearest existing ancestor, and
 * one that resolves outside the tree goes through a link, so a change there would write the repository's own file */
function assertInCopy(root, path) {
  let at = join(root, path)
  while (!existsSync(at)) at = dirname(at)
  const real = realpathSync(at)
  const top = realpathSync(root)
  assert.ok(real === top || real.startsWith(top + sep), `${path}: resolves outside the tree (through a link) — a change there would write the repository`)
}

/** Build a tree with these plants and files, run the gate on it; returns its exit code and output */
function runGate(plants, files) {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-shared-ui-'))
  try {
    const place = (rel) => {
      if (COPIED.includes(rel)) cpSync(join(repo, rel), join(root, rel), { recursive: true })
      else if (EMPTY.includes(rel)) mkdirSync(join(root, rel))
      else symlinkSync(join(repo, rel), join(root, rel))
    }
    for (const e of readdirSync(repo)) if (!['docs', 'scripts', '.git'].includes(e)) place(e)
    mkdirSync(join(root, 'docs'))
    for (const e of readdirSync(join(repo, 'docs'))) place(`docs/${e}`)
    mkdirSync(join(root, 'scripts'))
    cpSync(join(repo, 'scripts/check-shared-ui.mjs'), join(root, 'scripts/check-shared-ui.mjs'))
    for (const [path, swaps] of Object.entries(plants)) {
      assertInCopy(root, path)
      const file = join(root, path)
      let text = readFileSync(file, 'utf8')
      for (const [from, to] of swaps) {
        if (from instanceof RegExp) assert.ok(from.global && text.match(from), `${path}: the planted pattern must be global and match: ${from}`)
        else assert.equal(text.split(from).length, 2, `${path}: the planted string must occur exactly once: ${from}`)
        text = text.replace(from, to)
      }
      const asset = NAMED_IN_A_COMMENT[path]
      assert.ok(!asset || text.includes(asset), `${path}: no comment names ${asset} any more — plant one, or this case tests nothing`)
      writeFileSync(file, text)
    }
    for (const [path, content] of Object.entries(files)) {
      assertInCopy(root, path)
      if (content === null) rmSync(join(root, path))
      else {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), content, { flag: 'wx' })
      }
    }
    const r = spawnSync(process.execPath, [join(root, 'scripts/check-shared-ui.mjs')], { encoding: 'utf8' })
    return { status: r.status, out: `${r.stdout}${r.stderr}` }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const problemsOf = (out) => out.split('\n').filter((line) => /^ {4}\S/.test(line)).map((line) => line.trim())
const run = runGate(PLANTS, FILES)
const problems = problemsOf(run.out)
const reported = (line) => problems.includes(line)
const missing = runGate(MISSING_PLANTS, MISSING_FILES)
const missingProblems = problemsOf(missing.out)
const absent = runGate({}, ABSENT_FILES)
const absentProblems = problemsOf(absent.out)

/** Lines a plant causes in a file it does not touch: a new README is reported by the ones that do not link it, and the
 * swatch rule's messages carry no path */
const CAUSED_ELSEWHERE = ['README.md: no link to README.fr.md', 'light.green swatch 3 (--accent): theme.css=#2e7d32, swatch table=#2e7d33']

test('the planted run fails, and only on what was planted', () => {
  assert.equal(run.status, 1, run.out)
  assert.ok(problems.length > 0, run.out)
  // The common-library list lives in the gate, so a library with no file is reported there
  const planted = [...Object.keys(PLANTS), ...Object.keys(FILES), 'scripts/check-shared-ui.mjs']
  for (const p of problems) assert.ok(planted.some((path) => p.startsWith(`${path}:`)) || CAUSED_ELSEWHERE.includes(p), p)
})

/** The lines the two prototype-pages::REQ-005 rules report about one page */
const shapeLines = (path) => problems.filter((p) => p.startsWith(`${path}: has no notes file`) || p.startsWith(`${path}: its header`))

test('a UI prototype page without its notes file is reported', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-lone.html: has no notes file prototype-lone.md beside it'), run.out)
})

test('a candidates page without its notes file is reported', () => {
  assert.ok(reported('docs/prototypes/planted/candidates-lone.html: has no notes file candidates-lone.md beside it'), run.out)
})

test('a notes file in another directory is not the page\'s notes file', () => {
  assert.ok(reported('docs/prototypes/planted-b/prototype-moved.html: has no notes file prototype-moved.md beside it'), run.out)
})

test('a page with its notes file and a one-line header naming it is not reported, whatever comments it holds inside', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-lone.html: has no notes file prototype-lone.md beside it'), run.out)
  assert.deepEqual(shapeLines('docs/prototypes/planted/prototype-paired.html'), [], run.out)
})

test('a header comment that names no notes file at all is reported', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-nameless.html: its header comment does not name prototype-nameless.md'), run.out)
})

test('a page with its notes file and no header comment is not reported', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-two.html: its header holds 2 comments; it may hold one, on one line, naming prototype-two.md'), run.out)
  assert.deepEqual(shapeLines('docs/prototypes/planted/prototype-bare.html'), [], run.out)
})

test('a logic page is not a UI prototype page', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-two.html: its header holds 2 comments; it may hold one, on one line, naming prototype-two.md'), run.out)
  assert.deepEqual(shapeLines('docs/prototypes/planted/logic/index.html'), [], run.out)
})

test('a header of two comments is reported', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-two.html: its header holds 2 comments; it may hold one, on one line, naming prototype-two.md'), run.out)
})

test('a header comment over more than one line is reported', () => {
  assert.ok(reported('docs/prototypes/planted/prototype-tall.html: its header comment spans 2 lines; it may hold one, on one line, naming prototype-tall.md'), run.out)
})

test("a header comment that names another page's notes file, not its own, is reported", () => {
  assert.ok(reported('docs/prototypes/planted/prototype-unnamed.html: its header comment does not name prototype-unnamed.md'), run.out)
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

test('an empty declaration is reported', () => {
  assert.ok(reported('docs/prototypes/project-list/prototype-list.html: data-shared-block="" names no shared block'), run.out)
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

test("trend-chart's style invariant is still checked in the app's sheet", () => {
  assert.ok(reported('src/renderer/src/theme.css: .col violates an invariant (clipping the bar cuts off the tooltip pseudo-element positioned outside it)'), run.out)
})

test("trend-chart's app component is still checked for its required prop", () => {
  assert.ok(reported('src/renderer/src/DetailPane.tsx: <TrendChart> is missing archivedDays'), run.out)
})

test('a common library with no file in _shared is reported', () => {
  assert.ok(reported('scripts/check-shared-ui.mjs: COMMON_LIBRARIES lists startup-skeleton, but _shared has no startup-skeleton.css or startup-skeleton.js'), run.out)
})

test('a provider colour is reported in any renderer file, --p-xai included', () => {
  assert.ok(reported('src/renderer/src/TrendSpan.tsx: hard-coded #ad98d0'), run.out)
})

test("a provider colour's dark value is reported", () => {
  assert.ok(reported('src/renderer/src/TokenViz.tsx: hard-coded #e8916f'), run.out)
})

test('a provider colour added to theme.css is reported without changing the gate', () => {
  assert.ok(reported('src/renderer/src/TrendSpan.tsx: hard-coded #fa520f'), run.out)
})

test("dark blue's accent is reported", () => {
  assert.ok(reported('src/renderer/src/TrendSpan.tsx: hard-coded theme colour #7a9dc4'), run.out)
})

test('a value of the accent family other than --accent is reported', () => {
  assert.ok(reported('src/renderer/src/TrendSpan.tsx: hard-coded theme colour #eef2f7'), run.out)
})

test("the settings page's swatches are not reported by the accent rule", () => {
  assert.ok(!problems.some((p) => p.startsWith('src/renderer/src/SettingsPane.tsx: hard-coded theme colour')), run.out)
})

test("a theme added is checked: its swatch row against its theme.css block", () => {
  assert.ok(reported('light.green swatch 3 (--accent): theme.css=#2e7d32, swatch table=#2e7d33'), run.out)
})

test('a side added is counted in copy that names it beside another side', () => {
  assert.ok(reported("src/shared/i18n/en.ts:5 enumerates 2 side names in copy: 'Works with Codex and Gemini'"), run.out)
})

test("a side added has its chip label checked", () => {
  assert.ok(reported('src/renderer/src/StartupHint.tsx: hardcoded chip label GEMINI — look it up in SIDE_CHIP_LABEL'), run.out)
})

test("a language added has its dictionary checked for side enumerations", () => {
  assert.ok(reported("src/shared/i18n/fr.ts:7 enumerates 2 side names in copy: 'Claude Code et Codex'"), run.out)
})

test("a language added has its dictionary checked for rail controls named verbatim", () => {
  assert.ok(reported(`src/shared/i18n/fr.ts:6 copy names the rail control "Actualiser" (rail.refresh) verbatim: 'Cliquez sur Actualiser'`), run.out)
})

test('a README added is reported by the READMEs that do not link it', () => {
  assert.ok(reported('README.md: no link to README.fr.md'), run.out)
  assert.ok(reported('README.en.md: no link to README.fr.md'), run.out)
})

test('a link to a README that is not at the root is reported', () => {
  assert.ok(reported('README.fr.md: links README.de.md, which is not at the root'), run.out)
})

test("a rail item added has its route on a page checked", () => {
  assert.ok(reported('docs/prototypes/plugins-view/prototype-plugin-skill-preview.html: data-rail-logs="nowhere/missing" is not in manifest.js'), run.out)
})

test('a ticket number in the English README is reported', () => {
  assert.ok(reported('README.en.md:3 references "ticket 12" — use a date or an ADR number'), run.out)
})

test('a ticket number in a new docs/ directory is reported', () => {
  assert.ok(reported('docs/guides/notes.md:1 references "ticket 12" — use a date or an ADR number'), run.out)
})

test('a ticket number in a new document at the root is reported', () => {
  assert.ok(reported('HANDBOOK.md:1 references "ticket 12" — use a date or an ADR number'), run.out)
})

test('a ticket number in the construction records is not reported', () => {
  assert.ok(!problems.some((p) => p.startsWith('docs/.workings/')), run.out)
})

test('a source array with a member the gate cannot read is reported', () => {
  assert.ok(reported('src/shared/i18n/index.ts: LANGUAGES has a member this script cannot read — the dictionaries come from it'), run.out)
})

test('a source record with a member the gate cannot read is reported', () => {
  assert.ok(reported('src/renderer/src/side-badge.ts: SIDE_FULL_NAME has a member this script cannot read — the side names come from it'), run.out)
})

test('a source record with a spread member is reported', () => {
  assert.ok(reported('src/renderer/src/side-badge.ts: SIDE_SHORT_NAME has a member this script cannot read — the side names come from it'), run.out)
})

test("a component in a subdirectory of the renderer's source is checked", () => {
  assert.ok(reported('src/renderer/src/panes/Planted.tsx: hard-coded #10a37f'), run.out)
  assert.ok(reported('src/renderer/src/panes/Planted.tsx: <TrendChart> is missing archivedDays'), run.out)
})

test('a provider colour in a renderer .ts module is reported', () => {
  assert.ok(reported('src/renderer/src/skill-content-query.ts: hard-coded #d97757'), run.out)
})

test('a ticket number in package.json is reported', () => {
  assert.ok(reported('package.json:4 references "ticket 12" — use a date or an ADR number'), run.out)
})

test('the run on missing sources fails, after every rule has run', () => {
  assert.equal(missing.status, 1, missing.out)
  // The summary comes after the last rule: a rule that threw on a missing source would leave the rest unrun
  assert.match(missing.out, /\nShared-UI check failed: \d+ problem\(s\)\./, missing.out)
})

/** What each source reports when its declaration, or its whole file, is gone */
const SOURCE_LINES = [
  'src/renderer/src/side-badge.ts: SIDE_FULL_NAME is missing or empty — the side names come from it',
  'src/renderer/src/side-badge.ts: SIDE_SHORT_NAME is missing or empty — the side names come from it',
  'src/renderer/src/side-badge.ts: SIDE_CHIP_LABEL is missing or empty — the chip labels come from it',
  'src/shared/i18n/index.ts: LANGUAGES is missing or empty — the dictionaries come from it',
  'src/shared/appearance.ts: APPEARANCE_THEMES is missing or empty — the themes come from it',
  'src/shared/appearance.ts: DEFAULT_THEME is missing or empty — the default theme comes from it',
  'docs/prototypes/_shared/app-rail.js: ITEMS is missing or empty — the rail items come from it',
  'src/renderer/src/theme.css: no --p-* value — the provider colours come from them',
  'src/renderer/src/theme.css: no --accent family value — the accent colours come from them',
  'no README*.md at the root — the README rule reads them'
]

for (const line of SOURCE_LINES) {
  test(`a missing source is reported: ${line}`, () => {
    assert.ok(missingProblems.includes(line), missing.out)
  })
}

test('the run on absent source files fails, after every rule has run', () => {
  assert.equal(absent.status, 1, absent.out)
  assert.match(absent.out, /\nShared-UI check failed: \d+ problem\(s\)\./, absent.out)
})

// The READMEs' absence is the second tree's: the other nine sources, each read from a file that is not there
for (const line of SOURCE_LINES.filter((l) => !l.startsWith('no README'))) {
  test(`an absent source file is reported: ${line}`, () => {
    assert.ok(absentProblems.includes(line), absent.out)
  })
}
