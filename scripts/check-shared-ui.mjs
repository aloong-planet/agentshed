#!/usr/bin/env node
// Shared UI consistency check: turns "where a shared visual block appears and what it must satisfy" into
// executable assertions,
// so the use sites no longer have to be enumerated by hand. Hooked into pnpm verify, it errors on a
// missed edit.
//
// The identifying key is the **block identity** rather than a generic class name: a page declares "I use
// this block" with data-shared-block="<id>",
// so one page can hold several kinds of chart (trend / pie / line …), each declaring its own id without
// interfering.
//
// A shared block is known by its files: _shared/<id>.css and _shared/<id>.js are block <id>'s assets, apart from
// the common libraries (COMMON_LIBRARIES), which pages share without being a visual block. Adding a kind of shared
// block = adding its files; adding a use site = the declaration attribute on the page. Neither requires changing
// this script; only what a file name cannot say about a block (its mount points, style invariants, app component)
// goes in BLOCK_CONTRACTS.
//
// It also carries checks on the app's own code: the copy rules, hard-coded colours, the side chips, and the
// app side of the shared blocks' style invariants and required props. Every check runs every time. None
// compares the prototypes with the app: the prototypes are the baseline the app is built from (ADR-0033),
// so a page that differs from the app is not wrong on that account.
//
// What a check mirrors from the product — the colours, the themes, the sides, the languages, the READMEs, the
// rail items, the documents the ticket-number rule reads — is read from where its members are defined (the
// mirrored lists below), so a member added there is checked without changing this script, and a source this
// script cannot read is reported rather than leaving its check to look at nothing.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

/** The files in _shared/ that pages share without being a visual block: no page declares them */
const COMMON_LIBRARIES = ['copy', 'icons', 'startup-skeleton', 'theme']

/** What a block's file names cannot give, keyed by block id */
const BLOCK_CONTRACTS = {
  'trend-chart': {
    /** Mount points a page declaring it must have (appearing as an id attribute) */
    containers: ['xaxis', 'legend'],
    /** That block's style invariants: selector → declarations that must not appear (with the reason) */
    cssInvariants: [
      {
        files: ['docs/prototypes/_shared/trend-chart.css', 'src/renderer/src/theme.css'],
        selector: '.col',
        forbid: /overflow:\s*hidden/,
        why: 'clipping the bar cuts off the tooltip pseudo-element positioned outside it'
      }
    ],
    /** The corresponding component on the app side, and its required props */
    appComponent: { name: 'TrendChart', requiredProps: ['archivedDays'] }
  }
}

/** The shared blocks, from their files: each _shared/<id>.css or .js that is not a common library is an asset of
 * block <id>, which a page declaring the block must reference */
function sharedBlocks() {
  const dir = join(ROOT, 'docs/prototypes/_shared')
  const assets = new Map()
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const m = name.match(/^(.+)\.(css|js)$/)
    if (!m || COMMON_LIBRARIES.includes(m[1])) continue
    assets.set(m[1], [...(assets.get(m[1]) ?? []), `_shared/${name}`])
  }
  return [...assets].map(([id, files]) => ({ id, assets: files, containers: [], ...BLOCK_CONTRACTS[id] }))
}
const SHARED_BLOCKS = sharedBlocks()

// ── Consistency between the settings page's palette samples and theme.css (issue #59) ──
// The settings page's three theme cards each draw 4 swatches, sampling --card / --accent-soft /
// --accent / --text,
// in two sets by effective light/dark. Those 24 values can only be **copied by hand**: at runtime
// getComputedStyle can only read the set currently
// in effect, not the other two themes or the other light/dark, and TS cannot import CSS variables
// either.
// So "changed a theme colour but missed the sample table" has nothing that would go red — the palette
// preview stops matching what is actually seen, silently.
// This rule is that "something that goes red".

/** The sampling rule: the swatches take these four variables left to right, and the order is the meaning */
const SWATCH_VARS = ['card', 'accent-soft', 'accent', 'text']

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** Match brackets from `open` (the index of a `{` or `[`) and return the text inside; null if they do
 * not match */
function balancedBody(src, open) {
  const pairs = { '{': '}', '[': ']' }
  const close = pairs[src[open]]
  if (!close) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++
    else if (src[i] === close) {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return null
}

/** Get the inner text of the block immediately following a literal selector or key name */
function bodyAfter(src, literal, opener = '{') {
  const at = src.indexOf(literal)
  if (at < 0) return null
  const open = src.indexOf(opener, at + literal.length)
  return open < 0 ? null : balancedBody(src, open)
}

/**
 * Split theme.css into "inside the dark media queries" and "everything else".
 * theme.css has more than one `@media (prefers-color-scheme: dark)` (four others, for mark, question
 * locating and so on),
 * so taking only the first is wrong: the dark part is the **union** of every media block, and the light
 * part is what remains once they are all cut out.
 */
function splitByColorScheme(css) {
  const re = /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/g
  let darkParts = ''
  let light = ''
  let cursor = 0
  let m
  while ((m = re.exec(css))) {
    const open = css.indexOf('{', m.index + m[0].length - 1)
    const body = balancedBody(css, open)
    if (body === null) continue
    const end = open + 1 + body.length + 1
    light += css.slice(cursor, m.index)
    darkParts += `\n${body}`
    cursor = end
    re.lastIndex = end
  }
  light += css.slice(cursor)
  return { light, dark: darkParts }
}

/** Read the four sampled variables' values under a selector block from a chunk of CSS text */
function swatchFromCss(cssPart, selector) {
  const body = bodyAfter(cssPart, selector)
  if (body === null) return null
  return SWATCH_VARS.map((v) => {
    const m = body.match(new RegExp(`--${v}\\s*:\\s*([^;]+);`))
    return m ? m[1].trim().toLowerCase() : null
  })
}

/** Read the four values for a given light/dark and theme out of SettingsPane's THEME_SWATCH */
function swatchFromTsx(tsx, mode, theme) {
  const table = bodyAfter(tsx, 'THEME_SWATCH')
  if (table === null) return null
  const modeBody = bodyAfter(table, `${mode}:`)
  if (modeBody === null) return null
  const arr = bodyAfter(modeBody, `${theme}:`, '[')
  if (arr === null) return null
  return arr
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter((s) => s.length > 0)
}

// ── Demo dimensions (prototype skill, UI.md harness clause) ──
// A product dimension (UI language, light/dark mode, theme) is changed on the settings prototype alone,
// through demo-dimensions.js; every other page follows the value set there and offers no switch of its
// own. The registry docs/prototypes/dimensions.js lists each dimension's values; this rule is what goes red
// when the wiring drifts.

/** A page's demo-dimensions wiring: the script tag, { id: the values it is drawn in }, and whether it sets them */
function pageDimensions(code) {
  const tag = code.match(/<script\b[^>]*\bsrc="[^"]*demo-dimensions\.js"[^>]*>/)
  const follows = {}
  for (const token of (tag?.[0].match(/\bdata-follow="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean)) {
    const [id, only] = token.split('=')
    follows[id] = only ? only.split(',') : null
  }
  return { tag, follows, sets: code.includes('DemoDimensions.set(') }
}

/** An inline script's code without its JS comments. The parser finds them, so a `//` after code on the same line is a
 * comment, and a `//` inside a string, a template or a regular expression is not */
function stripJsComments(code) {
  const sf = ts.createSourceFile('inline.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const comments = new Map()
  const visit = (node) => {
    const around = [...(ts.getLeadingCommentRanges(code, node.getFullStart()) ?? []), ...(ts.getTrailingCommentRanges(code, node.getEnd()) ?? [])]
    for (const r of around) comments.set(r.pos, r.end)
    for (const child of node.getChildren(sf)) visit(child)
  }
  visit(sf)
  let out = ''
  let at = 0
  for (const [pos, end] of [...comments].sort((a, b) => a[0] - b[0])) {
    if (pos < at) continue
    out += code.slice(at, pos)
    at = end
  }
  return out + code.slice(at)
}

/** A page's code with comments removed: comments may describe the wiring, only markup and code count. One pass over the
 * page, each comment removed by the rules of where it stands: an HTML comment in the markup, an inline script's JS
 * comments by the parser (stripJsComments), a style block's CSS comments. A comment-like sequence anywhere else — a
 * `/*` in a script's string, a `//` in the markup's text — is not a comment there and stays */
const stripComments = (src) =>
  src.replace(/<!--[\s\S]*?-->|(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (comment, open, tag, body, close) =>
    open === undefined ? '' : open + (tag.toLowerCase() === 'script' ? stripJsComments(body) : stripCssComments(body)) + close
  )

/** An opening tag, its attribute values quoted or bare (a `>` inside a quoted value does not end it) */
const OPEN_TAG = /<[a-zA-Z][\w-]*(?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*\s*\/?>/g

/** Evaluate the registry the way a page does: a script that assigns window.DEMO_DIMENSIONS */
function loadDimensions() {
  const src = read('docs/prototypes/dimensions.js')
  if (src === null) return null
  const sandbox = { window: {} }
  vm.runInNewContext(src, sandbox, { filename: 'docs/prototypes/dimensions.js' })
  return sandbox.window.DEMO_DIMENSIONS ?? null
}

// ── The mirrored lists ──
// Each list a check mirrors from the product is read from where its members are defined, so adding a member there
// is enough for the check to cover it. A source that is not there, or names nothing, goes into SOURCE_PROBLEMS, which
// a rule reports: the check that would have used it then looks at nothing, and only that report says so.

const SOURCE_PROBLEMS = []

/** The literal value of a `const <name> = …` in a .ts or .js source, read with the TypeScript parser and nested
 * declarations included (app-rail.js keeps its items inside a function): strings, arrays and objects of them, an
 * `as const` or type annotation set aside; undefined when the file or the declaration is not there, and for any part
 * that is not such a literal — an object's spread or shorthand member is kept as an entry whose value is undefined,
 * so it counts as a member that could not be read */
function constValue(path, name) {
  const src = read(path)
  if (src === null) return undefined
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)
  let init
  const visit = (node) => {
    if (init) return
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) init = node.initializer
    else ts.forEachChild(node, visit)
  }
  visit(sf)
  const literal = (n) => {
    while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n))) n = n.expression
    if (!n) return undefined
    if (ts.isStringLiteralLike(n)) return n.text
    if (ts.isArrayLiteralExpression(n)) return n.elements.map(literal)
    if (ts.isObjectLiteralExpression(n)) {
      const out = {}
      n.properties.forEach((p, i) => {
        if (ts.isPropertyAssignment(p)) out[p.name.getText(sf).replace(/^['"]|['"]$/g, '')] = literal(p.initializer)
        else out[`(member ${i})`] = undefined
      })
      return out
    }
    return undefined
  }
  return literal(init)
}

/** A mirrored list's members as read from `path`'s `name`, each a string, or a [key, string] pair when `valueOf` takes
 * the string out of it. Reported when there is none, and when a member is not a literal the reader can take (a spread,
 * a constant's name): leaving it out would check the rest and say nothing of it */
function mirrored(path, name, what, members, valueOf = (m) => m) {
  const taken = members.filter((m) => typeof valueOf(m) === 'string' && valueOf(m) !== '')
  if (taken.length === 0) SOURCE_PROBLEMS.push(`${path}: ${name} is missing or empty — ${what}`)
  else if (taken.length < members.length) SOURCE_PROBLEMS.push(`${path}: ${name} has a member this script cannot read — ${what}`)
  return taken
}
/** An array constant's elements, and a record constant's entries (none when it is not that shape) */
const elementsOf = (path, name) => {
  const v = constValue(path, name)
  return Array.isArray(v) ? v : []
}
const entriesOf = (path, name) => {
  const v = constValue(path, name)
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : []
}

/** Every side's names in copy — its full and its short display name — from side-badge.ts */
const SIDE_BADGE = 'src/renderer/src/side-badge.ts'
const SIDE_NAME_ENTRIES = ['SIDE_FULL_NAME', 'SIDE_SHORT_NAME'].map((name) =>
  mirrored(SIDE_BADGE, name, 'the side names come from it', entriesOf(SIDE_BADGE, name), ([, n]) => n)
)
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** One pattern per side, matching any of its names: a string naming a side twice ("Claude Code", "Claude") counts it
 * once */
const SIDE_NAMES = [...new Set(SIDE_NAME_ENTRIES.flat().map(([side]) => side))].map((side) => {
  const names = [...new Set(SIDE_NAME_ENTRIES.flat().filter(([s]) => s === side).map(([, n]) => n))]
  return new RegExp(names.map(escapeRegExp).join('|'))
})
/** The uppercase chip labels, from side-badge.ts */
const CHIP_LABELS = mirrored(SIDE_BADGE, 'SIDE_CHIP_LABEL', 'the chip labels come from it', entriesOf(SIDE_BADGE, 'SIDE_CHIP_LABEL'), ([, l]) => l).map(([, l]) => l)

/** The dictionaries the copy rules read: one per supported language */
const DICTIONARIES = mirrored('src/shared/i18n/index.ts', 'LANGUAGES', 'the dictionaries come from it', elementsOf('src/shared/i18n/index.ts', 'LANGUAGES')).map(
  (lang) => `src/shared/i18n/${lang}.ts`
)

/** The themes' selectors in theme.css: the default theme's values sit in :root, every other theme's under its
 * data-theme (the light and dark blocks share one set of selectors). Null when either source is missing */
const THEMES = mirrored('src/shared/appearance.ts', 'APPEARANCE_THEMES', 'the themes come from it', elementsOf('src/shared/appearance.ts', 'APPEARANCE_THEMES'))
const DEFAULT_THEME = mirrored('src/shared/appearance.ts', 'DEFAULT_THEME', 'the default theme comes from it', [constValue('src/shared/appearance.ts', 'DEFAULT_THEME')])[0]
const THEME_SELECTORS =
  THEMES.length && DEFAULT_THEME ? Object.fromEntries(THEMES.map((t) => [t, t === DEFAULT_THEME ? ':root' : `html[data-theme='${t}']`])) : null

/** The rail's items, from the shared rail's own list */
const RAIL_ITEMS = mirrored(
  'docs/prototypes/_shared/app-rail.js',
  'ITEMS',
  'the rail items come from it',
  elementsOf('docs/prototypes/_shared/app-rail.js', 'ITEMS').map((item) => item?.id)
)

/** Every hex value theme.css gives a variable whose name starts with `prefix`, in any theme and either mode. Only hex
 * values: a var(--x) value would report every component that uses that token. A colour written in another notation
 * is not searched for */
function themeHexValues(prefix, what) {
  const css = stripCssComments(read('src/renderer/src/theme.css') ?? '')
  const values = new Set()
  for (const m of css.matchAll(new RegExp(`${escapeRegExp(prefix)}[\\w-]*\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'g'))) values.add(m[1].toLowerCase())
  if (values.size === 0) SOURCE_PROBLEMS.push(`src/renderer/src/theme.css: no ${prefix === '--p-' ? '--p-*' : `${prefix} family`} value — ${what}`)
  return [...values]
}
const PROVIDER_COLOURS = themeHexValues('--p-', 'the provider colours come from them')
const ACCENT_COLOURS = themeHexValues('--accent', 'the accent colours come from them')

/** The READMEs: every README*.md at the root */
const READMES = readdirSync(ROOT)
  .filter((name) => /^README.*\.md$/.test(name))
  .sort()
if (READMES.length === 0) SOURCE_PROBLEMS.push('no README*.md at the root — the README rule reads them')

/** Every .ts and .tsx in the renderer's source, its subdirectories included (the code-side rules' scope) */
const rendererSources = () =>
  readdirSync(join(ROOT, 'src/renderer/src'), { recursive: true })
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .sort()
    .map((name) => `src/renderer/src/${name}`)

/** Global rules: constraints independent of any particular block */
const GLOBAL_RULES = [
  {
    // The rule that speaks for the mirrored lists above: without it, a source renamed or emptied would leave its
    // check reading nothing, and green
    name: 'every list the checks mirror from the product is read from a source that names its members',
    check() {
      return SOURCE_PROBLEMS
    }
  },
  {
    // A ticket lives in a tracker, gets closed and cleaned up; a spec is written before its tickets
    // exist and outlives them, so a ticket number in a persistent document is a pointer guaranteed
    // to dangle — the reader who follows it finds nothing. Provenance that must survive goes in as
    // a date or an ADR number. Source comments are deliberately out of scope: there a ticket number
    // is construction context that lives and dies with the code it annotates.
    //
    // The persistent documents are every .md at the root, package.json, and every document under docs/ apart from
    // the construction records in docs/.workings, which name their tickets by design. The walk skips hidden entries,
    // as it always has, and that is what leaves docs/.workings out; a new directory under docs/ is read as it appears.
    name: 'persistent documents must not reference ticket numbers (they outlive the tickets)',
    check() {
      const bad = []
      const files = [
        ...readdirSync(ROOT)
          .filter((name) => name.endsWith('.md'))
          .sort(),
        'package.json'
      ]
      const walk = (dir) => {
        const abs = join(ROOT, dir)
        if (!existsSync(abs)) return
        for (const e of readdirSync(abs, { withFileTypes: true })) {
          if (e.name === 'vendor' || e.name.startsWith('.')) continue
          const rel = `${dir}/${e.name}`
          if (e.isDirectory()) walk(rel)
          else if (/\.(md|html|js)$/.test(e.name)) files.push(rel)
        }
      }
      walk('docs')
      for (const f of files) {
        const src = read(f)
        if (src === null) continue
        src.split('\n').forEach((line, i) => {
          const m = line.match(/\btickets?\s+[0-9]+[a-z]?\b/i)
          if (m) bad.push(`${f}:${i + 1} references "${m[0]}" — use a date or an ADR number`)
        })
      }
      return bad
    }
  },
  {
    // "Each README reaches the other" is a **decidable property**, so it is baked into a gate rather than
    // left to the eye (the user's ruling, 2026-08-09; i18n::CON-001). What it prevents: missing a link when
    // adding a language or renaming a file — nothing else would flag that kind of omission, and a reader
    // only discovers it by clicking a dead link.
    //
    // The READMEs are the root's README*.md files (READMES), so a new one is checked as it appears. A link to a
    // README that is not there is reported too: that is how a removed README still shows, through the links to it.
    name: 'every README links every other, and none links a README that is not there (i18n::CON-001)',
    check() {
      const bad = []
      for (const f of READMES) {
        const src = read(f) ?? ''
        const linked = new Set([...src.matchAll(/\]\((README[^)]*\.md)\)/g)].map((m) => m[1]))
        for (const other of READMES) {
          if (other !== f && !linked.has(other)) bad.push(`${f}: no link to ${other}`)
        }
        for (const target of linked) if (!READMES.includes(target)) bad.push(`${f}: links ${target}, which is not at the root`)
        // The current language should be the **only** bold entry: zero = the reader cannot tell which one
        // they are on, more than one = a copy-paste that missed an edit
        const nav = src.split('\n').find((l) => l.includes('README.en.md') || l.includes('README.md)')) ?? ''
        const bold = (nav.match(/\*\*[^*]+\*\*/g) ?? []).length
        if (bold !== 1) bad.push(`${f}: the language switcher must have exactly one bold entry (found ${bold})`)
      }
      return bad
    }
  },
  {
    name: 'settings palette swatches match theme.css variables (changing a theme colour must update the swatch table)',
    check() {
      const bad = []
      const cssRaw = read('src/renderer/src/theme.css')
      const tsx = read('src/renderer/src/SettingsPane.tsx')
      // Being unable to read the file is itself the problem: silently skipping would make this rule
      // switch itself off the moment a file is renamed
      if (cssRaw === null) return ['cannot read src/renderer/src/theme.css']
      if (tsx === null) return ['cannot read src/renderer/src/SettingsPane.tsx']
      // Without the themes there is nothing to compare; the mirrored lists' rule reports the source
      if (THEME_SELECTORS === null) return []
      const { light, dark } = splitByColorScheme(stripCssComments(cssRaw))
      for (const [mode, part] of [['light', light], ['dark', dark]]) {
        for (const [theme, selector] of Object.entries(THEME_SELECTORS)) {
          const want = swatchFromCss(part, selector)
          const got = swatchFromTsx(tsx, mode, theme)
          if (want === null || want.some((v) => v === null)) {
            bad.push(`theme.css: ${mode}.${theme} (${selector}) is missing some of ${SWATCH_VARS.join('/')}`)
            continue
          }
          if (got === null) {
            bad.push(`SettingsPane.tsx: THEME_SWATCH.${mode}.${theme} not found`)
            continue
          }
          if (got.length !== want.length) {
            bad.push(`${mode}.${theme}: ${got.length} swatch(es) but theme.css has ${want.length} variables`)
            continue
          }
          want.forEach((w, i) => {
            if (w !== got[i]) {
              bad.push(`${mode}.${theme} swatch ${i + 1} (--${SWATCH_VARS[i]}): theme.css=${w}, swatch table=${got[i]}`)
            }
          })
        }
      }
      return bad
    }
  },
  {
    // CONTEXT invariant (settled 2026-08-16): user-facing copy never enumerates the agent sides as
    // an exhaustive set — the side set grows, and an enumerated sentence becomes a lie in every
    // language at once on a surface no onboarding diff touches (it happened twice in one round).
    // Copy whose surface genuinely judges only some sides today is allow-listed by dictionary key,
    // each entry carrying the reason it may name them.
    name: 'dictionary copy must not enumerate agent sides as an exhaustive set (CONTEXT invariant)',
    check() {
      const bad = []
      // The side names (SIDE_NAMES) and the dictionaries (DICTIONARIES) are mirrored lists
      // Side-COUNT words are the same rot family stated as a number ("both sides" lies the moment a
      // third arrives); one occurrence flags, unlike names which need two to look like a set
      const SIDE_COUNT_WORDS =
        /两侧|both sides|both global|two sides/i
      const ALLOWED = [
        {
          key: 'grokBorrowHint',
          why: 'names the two specific sides of a real borrowing relation (ADR-0019 copy); not an exhaustive enumeration'
        },
        {
          key: 'projectHint',
          why: 'shadowing semantics are verified for these two sides only; Grok agent definitions have no real sample yet (spec agents-overview G2)'
        },
        {
          key: 'claudeOnly',
          why: 'contrasts the two memory mechanisms verified today; Grok memory has no real sample yet (spec agents-overview G2)'
        },
        {
          key: 'noneGlobal',
          why: 'names the two directories actually read; Grok agent definitions have no real sample yet (spec agents-overview G2)'
        },
        {
          key: 'unlinkedNote',
          why: 'records a measurement made on those two sides; the Grok dispatch is unattributed by the same rule'
        },
        {
          key: 'reasoningNote',
          why: "a statement about two specific sides' formats (Codex encrypted vs Claude thinking), true regardless of the side count"
        }
      ]
      for (const f of DICTIONARIES) {
        const src = read(f)
        if (src === null) {
          bad.push(`cannot read ${f}`)
          continue
        }
        const lines = src.split('\n')
        lines.forEach((line, i) => {
          if (/^\s*(\/\/|\/\*|\*)/.test(line)) return // comments are not copy
          const strings = line.match(/'[^']*'|`[^`]*`|"[^"]*"/g) ?? []
          for (const s of strings) {
            const nameHits = SIDE_NAMES.filter((re) => re.test(s)).length
            const countHit = SIDE_COUNT_WORDS.test(s)
            if (nameHits < 2 && !countHit) continue
            const hits = countHit ? Math.max(nameHits, 2) : nameHits
            // A wrapped value's key sits on the previous line, so both lines identify the entry
            const prev = i > 0 ? lines[i - 1] : ''
            const allowed = ALLOWED.find((a) => line.includes(`${a.key}:`) || prev.includes(`${a.key}:`))
            if (allowed) continue
            bad.push(`${f}:${i + 1} enumerates ${hits} side names in copy: ${s.slice(0, 60)}`)
          }
        })
      }
      return bad
    }
  },
  {
    // CONTEXT invariant, sharpened 2026-08-23: copy must not name a control the user has to find,
    // because the sentence outlives the control. Parameterising the label (what `notDetectedHint`
    // did) survives a **rename** but not a **removal** — when the global refresh was deleted, three
    // strings in six languages each still sent users to a button that no longer existed, and only a
    // hand sweep found two of them.
    //
    // What this checks: a rail control's label must not appear verbatim in any other copy. Removing
    // the control then makes those sentences fail here rather than survive as instructions to press
    // something that is gone.
    //
    // The exemptions are by rail **key**, not by language string, and every current one exists for
    // the same structural reason: the label is an ordinary word (or a substring of the product name),
    // so occurrences in copy are prose rather than pointers. Each retires the day its label stops
    // being ordinary. A newly added control with a distinctive label is armed by default — which is
    // exactly the case that rotted.
    name: 'dictionary copy must not name a rail control verbatim (a sentence outlives the control)',
    check() {
      const bad = []
      const EXEMPT = [
        {
          key: 'agents',
          why: 'the label is a substring of the product name (Agentshed) and of AGENTS.md, and names a page in navigational prose; retires if the dimension is renamed to something distinctive'
        },
        {
          key: 'projects',
          why: 'an ordinary word that also names a registry key ("the projects key"); retires if the dimension is renamed to something distinctive'
        },
        {
          key: 'search',
          why: 'an ordinary verb or noun in every language, and the word the search boxes\' placeholders and the global search page\'s own title use; retires if the dimension is renamed to something distinctive'
        },
        {
          key: 'settings',
          why: 'an ordinary noun in every language (and part of an external product\'s menu path in the Codex memory hint); retires if the entry is renamed to something distinctive'
        }
      ]
      // The dictionaries are a mirrored list (DICTIONARIES)
      for (const f of DICTIONARIES) {
        const src = read(f)
        if (src === null) {
          bad.push(`cannot read ${f}`)
          continue
        }
        const rail = src.match(/rail: \{([\s\S]*?)\n {2}\}/)
        if (rail === null) {
          bad.push(`${f}: cannot locate the rail block (this rule reads the control labels from it)`)
          continue
        }
        const labels = [...rail[1].matchAll(/(\w+):\s*'([^']+)'/g)]
          .filter(([, key]) => !EXEMPT.some((e) => e.key === key))
          .map(([, key, label]) => ({ key, label }))
        if (labels.length === 0) continue
        const railLines = new Set()
        const start = src.slice(0, rail.index).split('\n').length - 1
        for (let i = start; i < start + rail[1].split('\n').length + 1; i++) railLines.add(i)
        const lines = src.split('\n')
        lines.forEach((line, i) => {
          if (railLines.has(i)) return // the labels' own definitions
          if (/^\s*(\/\/|\/\*|\*)/.test(line)) return // comments are not copy
          for (const s of line.match(/'[^']*'|`[^`]*`|"[^"]*"/g) ?? []) {
            for (const { key, label } of labels) {
              if (s.includes(label)) {
                bad.push(`${f}:${i + 1} copy names the rail control "${label}" (rail.${key}) verbatim: ${s.slice(0, 60)}`)
              }
            }
          }
        })
      }
      return bad
    }
  },
  {
    // The provider colours are every --p-* value in theme.css, light and dark (PROVIDER_COLOURS)
    name: 'provider colours must not be hard-coded in components (use CSS variables)',
    check() {
      const bad = []
      for (const f of rendererSources()) {
        const src = (read(f) ?? '').toLowerCase()
        for (const c of PROVIDER_COLOURS) if (src.includes(c)) bad.push(`${f}: hard-coded ${c}`)
      }
      return bad
    }
  },
  {
    // appearance C3: components bind only to tokens; the settings page's swatches deliberately show each
    // theme's sample colours, so they are excluded. The accent colours are every value of the --accent family in
    // theme.css, in every theme and mode (ACCENT_COLOURS).
    name: 'components must not hard-code theme accent colours (use the --accent family)',
    check() {
      const bad = []
      for (const f of rendererSources()) {
        if (f.endsWith('/SettingsPane.tsx')) continue
        const src = (read(f) ?? '').toLowerCase()
        for (const c of ACCENT_COLOURS) if (src.includes(c)) bad.push(`${f}: hard-coded theme colour ${c}`)
      }
      return bad
    }
  },
  {
    // The side chips' single source (spec project-detail S3): every chip surface looks its label up in
    // SIDE_CHIP_LABEL and maps over SIDE_ORDER, which is what lets a new side appear by construction.
    // A re-hardcoded label would compile and render happily and nothing else would notice — this rule
    // makes the convention mechanical. Exclusion: side-badge.ts is the Record's own definition, the one
    // legal spelling site; it retires only if the chip labels ever move out of that module. The labels are
    // SIDE_CHIP_LABEL's own (CHIP_LABELS), so a new side's label is checked as it is added.
    name: 'side chip labels have one source: no hard-coded SIDE_CHIP_LABEL label outside side-badge.ts',
    check() {
      const bad = []
      // With no labels the pattern would match any empty string literal; the mirrored lists' rule reports the source
      if (CHIP_LABELS.length === 0) return bad
      const CHIP = new RegExp(`['"\`>](${CHIP_LABELS.map(escapeRegExp).join('|')})['"\`<]`)
      for (const f of rendererSources()) {
        if (f.endsWith('/side-badge.ts') || f.includes('.test.')) continue
        const m = (read(f) ?? '').match(CHIP)
        if (m) bad.push(`${f}: hardcoded chip label ${m[1]} — look it up in SIDE_CHIP_LABEL`)
      }
      return bad
    }
  },
  {
    // Each chart answers for itself: a chart without its own declaration is outside every block's check, however many
    // other blocks its page declares. Read as text without comments rather than through JSDOM, so a chart written in a
    // script template is judged as well
    name: 'every chart container in a prototype declares its own shared block (otherwise consistency cannot be checked)',
    check() {
      const bad = []
      for (const f of prototypeHtmls()) {
        for (const [tag] of stripComments(read(f) ?? '').matchAll(OPEN_TAG)) {
          const cls = tag.match(/\sclass="([^"]*)"/)
          if (!cls || !cls[1].split(/\s+/).includes('chart')) continue
          if (/\sdata-shared-block="[^"]+"/.test(tag)) continue
          const id = tag.match(/\sid="([^"]*)"/)
          bad.push(`${f}: chart container ${id ? `#${id[1]}` : tag} declares no shared block`)
        }
      }
      return bad
    }
  },
  {
    // A declaration naming no block is checked by nothing, and reads as if it were
    name: 'every declaration on a prototype page names a shared block (a _shared/<id>.css or .js that is not a common library)',
    check() {
      const ids = new Set(SHARED_BLOCKS.map((b) => b.id))
      const bad = []
      for (const f of prototypeHtmls()) {
        const unknown = new Set()
        for (const m of stripComments(read(f) ?? '').matchAll(/data-shared-block="([^"]*)"/g)) if (!ids.has(m[1])) unknown.add(m[1])
        for (const id of unknown) bad.push(`${f}: data-shared-block="${id}" names no shared block`)
      }
      return bad
    }
  },
  {
    // The two hand-kept lists: a stale entry would silently exempt a future file, or silently drop a block's checks
    name: "the gate's common libraries and block contracts name files and blocks that exist",
    check() {
      const dir = join(ROOT, 'docs/prototypes/_shared')
      const names = existsSync(dir) ? readdirSync(dir) : []
      const bad = []
      for (const lib of COMMON_LIBRARIES) {
        if (!names.includes(`${lib}.css`) && !names.includes(`${lib}.js`)) {
          bad.push(`scripts/check-shared-ui.mjs: COMMON_LIBRARIES lists ${lib}, but _shared has no ${lib}.css or ${lib}.js`)
        }
      }
      for (const id of Object.keys(BLOCK_CONTRACTS)) {
        if (!SHARED_BLOCKS.some((b) => b.id === id)) bad.push(`scripts/check-shared-ui.mjs: BLOCK_CONTRACTS has an entry for ${id}, which is no shared block`)
      }
      return bad
    }
  },
  {
    name: 'demo dimensions are set on the settings prototype alone and followed elsewhere (dimensions.js + demo-dimensions.js)',
    check() {
      let dims
      try {
        dims = loadDimensions()
      } catch (e) {
        return [`docs/prototypes/dimensions.js does not evaluate: ${e.message}`]
      }
      if (dims === null) return ['docs/prototypes/dimensions.js is missing or does not set window.DEMO_DIMENSIONS']
      const bad = []
      for (const [id, d] of Object.entries(dims)) {
        const values = d.values ?? []
        if (values.length === 0 || new Set(values).size !== values.length) {
          bad.push(`dimensions.js: ${id} lists no values, or lists one twice`)
        }
        if (!values.includes(d.default)) bad.push(`dimensions.js: ${id}'s default "${d.default}" is not one of its values`)
        if (d.fallback !== undefined && !values.includes(d.fallback)) bad.push(`dimensions.js: ${id}'s fallback "${d.fallback}" is not one of its values`)
      }
      const setters = []
      for (const f of prototypeHtmls()) {
        const code = stripComments(read(f) ?? '')
        const registry = code.search(/src="[^"]*\/dimensions\.js"/)
        const { tag, follows, sets } = pageDimensions(code)
        if (sets) setters.push(f)
        if (!tag) {
          if (/\bDemoDimensions\./.test(code)) bad.push(`${f}: calls DemoDimensions without including demo-dimensions.js`)
          continue
        }
        if (registry < 0) bad.push(`${f}: includes demo-dimensions.js without dimensions.js`)
        else if (registry > tag.index) bad.push(`${f}: includes demo-dimensions.js before dimensions.js (the registry must exist when it runs)`)
        for (const [id, only] of Object.entries(follows)) {
          if (!dims[id]) {
            bad.push(`${f}: follows "${id}", which dimensions.js does not register`)
            continue
          }
          if (only === null) continue
          for (const v of only) if (!dims[id].values.includes(v)) bad.push(`${f}: is drawn in ${id} "${v}", which is not one of its values`)
          // Any value the page is not drawn in shows as the fallback, so the page has to be drawn in that one
          const fb = dims[id].fallback ?? dims[id].default
          if (!only.includes(fb)) bad.push(`${f}: is drawn in ${id} ${only.join(', ')} but not in its fallback "${fb}"`)
        }
        if (Object.keys(follows).length === 0 && !sets) bad.push(`${f}: includes demo-dimensions.js but neither follows a dimension (data-follow) nor sets them`)
      }
      // A second page that sets a dimension is a second switch for it, and the reader no longer knows where
      // the value they see was chosen
      if (setters.length > 1) bad.push(`dimensions are set on ${setters.length} pages (${setters.join(', ')}); only the settings prototype sets them`)
      return bad
    }
  },
  {
    // A page that follows the mode or the theme draws the tokens from the shared sheet, and takes
    // light or dark from the settings prototype alone: a prefers-color-scheme rule left on the page, or in a
    // shared stylesheet it links, flips that part with the reader's system instead, so the page shows two
    // modes at once whenever the system and the settings prototype disagree
    name: 'pages that follow the mode or theme take the app tokens from _shared/theme.css and never the system appearance',
    check() {
      const bad = []
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        const code = stripComments(src)
        const { follows } = pageDimensions(code)
        if (!('mode' in follows) && !('theme' in follows)) continue
        // The path without any query string: pages cache-bust a sheet with ?v=…, and the file is the same one
        const links = [...code.matchAll(/<link\b[^>]*\bhref="([^"?]+\.css)(?:\?[^"]*)?"/g)].map((m) => m[1])
        if (!links.some((h) => h.endsWith('_shared/theme.css'))) bad.push(`${f}: follows the mode or theme but does not link _shared/theme.css`)
        if (!('mode' in follows)) continue
        if (code.includes('prefers-color-scheme')) bad.push(`${f}: follows the mode but still styles by prefers-color-scheme`)
        for (const h of links) {
          const css = read(join(dirname(f), h))
          if (css !== null && stripCssComments(css).includes('prefers-color-scheme')) {
            bad.push(`${f}: follows the mode but links ${h}, which styles by prefers-color-scheme`)
          }
        }
      }
      return bad
    }
  },
  {
    // The app draws one rail on every screen; the prototypes used to draw one each, and they drifted — items
    // that linked on one page and were dead on the next, Settings missing everywhere but the settings page.
    // So a rail on a prototype page is the shared block's mount and nothing else, and the mount's wiring is
    // checked here: what it names exists, and what it needs is loaded before it draws
    name: 'prototype pages draw the shared app rail, never their own',
    check() {
      const bad = []
      let routes
      try {
        const sandbox = { window: {} }
        vm.runInNewContext(read('docs/prototypes/manifest.js') ?? '', sandbox)
        routes = new Set((sandbox.window.PROTOTYPES ?? []).map((p) => `${p.module}/${p.id}`))
      } catch (e) {
        return [`docs/prototypes/manifest.js does not evaluate: ${e.message}`]
      }
      // The rail's items are its own list in app-rail.js (RAIL_ITEMS)
      const ITEMS = RAIL_ITEMS
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        const code = stripComments(src)
        const doc = new JSDOM(src).window.document
        const rails = [...doc.querySelectorAll('.rail')]
        for (const r of rails) {
          if (r.getAttribute('data-shared-block') !== 'app-rail') bad.push(`${f}: draws its own .rail — mount the shared one (data-shared-block="app-rail")`)
        }
        // A page's own rules for the rail would override the shared ones on that page alone
        for (const s of [...doc.styleSheets]) {
          for (const r of [...s.cssRules]) {
            if (r.selectorText && r.selectorText.split(',').some((sel) => /(^|\s)\.rail(\s|$|\.|:)/.test(sel.trim()))) {
              bad.push(`${f}: styles the rail itself (${r.selectorText}) — the shared app-rail.css owns it`)
            }
          }
        }
        const mount = rails.find((r) => r.getAttribute('data-shared-block') === 'app-rail')
        if (!mount) continue
        const current = mount.getAttribute('data-rail-current')
        if (!ITEMS.includes(current)) bad.push(`${f}: data-rail-current="${current}" is not one of ${ITEMS.join(', ')}`)
        for (const item of ITEMS) {
          const route = mount.getAttribute(`data-rail-${item}`)
          if (route !== null && !routes.has(route)) bad.push(`${f}: data-rail-${item}="${route}" is not in manifest.js`)
        }
        // The rail draws as its script runs, from the manifest and the icons
        const at = (re) => code.search(re)
        const script = at(/<script src="[^"]*_shared\/app-rail\.js"/)
        const mountAt = at(/data-shared-block="app-rail"/)
        if (script < mountAt) bad.push(`${f}: includes app-rail.js before the rail it draws`)
        for (const [name, re] of [['manifest.js', /<script src="\.\.\/manifest\.js"/], ['_shared/icons.js', /<script src="[^"]*_shared\/icons\.js"/]]) {
          const i = at(re)
          if (i < 0 || i > script) bad.push(`${f}: needs ${name} included before app-rail.js`)
        }
      }
      return bad
    }
  },
  {
    // Every prototype tab, the gallery's included, carries the app's name and icon (prototype skill, general
    // rule 11): a tab with only the page's own title and the browser's default icon cannot be told apart from
    // another project's prototypes. A browser cannot show the installer's .icns, and a path that has moved
    // shows the default icon without any error, so both are checked here; a page that skips the script, or
    // includes it before the registry it reads, just shows a bare tab
    name: 'every prototype tab names its app (manifest.js PROTOTYPE_APP + app-identity.js)',
    check() {
      let app
      try {
        const sandbox = { window: {} }
        vm.runInNewContext(read('docs/prototypes/manifest.js') ?? '', sandbox)
        app = sandbox.window.PROTOTYPE_APP
      } catch (e) {
        return [`docs/prototypes/manifest.js does not evaluate: ${e.message}`]
      }
      if (!app || typeof app.name !== 'string' || app.name.trim() === '') return ['manifest.js: window.PROTOTYPE_APP = { name, icon } is missing or has no name']
      const bad = []
      if (typeof app.icon === 'string') {
        if (!/\.(png|svg|ico)$/i.test(app.icon)) bad.push(`manifest.js: PROTOTYPE_APP.icon "${app.icon}" is not a format a browser shows (png, svg, ico)`)
        if (!existsSync(join(ROOT, 'docs/prototypes', app.icon))) bad.push(`manifest.js: PROTOTYPE_APP.icon "${app.icon}" does not exist (relative to docs/prototypes/)`)
      } else if (app.icon !== null) bad.push('manifest.js: PROTOTYPE_APP.icon must be a path or null')
      for (const f of prototypeHtmls(true)) {
        // Without comments: a commented-out script tag, icon link or title is not on the page
        const html = stripComments(read(f))
        const head = html.slice(0, html.search(/<\/head>/i) >>> 0)
        const up = '../'.repeat(f.split('/').length - 3)
        const at = (name) => head.search(new RegExp(`<script\\s+src="${up.replace(/\./g, '\\.')}${name.replace('.', '\\.')}"`))
        const registry = at('manifest.js'), identity = at('app-identity.js')
        if (identity < 0) bad.push(`${f}: does not include ${up}app-identity.js in <head>`)
        else if (registry < 0 || registry > identity) bad.push(`${f}: includes app-identity.js without ${up}manifest.js before it in <head>`)
        if (/<link[^>]+rel="(?:shortcut )?icon"/i.test(html)) bad.push(`${f}: sets its own tab icon (app-identity.js sets it)`)
        const title = (head.match(/<title>([^<]*)<\/title>/i) || [])[1] || ''
        if (title.includes(app.name)) bad.push(`${f}: <title> already carries the app name "${app.name}" (app-identity.js adds it)`)
      }
      return bad
    }
  },
  {
    // The app has one project column; the prototypes used to draw it four ways (three widths, a selection
    // ring the app had dropped, rows with and without the side count). A column on a prototype page is the
    // shared block's mount and nothing else, and what the mount names has to exist
    name: 'prototype pages draw the shared project column, never their own',
    check() {
      const bad = []
      const script = read('docs/prototypes/_shared/project-side.js')
      if (script === null) return ['cannot read docs/prototypes/_shared/project-side.js']
      // The mock projects, read with the TypeScript parser: { name, route? } of each PROJECTS entry
      const projects = []
      const sf = ts.createSourceFile('project-side.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
      const visit = (node) => {
        if (ts.isVariableDeclaration(node) && node.name.getText(sf) === 'PROJECTS' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
          for (const el of node.initializer.elements) {
            if (!ts.isObjectLiteralExpression(el)) continue
            const prop = (k) => el.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === k)?.initializer
            const name = prop('name')
            const route = prop('route')
            projects.push({ name: name && ts.isStringLiteral(name) ? name.text : null, route: route && ts.isStringLiteral(route) ? route.text : null })
          }
          return
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
      if (projects.length === 0) return ['project-side.js: no PROJECTS list found — has it changed shape?']
      let routes
      try {
        const sandbox = { window: {} }
        vm.runInNewContext(read('docs/prototypes/manifest.js') ?? '', sandbox)
        routes = new Set((sandbox.window.PROTOTYPES ?? []).map((p) => `${p.module}/${p.id}`))
      } catch (e) {
        return [`docs/prototypes/manifest.js does not evaluate: ${e.message}`]
      }
      for (const p of projects) {
        if (p.route !== null && !routes.has(p.route)) bad.push(`project-side.js: ${p.name} opens "${p.route}", which is not in manifest.js`)
      }
      const names = new Set(projects.map((p) => p.name))
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        const code = stripComments(src)
        const doc = new JSDOM(src).window.document
        const columns = [...doc.querySelectorAll('.side')]
        for (const c of columns) {
          if (c.getAttribute('data-shared-block') !== 'project-side') bad.push(`${f}: draws its own .side — mount the shared one (data-shared-block="project-side")`)
        }
        for (const s of [...doc.styleSheets]) {
          for (const r of [...s.cssRules]) {
            if (r.selectorText && r.selectorText.split(',').some((sel) => /(^|\s)\.side(\s|$|\.|:|\[)/.test(sel.trim()))) {
              bad.push(`${f}: styles the project column itself (${r.selectorText}) — the shared project-side.css owns it`)
            }
          }
        }
        const mount = columns.find((c) => c.getAttribute('data-shared-block') === 'project-side')
        if (!mount) continue
        const selected = mount.getAttribute('data-side-selected')
        if (selected !== null && !names.has(selected)) bad.push(`${f}: data-side-selected="${selected}" is not one of project-side.js's projects`)
        const state = mount.getAttribute('data-side-state')
        if (state !== null && !['scanning', 'empty'].includes(state)) bad.push(`${f}: data-side-state="${state}" is not scanning or empty`)
        // The column draws as its script runs, from the manifest and the icons
        const at = (re) => code.search(re)
        const js = at(/<script src="[^"]*_shared\/project-side\.js"/)
        if (js < at(/data-shared-block="project-side"/)) bad.push(`${f}: includes project-side.js before the column it draws`)
        for (const [name, re] of [['manifest.js', /<script src="\.\.\/manifest\.js"/], ['_shared/icons.js', /<script src="[^"]*_shared\/icons\.js"/]]) {
          const i = at(re)
          if (i < 0 || i > js) bad.push(`${f}: needs ${name} included before project-side.js`)
        }
      }
      return bad
    }
  }
]

/** List every prototype HTML file (a new prototype is included automatically, with no script change); the
 * gallery and the Logic pages, all named index.html, only when asked for */
function prototypeHtmls(withIndex = false) {
  const base = join(ROOT, 'docs/prototypes')
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'vendor' || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.html') && (withIndex || e.name !== 'index.html')) out.push(p.slice(ROOT.length + 1))
    }
  }
  walk(base)
  return out
}

function checkBlock(block) {
  const problems = []
  const users = []

  // (1) A prototype page declaring the block: it must reference the resources and have the mount points. Read
  // without comments: a comment naming an asset, a declaration or a mount point is none of them
  for (const f of prototypeHtmls()) {
    const code = stripComments(read(f) ?? '')
    if (!code.includes(`data-shared-block="${block.id}"`)) {
      // The reverse check: referencing the resources without declaring → a missing declaration, leaving
      // consistency unverifiable
      if (block.assets.some((a) => code.includes(a))) {
        problems.push(`${f}: references ${block.id} assets without declaring data-shared-block="${block.id}"`)
      }
      continue
    }
    users.push(f)
    for (const a of block.assets) {
      if (!code.includes(a)) problems.push(`${f}: declares ${block.id} but does not reference ${a}`)
    }
    for (const c of block.containers) {
      if (!new RegExp(`id="[^"]*${c}[^"]*"`).test(code)) {
        problems.push(`${f}: declares ${block.id} but is missing the ${c} mount point`)
      }
    }
  }

  // (2) Style invariants, on the prototype side and the app side alike
  for (const inv of block.cssInvariants ?? []) {
    for (const f of inv.files) {
      const css = read(f)
      if (css === null) continue
      // Strip comments before matching: a comment mentioning a forbidden declaration (such as "must not
      // use overflow:hidden — …") is not a violation
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const blocks = stripped.match(new RegExp(`\\${inv.selector}\\s*\\{[^}]*\\}`, 'g')) ?? []
      if (blocks.some((b) => inv.forbid.test(b))) {
        problems.push(`${f}: ${inv.selector} violates an invariant (${inv.why})`)
      }
    }
  }

  // (3) Every use site of the app-side component
  if (block.appComponent) {
    const { name, requiredProps } = block.appComponent
    for (const f of appSources()) {
      const src = read(f) ?? ''
      const uses = src.match(new RegExp(`<${name}[^/]*/>`, 'gs')) ?? []
      for (const u of uses) {
        for (const p of requiredProps) {
          if (!u.includes(p)) problems.push(`${f}: <${name}> is missing ${p}`)
        }
      }
    }
  }
  return { problems, users }
}

/** Every tsx on the app side, subdirectories included (a new use site is included automatically, with no script change) */
function appSources() {
  if (!existsSync(join(ROOT, 'src/renderer/src'))) return []
  return rendererSources().filter((f) => f.endsWith('.tsx'))
}

let failed = 0
for (const block of SHARED_BLOCKS) {
  const { problems, users } = checkBlock(block)
  if (problems.length) {
    failed += problems.length
    console.error(`✗ shared block ${block.id}`)
    for (const p of problems) console.error(`    ${p}`)
  } else {
    console.log(`✓ shared block ${block.id} — all ${users.length} usage site(s) compliant`)
  }
}
for (const r of GLOBAL_RULES) {
  const problems = r.check()
  if (problems.length) {
    failed += problems.length
    console.error(`✗ ${r.name}`)
    for (const p of problems) console.error(`    ${p}`)
  } else {
    console.log(`✓ ${r.name}`)
  }
}
if (failed) {
  console.error(`\nShared-UI check failed: ${failed} problem(s). Each one means something that should have been updated wasn't.`)
  process.exit(1)
}
console.log('\nShared-UI consistency check passed')
