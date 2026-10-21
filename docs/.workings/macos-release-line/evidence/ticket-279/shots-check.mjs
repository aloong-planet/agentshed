// The site's screenshots against the confirmed prototype's (landing-page::REQ-005/AC-01, AC-02, Failure E2): every
// file in either folder, compared byte for byte, with its pixel size from the PNG header and its SHA-256. Writes
// shots-check.txt beside this file, headed by the version compared. Run from anywhere:
//
//   node docs/.workings/macos-release-line/evidence/ticket-279/shots-check.mjs
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../../..')
const SITE = join(ROOT, 'site/public/shots')
const PROTO = join(ROOT, 'docs/prototypes/landing-page/shots')
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' })
const names = [...new Set([...readdirSync(SITE), ...readdirSync(PROTO)])].filter((n) => n.endsWith('.png')).sort()
const lines = [
  '# The site’s screenshots against the confirmed prototype’s, written by shots-check.mjs',
  `# HEAD: ${git('rev-parse', 'HEAD').trim()}; uncommitted files under the two folders: ${git('status', '--porcelain', '--untracked-files=all', '--', 'site/public/shots', 'docs/prototypes/landing-page/shots').trim() || 'none'}`
]
let differing = 0
for (const name of names) {
  let site, proto
  try { site = readFileSync(join(SITE, name)) } catch { site = null }
  try { proto = readFileSync(join(PROTO, name)) } catch { proto = null }
  const same = site && proto && Buffer.compare(site, proto) === 0
  if (!same) differing++
  const size = site ? `${site.readUInt32BE(16)}x${site.readUInt32BE(20)}` : '-'
  const hash = site ? createHash('sha256').update(site).digest('hex') : '-'
  lines.push(`${name} ${same ? 'identical' : site ? (proto ? 'DIFFERENT' : 'only in the site') : 'only in the prototype'} ${size} ${hash}`)
}
lines.push(`# ${names.length} file(s) compared, ${differing} not identical`)
writeFileSync(join(HERE, 'shots-check.txt'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
process.exit(differing ? 1 : 0)
