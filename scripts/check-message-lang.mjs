#!/usr/bin/env node
// The message-language gate (ADR-0030): commit messages and pull-request text are written in the
// repository's working language, like everything else ADR-0017 covers. It applies the same prose rule as
// scripts/check-lang.mjs — Chinese may be **cited** (inside a quoting span: backticks, quotes, corner
// brackets, or a closed fenced code block), never **written** — through the shared module, so the two
// gates cannot drift apart.
//
// Three inputs:
//   --file <path>                 one message file: what git hands the commit-msg hook (.husky/commit-msg)
//   --stdin --label <name>        text on stdin, reported under <name>: a pull request's title or body in CI
//   --commits <base>..<head>      every commit message in the range: a pull request's commits in CI, which
//                                 is what a squash merge copies into the default branch's history
//
// ── When it applies ──
// The working language comes from `working-language` in capabilities.toml, never from a guess:
//   - Chinese (any `zh` tag) → the check does not apply; it says so and exits 0.
//   - Japanese → unsupported, exits 1. Japanese is written with Han characters too, and this check tells
//     Chinese by code point, so it cannot separate the two; running it would reject correct Japanese.
//   - Any other language → checked.
//   - Not declared → exits 1. A config value has no default (see the global capability rules): picking
//     one would decide the working language on the user's behalf.
//
// ── What it cannot do ──
// It cannot stop `git commit --no-verify`; that is why CI checks the same text again. Issues are not
// checked at all: GitHub cannot block an issue from being opened, and ADR-0030 records that they rely on
// the writing rule alone.
//
// Comment lines are recognised by `core.commentChar` only. With `core.commentChar = auto` git picks the
// character itself and the hook cannot know which, and the multi-character `core.commentString` is not
// read; both fall back to `#`. A localized git template commented with another character can then be
// reported as Chinese, rejecting that one commit — the CI layer still checks what actually lands.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { CJK, proseViolations } from './lib/working-language.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? '')
}
const fail = (lines) => {
  for (const l of [].concat(lines)) console.error(l)
  process.exit(1)
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' })

// ── Which working language ──────────────────────────────────────────────────────────────────────────
const root = git('rev-parse', '--show-toplevel').trim()
let lang
try {
  lang = parse(readFileSync(join(root, 'capabilities.toml'), 'utf8'))['working-language']
} catch (e) {
  fail(`✗ Message language: cannot read capabilities.toml (${e.message.split('\n')[0]})`)
}
if (typeof lang !== 'string' || lang === '') {
  fail([
    '✗ Message language: `working-language` is not declared in capabilities.toml.',
    '  Declare it (a BCP 47 tag such as "en") — there is no default.'
  ])
}
const primary = lang.toLowerCase().split('-')[0]
if (primary === 'zh') {
  console.log(`✓ Message language: the working language is Chinese ("${lang}"), so this check does not apply`)
  process.exit(0)
}
if (primary === 'ja') {
  fail([
    `✗ Message language: working language "${lang}" is not supported by this check.`,
    '  Japanese is written with Han characters too, and the check tells Chinese by code point, so it would',
    '  reject correct Japanese. A Japanese-aware check is needed before this gate can run here.'
  ])
}

// ── What to check ───────────────────────────────────────────────────────────────────────────────────
/** A commit message as git will store it: comment lines dropped, and everything from the scissors line on */
function asCommitted(text) {
  let cc = '#'
  try {
    const v = git('config', '--get', 'core.commentChar').trim()
    if (v && v !== 'auto') cc = v
  } catch {
    // unset: git's default comment character
  }
  const kept = []
  for (const line of text.split('\n')) {
    if (line === `${cc} ------------------------ >8 ------------------------`) break
    if (line.startsWith(cc)) continue
    kept.push(line)
  }
  return kept.join('\n')
}

/** [label, text] pairs */
const subjects = []
const file = flag('--file')
const range = flag('--commits')
if (file !== null) {
  subjects.push([`commit message (${file})`, asCommitted(readFileSync(file, 'utf8'))])
} else if (args.includes('--stdin')) {
  subjects.push([flag('--label') || 'stdin', readFileSync(0, 'utf8')])
} else if (range !== null) {
  // %x00 separates commits; the field is written by git, so no raw NUL appears in this source
  const out = git('log', '--format=%h %s%x00%B%x00', range)
  const parts = out.split('\x00')
  for (let i = 0; i + 1 < parts.length; i += 2) {
    subjects.push([`commit ${parts[i].trim()}`, parts[i + 1]])
  }
  if (subjects.length === 0) console.log(`  (no commits in ${range})`)
} else {
  fail('usage: check-message-lang.mjs --file <path> | --stdin --label <name> | --commits <base>..<head>')
}

// ── Check ────────────────────────────────────────────────────────────────────────────────────────────
const problems = []
for (const [label, text] of subjects) {
  if (!CJK.test(text)) continue
  for (const [n, line] of proseViolations(text)) problems.push(`${label}, line ${n}:  ${line.trim().slice(0, 100)}`)
}

if (problems.length) {
  fail([
    `✗ Message language: Chinese written outside a quote (${problems.length} line(s))\n`,
    ...problems.map((p) => `    ${p}`),
    '',
    `The working language is "${lang}" (capabilities.toml; ADR-0030). Write the message in it. Chinese may`,
    'appear only when cited — inside backticks, quotes, corner brackets or a fenced code block — e.g. a UI',
    'string or a log line under discussion.'
  ])
}

console.log(`✓ Message language: ${subjects.length} message(s) checked against "${lang}"`)
