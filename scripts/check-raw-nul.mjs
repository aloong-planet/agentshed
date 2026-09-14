#!/usr/bin/env node
// The NUL-byte gate: tracked text must not contain a raw NUL (0x00). Hooked into pnpm verify.
//
// ── Why this gate exists ──
// A NUL byte anywhere in a file makes recursive search **silently skip that file entirely**. Not the one
// line — every line, however long the file is. And the skip is indistinguishable from an honest miss:
// empty output, exit code 1, nothing on stderr. Measured on a directory search:
//
//     ripgrep (rg -l)             skips the file, says nothing
//     any grep invoked with -I    skips the file, says nothing
//     BSD /usr/bin/grep -r        reports "Binary file X matches"
//
// Note which way the failure points. A tool that misses something you expected leaves you looking for it;
// this one answers a question about **absence** — "there is no other producer", "nothing references this"
// — and an answer of "nothing here" is the one answer nobody re-checks.
//
// It is not hypothetical. src/main/providers/token-stats.ts carried one NUL at byte 20638, and every grep
// over its 1028 lines came back empty. That produced a count of one producer writing DayUsage.byProvider
// where there were three, and the change built on that count would have shipped covering a third of what
// it claimed to cover — typecheck clean, CI green, nothing anywhere to notice.
//
// ── Why NUL specifically, and not control characters at large ──
// Measured, not assumed: a file containing only 0x01, or only 0x1B, is searched normally by every tool
// tried. NUL is the byte that triggers the skip, so it is the whole of what this gate is for. Widening to
// control characters would fire on docs/prototypes/vendor/mermaid.min.js — a third-party minified bundle
// carrying one 0x01 and no NUL, which searches perfectly well — and buy an exemption for nothing.
//
// ── Why not `git ls-files --eol`, which is one line ──
// Because it answers a **proxy** question: "does git consider this binary". For bytes other than NUL that
// verdict is a ratio heuristic, so identical content gets opposite answers at different sizes — a 30-byte
// file holding one 0x01 reads as binary, a 3 MB file holding one 0x01 reads as text. Testing a correlate
// of the property instead of the property is how a gate ends up with drift nobody predicted.
//
// ── The fix, when this fires ──
// Write the escape, not the byte: `'\x00'` in place of a literal NUL. Identical at runtime — same string
// value, same emitted JavaScript — so this is purely how the character is spelled in source. NUL is a
// legitimate thing to want (it makes a composite-key separator that cannot collide with real data); only
// the spelling is at issue. The usual cause is generated code conflating a character with its source
// spelling, which coincide for every printable character and diverge exactly here.
//
// ── Exemptions ──
// Native application artwork uses PNG and ICNS, whose binary encoding legitimately contains NULs.
// Recognise those formats by extension AND file signature, not filenames, counts, or Git's text
// heuristic. Renaming text to an image extension must not exempt it from this gate.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

function isIconBinary(file, bytes) {
  const extension = extname(file).toLowerCase()
  if (extension === '.png') {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  return extension === '.icns' && bytes.length >= 8 &&
    bytes.toString('ascii', 0, 4) === 'icns' && bytes.readUInt32BE(4) === bytes.length
}

// `git ls-files` rather than a glob. The sibling gate learnt this the expensive way: a hand-picked scope
// is how an enumeration gets holes, and it offers nothing to pick precisely so that it cannot.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

const offenders = []
for (const f of files) {
  let buf
  try {
    buf = readFileSync(f)
  } catch {
    continue // in the index but gone from the worktree
  }
  if (isIconBinary(f, buf)) continue
  const at = buf.indexOf(0)
  if (at === -1) continue
  // Line number for the first one, so the report points somewhere openable rather than at a byte offset
  const line = buf.subarray(0, at).toString('utf8').split('\n').length
  offenders.push({ f, at, line, count: buf.filter((b) => b === 0).length })
}

if (offenders.length) {
  console.error(`✗ Raw NUL bytes: ${offenders.length} file(s)\n`)
  for (const o of offenders) {
    console.error(`    ${o.f}:${o.line}  (${o.count} NUL byte(s), first at offset ${o.at})`)
  }
  console.error(
    '\nA NUL byte makes recursive grep/ripgrep skip the whole file in silence — empty output and exit 1,\n' +
      'exactly like an honest miss. Replace the literal byte with the escape `\\x00`: identical at runtime,\n' +
      'and the file becomes searchable again. To read one of these files right now, pass -a (grep) or\n' +
      '--text (rg); without it you will be told the file contains nothing.'
  )
  process.exit(1)
}

console.log(`✓ Raw NUL bytes: none outside recognised PNG/ICNS artwork in ${files.length} tracked file(s)`)
