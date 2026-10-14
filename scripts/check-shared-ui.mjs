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
// Adding a kind of shared block = one more entry in SHARED_BLOCKS; adding a use site = the declaration
// attribute on the page.
// Neither requires changing this script's logic.
//
// ── Check tiers (aligned with the "prototype first, implement after confirmation" workflow) ──
//   Default: check **prototype-side** rules only. While a finished prototype awaits the user's
//   confirmation, the real code not having caught up is the expected state,
//         and reporting "the prototype and the app disagree" then is noise — a gate that stays red long
//         enough gets ignored (broken windows).
//   --cross: also check **prototype ↔ real code consistency** (the app side of the CSS invariants, and
//         components' required props).
//         Run after implementation lands; this is also the tier pnpm verify runs.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import { parseIcons, render as renderIcons } from '../docs/prototypes/sync-icons.mjs'
import { parseTheme, render as renderTheme } from '../docs/prototypes/sync-theme.mjs'
import { generate as generateProjectSide } from '../docs/prototypes/sync-project-side.mjs'
import { generate as generateStartupSkeleton } from '../docs/prototypes/sync-startup-skeleton.mjs'
import { blocks, declarations } from '../docs/prototypes/css-blocks.mjs'


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

/** The shared block registry: each entry describes one reusable visual block and its contract */
const SHARED_BLOCKS = [
  {
    id: 'startup-status',
    label: 'startup restoration scanning hint',
    assets: ['_shared/startup-status.css', '_shared/startup-status.js'],
    containers: []
  },
  {
    id: 'trend-chart',
    label: 'provider stacked trend chart',
    /** Resources a page declaring it must reference */
    assets: ['_shared/trend-chart.css', '_shared/trend-chart.js'],
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
  },
  {
    id: 'app-rail',
    label: 'app navigation rail',
    assets: ['_shared/app-rail.css', '_shared/app-rail.js'],
    containers: []
  },
  {
    id: 'project-side',
    label: 'project column',
    assets: ['_shared/project-side.css', '_shared/project-side.js'],
    containers: []
  }
]

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
/** The three themes' selectors in theme.css (the light and dark blocks share one set of
 * selectors) */
const THEME_SELECTORS = {
  purple: ':root',
  blue: "html[data-theme='blue']",
  amber: "html[data-theme='amber']"
}

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
// own. The registry docs/prototypes/dimensions.js copies the product's value lists by hand (a standalone
// HTML file cannot import them); these rules are what goes red when the wiring or the copy drifts.

/** Where each registered dimension's value list lives in the product. `without` drops the preference
 * values that are policies rather than something rendered: the registry lists what a page renders.
 * `fallback` names the constant the registry's fallback must equal, when the product has one */
const DIMENSION_SOURCES = {
  language: { file: 'src/shared/i18n/index.ts', name: 'LANGUAGES', fallback: 'FALLBACK_LANGUAGE' },
  mode: { file: 'src/shared/appearance.ts', name: 'APPEARANCE_MODES', without: ['system'] },
  theme: { file: 'src/shared/appearance.ts', name: 'APPEARANCE_THEMES' }
}

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

/** A page's code with comments removed: comments may describe the wiring, only markup and code count */
const stripComments = (src) =>
  src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Evaluate the registry the way a page does: a script that assigns window.DEMO_DIMENSIONS */
function loadDimensions() {
  const src = read('docs/prototypes/dimensions.js')
  if (src === null) return null
  const sandbox = { window: {} }
  vm.runInNewContext(src, sandbox, { filename: 'docs/prototypes/dimensions.js' })
  return sandbox.window.DEMO_DIMENSIONS ?? null
}

/** The strings of `const <name> = [...] as const` in a TypeScript file, read with the TypeScript parser */
function constStringList(file, name) {
  const text = read(file)
  if (text === null) return null
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let found = null
  const visit = (node) => {
    if (found) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let init = node.initializer
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression
      }
      if (ts.isArrayLiteralExpression(init) && init.elements.every(ts.isStringLiteral)) {
        found = init.elements.map((e) => e.text)
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/** The string of `const <name>: T = '…'` in a TypeScript file, read with the TypeScript parser */
function constString(file, name) {
  const text = read(file)
  if (text === null) return null
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let found = null
  const visit = (node) => {
    if (found !== null) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) found = node.initializer.text
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/** Global rules: constraints independent of any particular block */
const GLOBAL_RULES = [
  {
    // A ticket lives in a tracker, gets closed and cleaned up; a spec is written before its tickets
    // exist and outlives them, so a ticket number in a persistent document is a pointer guaranteed
    // to dangle — the reader who follows it finds nothing. Provenance that must survive goes in as
    // a date or an ADR number. Source comments are deliberately out of scope: there a ticket number
    // is construction context that lives and dies with the code it annotates.
    name: 'persistent documents must not reference ticket numbers (they outlive the tickets)',
    check() {
      const bad = []
      const files = ['CONTEXT.md', 'README.md', 'package.json']
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
      for (const d of ['docs/specs', 'docs/adr', 'docs/features', 'docs/postmortems', 'docs/prototypes']) walk(d)
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
    // "Any entry point can reach the other five" is a **decidable property**, so it is baked into a
    // gate rather than left to the eye (the user's ruling, 2026-08-09). What it prevents: missing a link in the other files when adding a
    // language or renaming one —
    // nothing else would flag that kind of omission, and a reader only discovers it by clicking a dead
    // link.
    name: 'READMEs in six languages reach each other (any entry point leads to the other five)',
    check() {
      const bad = []
      const FILES = ['README.md', 'README.en.md', 'README.fr.md', 'README.es.md', 'README.ru.md', 'README.ja.md']
      for (const f of FILES) {
        const src = read(f)
        if (src === null) {
          bad.push(`missing ${f}`)
          continue
        }
        const linked = new Set([...src.matchAll(/\]\((README[^)]*\.md)\)/g)].map((m) => m[1]))
        for (const other of FILES) {
          if (other !== f && !linked.has(other)) bad.push(`${f}: no link to ${other}`)
        }
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
    cross: true,
    check() {
      const bad = []
      const cssRaw = read('src/renderer/src/theme.css')
      const tsx = read('src/renderer/src/SettingsPane.tsx')
      // Being unable to read the file is itself the problem: silently skipping would make this rule
      // switch itself off the moment a file is renamed
      if (cssRaw === null) return ['cannot read src/renderer/src/theme.css']
      if (tsx === null) return ['cannot read src/renderer/src/SettingsPane.tsx']
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
    // an exhaustive set — the side set grows, and an enumerated sentence becomes a lie in six
    // languages at once on a surface no onboarding diff touches (it happened twice in one round).
    // Copy whose surface genuinely judges only some sides today is allow-listed by dictionary key,
    // each entry carrying the reason and the ticket that retires it.
    name: 'dictionary copy must not enumerate agent sides as an exhaustive set (CONTEXT invariant)',
    cross: true,
    check() {
      const bad = []
      const SIDE_NAMES = [/Claude(?: Code)?/, /Codex/, /Grok/]
      // Side-COUNT words are the same rot family stated as a number ("both sides" lies the moment a
      // third arrives); one occurrence flags, unlike names which need two to look like a set
      const SIDE_COUNT_WORDS =
        /两侧|both sides|both global|two sides|両サイド|どちらかの agent|ambos lados|ambas bibliotecas|los dos agents|les deux (?:côtés|bibliothèques|agents)|un des deux agents|обе стороны|обеих сторон|обе глобальные/i
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
      for (const lang of ['zh', 'en', 'fr', 'es', 'ru', 'ja']) {
        const f = `src/shared/i18n/${lang}.ts`
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
    cross: true,
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
          key: 'settings',
          why: 'an ordinary noun in every language (and part of an external product\'s menu path in the Codex memory hint); retires if the entry is renamed to something distinctive'
        }
      ]
      for (const lang of ['zh', 'en', 'fr', 'es', 'ru', 'ja']) {
        const f = `src/shared/i18n/${lang}.ts`
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
    name: 'provider brand colours must not be hard-coded in components (use CSS variables)',
    cross: true,
    check() {
      const bad = []
      const BRAND = ['#d97757', '#10a37f', '#4285f4']
      for (const f of ['src/renderer/src/TokenViz.tsx', 'src/renderer/src/DetailPane.tsx', 'src/renderer/src/AgentsPane.tsx']) {
        const src = (read(f) ?? '').toLowerCase()
        for (const c of BRAND) if (src.includes(c)) bad.push(`${f}: hard-coded ${c}`)
      }
      return bad
    }
  },
  {
    // appearance C3: components bind only to tokens; the settings page's swatches deliberately show each
    // theme's sample colours, so they are excluded.
    name: 'components must not hard-code theme accent colours (use the --accent family)',
    cross: true,
    check() {
      const bad = []
      const THEME = ['#8a67ab', '#a084c7', '#4a6fa5', '#3a5a88', '#6b5220', '#c4a46a']
      const dir = join(ROOT, 'src/renderer/src')
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue
        if (name === 'SettingsPane.tsx') continue
        const f = `src/renderer/src/${name}`
        const src = (read(f) ?? '').toLowerCase()
        for (const c of THEME) if (src.includes(c)) bad.push(`${f}: hard-coded theme colour ${c}`)
      }
      return bad
    }
  },
  {
    // The side chips' single source (spec project-detail S3): every chip surface looks its label up in
    // SIDE_CHIP_LABEL and maps over SIDE_ORDER, which is what lets a new side appear by construction.
    // A re-hardcoded label would compile and render happily and nothing else would notice — this rule
    // makes the convention mechanical. Exclusion: side-badge.ts is the Record's own definition, the one
    // legal spelling site; it retires only if the chip labels ever move out of that module.
    name: 'side chip labels have one source: no hardcoded CLAUDE CODE / CODEX / GROK literal outside side-badge.ts',
    cross: true,
    check() {
      const bad = []
      const CHIP = /['"`>](CLAUDE CODE|CODEX|GROK)['"`<]/
      const dir = join(ROOT, 'src/renderer/src')
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue
        if (name === 'side-badge.ts' || name.includes('.test.')) continue
        const m = (read(`src/renderer/src/${name}`) ?? '').match(CHIP)
        if (m) bad.push(`src/renderer/src/${name}: hardcoded chip label ${m[1]} — look it up in SIDE_CHIP_LABEL`)
      }
      return bad
    }
  },
  {
    // Ticket 112: the prototypes drew emoji for weeks after the product had moved to inline SVG, and
    // nothing reported it. The fix was to make _shared/icons.js a **derived** file rather than a second
    // hand-kept list — this rule is the other half, catching the case where someone edits the icon module
    // and does not re-run the generator. Without it "derived" would only mean "derived at some point".
    //
    // Note what makes this checkable where ticket 105's proposal was not: it compares **generated text
    // against its own generator's output** — a structural property. That ticket wanted to compare two
    // hand-written implementations for equivalent *logic*, which no static check can decide.
    name: 'docs/prototypes/_shared/icons.js is in sync with the renderer icon module',
    cross: true,
    check() {
      const src = read('src/renderer/src/icons.tsx')
      const generated = read('docs/prototypes/_shared/icons.js')
      if (src === null) return ['cannot read src/renderer/src/icons.tsx']
      if (generated === null) return ['docs/prototypes/_shared/icons.js is missing — run node docs/prototypes/sync-icons.mjs']
      let want
      try {
        want = renderIcons(parseIcons(src))
      } catch (e) {
        return [`cannot parse the icon module: ${e.message}`]
      }
      if (want !== generated) {
        return ['out of date — run `node docs/prototypes/sync-icons.mjs` (the prototypes would keep drawing the previous icons)']
      }
      return []
    }
  },
  {
    name: 'every chart container in a prototype must declare its shared block (otherwise consistency cannot be checked)',
    check() {
      const bad = []
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        const charts = (src.match(/class="[^"]*\bchart\b[^"]*"/g) ?? []).length
        if (charts === 0) continue
        const declared = (src.match(/data-shared-block="[^"]+"/g) ?? []).length
        if (declared < charts) {
          bad.push(`${f}: ${charts} chart container(s) but only ${declared} declare data-shared-block`)
        }
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
    name: "demo dimensions list the product's values in the product's order",
    cross: true,
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
        const source = DIMENSION_SOURCES[id]
        if (!source) {
          bad.push(`dimensions.js: "${id}" has no product source in DIMENSION_SOURCES (scripts/check-shared-ui.mjs)`)
          continue
        }
        const list = constStringList(source.file, source.name)
        if (list === null) {
          bad.push(`cannot read the string list ${source.name} from ${source.file}`)
          continue
        }
        const without = source.without ?? []
        const want = list.filter((v) => !without.includes(v))
        const got = d.values ?? []
        if (got.join(',') !== want.join(',')) {
          const less = without.length > 0 ? ` less ${without.join(', ')}` : ''
          bad.push(`dimensions.js: ${id} lists [${got.join(', ')}] but ${source.name}${less} is [${want.join(', ')}]`)
        }
        if (source.fallback) {
          const fb = constString(source.file, source.fallback)
          if (fb === null) bad.push(`cannot read the string ${source.fallback} from ${source.file}`)
          else if (d.fallback !== fb) bad.push(`dimensions.js: ${id}'s fallback is "${d.fallback}" but ${source.fallback} is "${fb}"`)
        }
      }
      return bad
    }
  },
  {
    // A page that follows the mode or the theme draws the app's tokens from the generated sheet, and takes
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
          if (css !== null && stripComments(css).includes('prefers-color-scheme')) {
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
      const ITEMS = ['agents', 'projects', 'settings']
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
    // The shared rail's rules are the app's, so the rail looks on every prototype page as it does in the app.
    // Both sides are read as text (css-blocks.mjs), not through jsdom's CSS parser, which silently drops
    // declarations it cannot parse and would leave them out of the comparison on both sides at once
    name: "the shared app rail's styles are the app's .rail rules",
    cross: true,
    check() {
      const app = read('src/renderer/src/theme.css')
      const proto = read('docs/prototypes/_shared/app-rail.css')
      if (app === null || proto === null) return ['cannot read src/renderer/src/theme.css or docs/prototypes/_shared/app-rail.css']
      const SELECTORS = ['.rail', '.rail .ri', '.rail .ri:hover', '.rail .ri.on', '.rail-bottom']
      // Only the compared rules are cut into declarations: an at-rule's body holds rules, not declarations
      const rulesOf = (css) => {
        const out = new Map()
        for (const { prelude, body } of blocks(css)) {
          if (SELECTORS.includes(prelude)) {
            out.set(prelude, new Map(declarations(body).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()])))
          }
        }
        return out
      }
      let a, p
      try {
        a = rulesOf(app)
        p = rulesOf(proto)
      } catch (e) {
        return [`cannot cut theme.css or app-rail.css into rules: ${e.message}`]
      }
      const bad = []
      for (const sel of SELECTORS) {
        const want = a.get(sel)
        const got = p.get(sel)
        if (!want) { bad.push(`theme.css: no ${sel} rule`); continue }
        if (!got) { bad.push(`app-rail.css: no ${sel} rule`); continue }
        for (const [prop, w] of want) {
          const g = got.get(prop)
          if (w !== g) bad.push(`app-rail.css ${sel} { ${prop}: ${g ?? '(missing)'} } but theme.css ${sel} has ${w}`)
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
        const html = read(f)
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
              bad.push(`${f}: styles the project column itself (${r.selectorText}) — the generated project-side.css owns it`)
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
  },
  {
    // The derived-file half of sync-project-side.mjs
    name: 'docs/prototypes/_shared/project-side.css is in sync with the app project column',
    cross: true,
    check() {
      const src = read('src/renderer/src/theme.css')
      const generated = read('docs/prototypes/_shared/project-side.css')
      if (src === null) return ['cannot read src/renderer/src/theme.css']
      if (generated === null) return ['docs/prototypes/_shared/project-side.css is missing — run node docs/prototypes/sync-project-side.mjs']
      let want
      try {
        want = generateProjectSide(src)
      } catch (e) {
        return [`cannot read the app's project column: ${e.message}`]
      }
      return want === generated ? [] : ['out of date — run `node docs/prototypes/sync-project-side.mjs` (the prototypes would keep the previous column)']
    }
  },
  {
    // The derived-file half of sync-startup-skeleton.mjs
    name: 'docs/prototypes/_shared/startup-skeleton.css is in sync with the app startup skeleton',
    cross: true,
    check() {
      const src = read('src/renderer/src/theme.css')
      const generated = read('docs/prototypes/_shared/startup-skeleton.css')
      if (src === null) return ['cannot read src/renderer/src/theme.css']
      if (generated === null) return ['docs/prototypes/_shared/startup-skeleton.css is missing — run node docs/prototypes/sync-startup-skeleton.mjs']
      let want
      try {
        want = generateStartupSkeleton(src)
      } catch (e) {
        return [`cannot read the app's startup skeleton: ${e.message}`]
      }
      return want === generated ? [] : ['out of date — run `node docs/prototypes/sync-startup-skeleton.mjs` (the Agents skeleton would keep the previous placeholders)']
    }
  },
  {
    // The derived-file half of sync-theme.mjs, as the icons rule is for sync-icons.mjs
    name: 'docs/prototypes/_shared/theme.css is in sync with the app theme tokens',
    cross: true,
    check() {
      const src = read('src/renderer/src/theme.css')
      const generated = read('docs/prototypes/_shared/theme.css')
      if (src === null) return ['cannot read src/renderer/src/theme.css']
      if (generated === null) return ['docs/prototypes/_shared/theme.css is missing — run node docs/prototypes/sync-theme.mjs']
      let want
      try {
        want = renderTheme(parseTheme(src))
      } catch (e) {
        return [`cannot parse the app theme: ${e.message}`]
      }
      if (want !== generated) {
        return ['out of date — run `node docs/prototypes/sync-theme.mjs` (the prototypes would keep the previous colours)']
      }
      return []
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

function checkBlock(block, withCross) {
  const problems = []
  const users = []

  // (1) A prototype page declaring the block: it must reference the resources and have the mount points
  for (const f of prototypeHtmls()) {
    const src = read(f) ?? ''
    if (!src.includes(`data-shared-block="${block.id}"`)) {
      // The reverse check: referencing the resources without declaring → a missing declaration, leaving
      // consistency unverifiable
      if (block.assets.some((a) => src.includes(a))) {
        problems.push(`${f}: references ${block.id} assets without declaring data-shared-block="${block.id}"`)
      }
      continue
    }
    users.push(f)
    for (const a of block.assets) {
      if (!src.includes(a)) problems.push(`${f}: declares ${block.id} but does not reference ${a}`)
    }
    for (const c of block.containers) {
      if (!new RegExp(`id="[^"]*${c}[^"]*"`).test(src)) {
        problems.push(`${f}: declares ${block.id} but is missing the ${c} mount point`)
      }
    }
  }

  // (2) Style invariants (files on the app side belong to the cross-side tier)
  for (const inv of block.cssInvariants ?? []) {
    for (const f of inv.files) {
      if (!withCross && !f.startsWith('docs/prototypes/')) continue
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

  // (3) Every use site of the app-side component (the cross-side tier)
  if (withCross && block.appComponent) {
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

/** Every tsx on the app side (a new use site is included automatically, with no script change) */
function appSources() {
  const base = join(ROOT, 'src/renderer/src')
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((n) => n.endsWith('.tsx'))
    .map((n) => join('src/renderer/src', n))
}

const withCross = process.argv.includes('--cross')
console.log(
  withCross
    ? 'mode: prototypes + cross-side consistency'
    : 'mode: prototypes only (pass --cross for the cross-side checks, once the implementation has landed)'
)

let failed = 0
for (const block of SHARED_BLOCKS) {
  const { problems, users } = checkBlock(block, withCross)
  if (problems.length) {
    failed += problems.length
    console.error(`✗ shared block ${block.id} (${block.label})`)
    for (const p of problems) console.error(`    ${p}`)
  } else {
    console.log(`✓ shared block ${block.id} (${block.label}) — all ${users.length} usage site(s) compliant`)
  }
}
for (const r of GLOBAL_RULES) {
  if (r.cross && !withCross) continue
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
