#!/usr/bin/env node
// The working-language gate (ADR-0017): the repository's working language is English, so Chinese must not
// appear anywhere except where a stated rule permits it. Hooked into pnpm verify.
//
// ── Why this gate exists, and what it is NOT ──
// The sibling gate scripts/check-i18n.mjs is a **copy** gate: it catches UI copy that never made it into
// the dictionaries. This one is a **working-language** gate: it catches Chinese anywhere at all. They do
// not overlap, and a piece of Chinese caught here is usually not copy but a comment, a fixture or residue.
//
// It was added after the English conversion produced two classes of defect that **no behavioural test
// could catch**, both of which leave Chinese behind:
//
//   1. **Blanket replace splatter.** A global string replace does not know context, so replacing a fixture
//      value also hit a comment mentioning it, and a short substring hit inside a longer string. That
//      leaves mixed strings such as 'Index应当只有数字与 null' or 'first one提问'. The fixture and its
//      paired assertion break **together**, so the behaviour stays correct and every test stays green.
//   2. **Holes in a hand-picked search scope.** "Everything is converted" was claimed three times and was
//      wrong three times, because the search used globs (`src/**`, `*.ts`) that silently excluded CSS,
//      .cjs/.yml/.json, and a whole directory. This gate reads `git ls-files` and offers nothing to pick.
//
// ── Exemptions are rules, never counts ──
// Each entry below carries a **predicate**: what *shape* of Chinese is permitted in those files. It must
// never carry a permitted line count.
//
// A count was tried first, and it is a trap. It records what happens to be true today rather than why it is
// allowed, so in any file that grows — the source dictionary gains a line for every new piece of UI copy —
// it fires on every legitimate change. Measured over 40 commits: the count for zh.ts moved 10 times and the
// one for ja.ts 11 times. A gate that fires on every legitimate change teaches exactly one reflex, "bump
// the number", and that reflex is the rubber stamp the count was introduced to prevent — the mechanism
// decays into the thing it was built to stop. A count is blind to substitution as well: delete one
// permitted line, add one forbidden line, and the total never moves.
//
// A predicate has neither problem. `zh.ts` can gain fifty new Chinese values without this gate stirring,
// while a single Chinese *comment* goes red, because the rule is about shape and not quantity.
//
// Writing one is also a design check on the exemption itself. When no predicate can be written, the
// boundary of the exemption is not yet understood — and reaching for a number at that moment papers over
// precisely the thing that needs thinking about.
//
// ── What it cannot do ──
// It cannot judge whether the English is *correct* — no gate can. It only guarantees that unapproved
// Chinese cannot enter the repository.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import ts from 'typescript'

// Ideographs, CJK punctuation and fullwidth forms. The punctuation range was added after a real miss: the
// fork banner hard-coded Chinese book-title marks in a component, so all six UIs rendered one — including
// Japanese, whose own dictionary already quoted the same title with `『』` — and the gate stayed green
// throughout, because U+300A sits below the ideograph range.
const CJK = /[一-鿿　-〿＀-￯]/
const CJK_G = new RegExp(CJK.source, 'g')
const BINARY = /\.(png|ico|icns|jpg|jpeg|gif|webp|woff2?|ttf|zip|pdf)$/i

/** The language names written in their own script. ADR-0013 fixes the language set, so this is closed */
const LANGUAGE_NAMES = ['简体中文', '日本語']

const SCRIPT_KIND = {
  ts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS
}

/**
 * The character ranges that are string, template or regex literals, or JSX text.
 *
 * Parsed with the TypeScript compiler rather than matched with a regular expression: quoting is genuinely
 * hard (escapes, nested template substitutions, telling a regex-opening `/` from a division), and there is
 * a parser right here that already knows all of it. Returns null for file types it cannot parse, and the
 * caller then judges by quoting alone.
 */
function literalRanges(text, file) {
  const kind = SCRIPT_KIND[file.split('.').pop()]
  if (!kind) return null
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const ranges = []
  const visit = (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isRegularExpressionLiteral(node) ||
      ts.isJsxText(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      ranges.push([node.getStart(sf), node.getEnd()])
    }
    node.forEachChild(visit)
  }
  sf.forEachChild(visit)
  return ranges
}

/** Ranges inside a quoting span on one line — the shape prose uses to cite a foreign string */
const QUOTE_PAIRS = [
  ['`', '`'],
  ["'", "'"],
  ['"', '"'],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
  ['「', '」']
]
function quotedRanges(line) {
  const ranges = []
  for (const [open, close] of QUOTE_PAIRS) {
    let i = 0
    while (i < line.length) {
      const a = line.indexOf(open, i)
      if (a < 0) break
      const b = line.indexOf(close, a + 1)
      if (b < 0) break
      ranges.push([a + 1, b])
      i = b + 1
    }
  }
  return ranges
}
const within = (pos, ranges) => ranges.some(([a, b]) => pos >= a && pos < b)

// ── Predicates ───────────────────────────────────────────────────────────────────────────────────────
// Each takes the file and returns the offending [lineNumber, line] pairs. Empty means the file complies.

/**
 * Chinese may be **cited**, never **written**. It qualifies when it sits inside a string, template or
 * regex literal, or inside a quoting span in prose: `error.includes('不可读')` explaining a hazard is
 * citing, whereas a doc comment written in Chinese is writing, and that is what ADR-0017 forbids.
 *
 * This is also the rule for the source dictionary, and it is why the rule survives that file growing: the
 * values are literals, so new copy never disturbs the gate, while a Chinese comment goes red immediately.
 */
function citedOrLiteral(text, file) {
  const lits = literalRanges(text, file)
  const bad = []
  let offset = 0
  for (const [i, line] of text.split('\n').entries()) {
    if (CJK.test(line)) {
      const quotes = quotedRanges(line)
      CJK_G.lastIndex = 0
      let m
      while ((m = CJK_G.exec(line))) {
        if (!(lits !== null && within(offset + m.index, lits)) && !within(m.index, quotes)) {
          bad.push([i + 1, line])
          break
        }
      }
    }
    offset += line.length + 1
  }
  return bad
}

/**
 * A prototype is a mockup of a Chinese interface shown to a Chinese-reading reviewer, so both its content
 * and its annotations address that reader. The tooling living beside it is not a mockup and gets no
 * exemption — that is what keeps this a rule with teeth rather than a blanket pass on a directory.
 */
function mockupOnly(text, file) {
  if (/\.(html|mmd|css|js)$/.test(file)) return []
  return text
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => CJK.test(line))
}

/** The only Chinese permitted is a supported language's name, written in its own script */
function languageNameOnly(text) {
  const bad = []
  for (const [i, line] of text.split('\n').entries()) {
    if (!CJK.test(line)) continue
    let rest = line
    for (const n of LANGUAGE_NAMES) rest = rest.split(n).join('')
    if (CJK.test(rest)) bad.push([i + 1, line])
  }
  return bad
}

/**
 * This file is itself the localisation into a CJK-script language, so its prose is in that language.
 *
 * **This is the one rule here that can never go red, and that is the honest answer rather than an
 * oversight**: there is no shape to distinguish, because being written in Chinese is the entire purpose of
 * `README.md`. Its safety therefore comes from the match, not from the predicate — two exact filenames, no
 * pattern and no directory — so it cannot quietly widen the way a glob would. A rule that permits
 * everything is worth writing only when the match is that narrow; anywhere else, the inability to write a
 * predicate means the boundary of the exemption has not been worked out yet.
 */
function ownLocalisation() {
  return []
}

/**
 * The exemptions.
 *
 * Each must be able to answer "would the gate go red without it". One that matches no file can no longer go
 * red, so it is dead weight and is reported as such.
 */
const RULES = [
  {
    match: (f) => f === 'src/shared/i18n/zh.ts' || f === 'src/shared/i18n/ja.ts',
    test: citedOrLiteral,
    why: 'the source-language and Japanese dictionaries — the values are the copy itself, while the comments are English like the rest of the repository'
  },
  {
    match: (f) =>
      f === 'e2e/app.spec.ts' ||
      f === 'src/shared/error-text.test.ts' ||
      f === 'src/shared/format.test.ts' ||
      f === 'src/shared/i18n/index.test.ts' ||
      f === 'src/shared/i18n/types.ts' ||
      f === 'src/renderer/src/subagent-error-label.test.ts' ||
      f === 'src/renderer/src/SubagentsView.tsx' ||
      f === 'scripts/check-lang.mjs',
    test: citedOrLiteral,
    why: 'code that asserts against, or explains, Chinese copy — the Chinese is the thing under test or the thing being quoted, never prose'
  },
  {
    match: (f) => f === 'docs/specs/i18n.md' || f.startsWith('docs/adr/'),
    test: citedOrLiteral,
    why: 'documents quoting Chinese values, patterns and superseded code as evidence'
  },
  {
    match: (f) => f.startsWith('docs/prototypes/'),
    test: mockupOnly,
    why: 'UI prototypes — the mockup shows a Chinese interface to a Chinese-reading reviewer; the tooling beside it gets no exemption'
  },
  {
    match: (f) => f === 'README.md' || f === 'README.ja.md',
    test: ownLocalisation,
    why: 'the Chinese and Japanese READMEs — a localisation is written in the language it localises into'
  },
  {
    match: (f) => /^README\.[a-z]{2}\.md$/.test(f) || f === 'docs/features/i18n.md',
    test: languageNameOnly,
    why: 'the language switcher rows and the selector list — a language is named in its own script'
  }
]

// `--others --exclude-standard` includes files that are new and not yet committed. Scanning only
// `git ls-files` would leave a new file unscanned until it is committed — and this gate itself fell into
// that hole: it passed locally while untracked, then flagged itself the moment CI saw it committed.
const tracked = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

const problems = []
const filesPerRule = new Map(RULES.map((r) => [r, 0]))
let permitted = 0

for (const file of tracked) {
  if (BINARY.test(file)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue // unreadable (a submodule pointer, say) — not this gate's business
  }
  if (!CJK.test(text)) continue

  const rule = RULES.find((r) => r.match(file))
  if (!rule) {
    for (const [i, line] of text.split('\n').entries()) {
      if (CJK.test(line)) problems.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`)
    }
    continue
  }
  filesPerRule.set(rule, filesPerRule.get(rule) + 1)
  const bad = rule.test(text, file)
  permitted += text.split('\n').filter((l) => CJK.test(l)).length - bad.length
  for (const [n, line] of bad) {
    problems.push(`${file}:${n}  ${line.trim().slice(0, 100)}\n    ↳ not permitted by: ${rule.why}`)
  }
}

for (const [rule, n] of filesPerRule) {
  if (n === 0) problems.push(`rule matches no file and is now dead: ${rule.why}`)
}

if (problems.length) {
  console.error(`✗ Working language: found ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`    ${p}`)
  console.error(
    '\nThe repository’s working language is English (ADR-0017). Translate the Chinese above, or, if it ' +
      'genuinely has to stay,\nwiden a rule in scripts/check-lang.mjs — stating what shape of Chinese is ' +
      'permitted, and why. Never a line count:\na count records what is true today, not why it is allowed.'
  )
  process.exit(1)
}

console.log(`✓ Working language: ${permitted} line(s) of Chinese, each permitted by a stated rule`)
for (const r of RULES) console.log(`    rule · ${filesPerRule.get(r)} file(s) · ${r.why}`)
