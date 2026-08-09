#!/usr/bin/env node
// The copy gate (ticket 14): scans the source for Chinese literals **not yet in the dictionaries**,
// hooked into pnpm verify.
//
// ── The division of labour with the type system (they do not overlap, which determines which one to
// rely on when adding copy) ──
//   **Missing translations** are caught by typecheck: the source language (zh) is the single truth and
//   the other five align to it entry by entry in the type system,
//   so one missing entry is TS2739 and one extra is TS2353. It governs "are the dictionaries internally
//   complete".
//   **Un-extracted copy** is caught by this gate: copy still written inside a component or the main
//   process, never having entered the dictionaries, is invisible to the type system —
//   to TS it is just an ordinary string. It governs "has everything that belongs in the dictionaries got
//   there".
//
// ── Scanning rule ──
// Only Chinese that **flows to the UI** counts: string literals and JSX text. Comments do not (they are
// written for developers, and per ADR-0017 they are
// in English anyway — so scanning them would add nothing, while the strip below keeps a Chinese word
// inside a comment from being mistaken for un-extracted copy).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const CJK = /[\u4e00-\u9fff]/

/**
 * The allow-list. **Every entry must be able to answer "would the gate go red without it" — an entry
 * that would not is redundant and should be deleted.**
 * The allow-list must never be relaxed just to turn the gate green: that is switching the gate off while
 * leaving a green light on.
 */
const ALLOW = [
  {
    // Removing it goes red: the six dictionaries **are** where the Chinese copy lives, so scanning them
    // is scanning the source language itself
    match: (rel) => rel.startsWith('shared/i18n/'),
    why: 'the six dictionaries themselves — the source language (zh) is Chinese by definition'
  },
  {
    // Removing it goes red: tests contain Chinese assertions, fixtures and case names, none of which
    // flow to the UI
    match: (rel) => rel.endsWith('.test.ts') || rel.endsWith('.test.tsx'),
    why: 'test files — case names, fixtures and assertions never reach the product UI'
  }
]

/** Strip comments so only literals and JSX text that might flow to the UI remain */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // Line comments (avoiding http:// and the like)
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
  return out
}

const hits = []
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/')
  const lines = strip(readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    if (!CJK.test(line)) return
    if (ALLOW.some((a) => a.match(rel, line))) return
    hits.push({ rel, n: i + 1, text: line.trim().slice(0, 100) })
  })
}

if (hits.length) {
  console.error(`✗ Copy gate: found ${hits.length} Chinese literal(s) not in the dictionary\n`)
  for (const h of hits) console.error(`    src/${h.rel}:${h.n}  ${h.text}`)
  console.error(
    '\nMove them into src/shared/i18n/zh.ts and fill in the other five languages ' +
      '(typecheck catches any you miss).\n' +
      'If a hit is genuinely a developer log or test-only string, register it explicitly ' +
      'in the allow-list in scripts/check-i18n.mjs with a stated reason.'
  )
  process.exit(1)
}
console.log('✓ Copy gate: no Chinese literals outside the dictionary')
for (const a of ALLOW) console.log(`    allow-list · ${a.why}`)
