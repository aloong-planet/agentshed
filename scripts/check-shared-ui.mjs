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
import { parseIcons, render as renderIcons } from '../docs/prototypes/sync-icons.mjs'


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

/** The shared block registry: each entry describes one reusable visual block and its contract */
const SHARED_BLOCKS = [
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
    // ADR-0021: one colour per agent side, and the value inevitably exists in more than one file —
    // theme.css's --p-* variables (the source) and the project-list prototype's hard-coded .dot
    // swatches (a standalone HTML file cannot read the app's variables). This is the executable
    // assertion ADR-0021's consequences called for: the copies cannot drift apart silently.
    name: 'side colours have one source: the prototype dot swatches match theme.css --p-* letter for letter (ADR-0021)',
    cross: true,
    check() {
      const bad = []
      const css = read('src/renderer/src/theme.css')
      const proto = read('docs/prototypes/project-list/prototype-list.html')
      if (css === null) return ['cannot read src/renderer/src/theme.css']
      if (proto === null) return ['cannot read docs/prototypes/project-list/prototype-list.html']
      const SIDES = [
        ['claude', 'p-anthropic', 'c'],
        ['codex', 'p-openai', 'x'],
        ['grok', 'p-xai', 'g']
      ]
      const cssParts = splitByColorScheme(stripCssComments(css))
      const protoParts = splitByColorScheme(stripCssComments(proto))
      for (const [mode, cssPart, protoPart] of [
        ['light', cssParts.light, protoParts.light],
        ['dark', cssParts.dark, protoParts.dark]
      ]) {
        for (const [side, varName, dotClass] of SIDES) {
          const want = cssPart.match(new RegExp(`--${varName}:\\s*([^;]+);`))?.[1].trim().toLowerCase()
          const got = protoPart
            .match(new RegExp(`\\.dot\\.${dotClass}\\s*\\{\\s*background:\\s*([^};]+)`))?.[1]
            .trim()
            .toLowerCase()
          if (!want) {
            bad.push(`theme.css: --${varName} not found in the ${mode} block`)
            continue
          }
          if (!got) {
            bad.push(`prototype-list.html: .dot.${dotClass} not found in the ${mode} block`)
            continue
          }
          if (want !== got) {
            bad.push(`${side} (${mode}): theme.css --${varName}=${want} ≠ prototype .dot.${dotClass}=${got}`)
          }
        }
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
  }
]

/** List every prototype HTML file (a new prototype is included automatically, with no script change) */
function prototypeHtmls() {
  const base = join(ROOT, 'docs/prototypes')
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'vendor' || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.html') && e.name !== 'index.html') out.push(p.slice(ROOT.length + 1))
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
