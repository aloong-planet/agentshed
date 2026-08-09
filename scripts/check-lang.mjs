#!/usr/bin/env node
// The working-language gate (ADR-0017): the repository's working language is English, so Chinese must not
// appear anywhere except in an explicitly justified allow-list. Hooked into pnpm verify.
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
// ── What it cannot do ──
// It cannot judge whether the English is *correct* — no gate can. It only guarantees that unapproved
// Chinese cannot enter the repository.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const CJK = /[一-鿿]/
const BINARY = /\.(png|ico|icns|jpg|jpeg|gif|webp|woff2?|ttf|zip|pdf)$/i

/**
 * The allow-list. **Every entry carries the exact number of lines expected**, not just a path — a bare
 * path allow would turn into a rubber stamp, letting new Chinese slip into a file that is already
 * exempt. With a count, adding a line to an allow-listed file still goes red.
 *
 * Each entry must be able to answer "would the gate go red without it". An entry that would not is
 * redundant and should be deleted.
 */
const ALLOW = [
  {
    match: (f) => f === 'src/shared/i18n/zh.ts',
    lines: 338,
    why: 'the source-language dictionary — Chinese by definition (ADR-0014)'
  },
  {
    match: (f) => f === 'src/shared/i18n/ja.ts',
    lines: 239,
    why: 'the Japanese dictionary — its entries legitimately contain kanji'
  },
  {
    // A directory-level entry with one total: the prototypes exist to show what the UI looks like, and
    // that UI is in Chinese. The count is the sum across the directory, so a new Chinese comment in any
    // prototype still pushes the total over and goes red.
    match: (f) => f.startsWith('docs/prototypes/'),
    lines: 1140,
    why: 'prototype UI copy — the prototypes exist to show the interface, so translating it would change the thing being judged'
  },
  {
    match: (f) => /^README(\.[a-z]{2})?\.md$/.test(f),
    lines: 10,
    why: 'the six READMEs’ language switcher rows — a language is named in its own script'
  },
  {
    match: (f) => f === 'e2e/app.spec.ts',
    lines: 9,
    why: 'the zh/ja cases assert against a Chinese and a Japanese UI — that copy is the thing under test'
  },
  {
    match: (f) => f === 'src/shared/error-text.test.ts',
    lines: 7,
    why: 'asserts the six dictionaries’ actual wording — the thing under test'
  },
  {
    match: (f) => f === 'src/shared/format.test.ts',
    lines: 2,
    why: 'the /[一-鿿]/ regexes assert that non-Chinese languages contain no Chinese characters'
  },
  {
    match: (f) => f === 'docs/specs/i18n.md',
    lines: 3,
    why: 'language names and the pre-sanitisation values, quoted as history'
  },
  {
    match: (f) => f === 'docs/features/i18n.md',
    lines: 2,
    why: 'the language names shown in the selector, each written in its own script'
  },
  {
    match: (f) =>
      f === 'src/renderer/src/subagent-error-label.test.ts' ||
      f === 'src/renderer/src/SubagentsView.tsx' ||
      f === 'docs/adr/0015-structured-ipc-errors.md',
    lines: 4,
    why: 'verbatim quotes of the old includes(‘不可读’) code, explaining the hazard ADR-0015 named'
  },
  {
    match: (f) => f === 'docs/adr/0017-repo-working-language-english.md',
    lines: 1,
    why: 'the grep pattern used to measure the conversion’s scale'
  },
  {
    // A detector has to spell out the range it detects, and this one also quotes real examples of the
    // residue it was built to catch. There is no way to write it without the characters in it.
    match: (f) => f === 'scripts/check-lang.mjs',
    lines: 4,
    why: 'the gate itself — its character-range regex, and the quoted residue examples in its header'
  },
  {
    match: (f) => f === 'src/shared/i18n/types.ts',
    lines: 1,
    why: 'quotes the literal type `as const` produces, while explaining why the values must be widened'
  }
]

// `--others --exclude-standard` includes files that are new and not yet committed. Scanning only
// `git ls-files` would leave a new file unscanned until it is committed — and this gate itself fell into
// that hole: it passed locally while untracked, then flagged itself the moment CI saw it committed.
const tracked = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
/** path -> lines containing Chinese */
const found = new Map()
for (const file of tracked) {
  if (BINARY.test(file)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue // unreadable (a submodule pointer, say) — not this gate's business
  }
  const hits = text
    .split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => CJK.test(line))
  if (hits.length) found.set(file, hits)
}

const problems = []
const counted = new Set()
for (const rule of ALLOW) {
  let total = 0
  let matched = 0
  for (const [file, hits] of found) {
    if (!rule.match(file)) continue
    total += hits.length
    matched++
    counted.add(file)
  }
  if (matched === 0) {
    // An entry that matches nothing can no longer go red, so it is dead weight — delete it rather than
    // leaving a permanently green exemption behind.
    problems.push(`allow-list entry matches no file and is now dead: ${rule.why}`)
  } else if (total !== rule.lines) {
    problems.push(
      `allow-list count drifted: expected ${rule.lines} line(s), found ${total} — ${rule.why}\n` +
        `    If the change is intended, update the count in scripts/check-lang.mjs and say why in the commit.`
    )
  }
}

for (const [file, hits] of found) {
  if (counted.has(file)) continue
  for (const { n, line } of hits) {
    problems.push(`${file}:${n}  ${line.trim().slice(0, 100)}`)
  }
}

if (problems.length) {
  console.error(`✗ Working language: found ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`    ${p}`)
  console.error(
    '\nThe repository’s working language is English (ADR-0017). Translate the Chinese above, or, ' +
      'if it genuinely has to stay,\nregister it in the allow-list in scripts/check-lang.mjs with a stated reason ' +
      'and an exact line count.'
  )
  process.exit(1)
}

const allowed = ALLOW.reduce((n, r) => n + r.lines, 0)
console.log(`✓ Working language: no Chinese outside the allow-list (${allowed} allowed line(s))`)
for (const r of ALLOW) console.log(`    allow-list · ${r.lines} · ${r.why}`)
