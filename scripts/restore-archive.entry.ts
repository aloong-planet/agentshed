// The body of the archive restore (spec C16, ADR-0026): read a token-cache snapshot this application
// wrote, run it through the same aggregation the scan uses, and write the rows of one side over one day
// range into the usage archive as accepted changes under the current accounting stamp. Whatever those
// rows replace is kept as superseded values; the scan's own day is never touched. Dry run by default —
// nothing is written without --apply.
//
// scripts/restore-archive.mjs bundles this file with esbuild and runs it under Node; the stamp's
// application-version half arrives in AGENTSHED_APP_VERSION from the runner (the entry is bundled into a
// temporary directory and cannot find package.json by itself).
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentSide, UsageRow } from '../src/shared/domain'
import { UsageArchive } from '../src/main/providers/archive'
import { CACHE_VERSION, rowsFromCacheFile } from '../src/main/providers/token-stats'

const SIDES = new Set<string>(['claude', 'codex', 'grok'])
const DAY = /^\d{4}-\d{2}-\d{2}$/

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function usage(): never {
  console.error(
    'usage: pnpm restore:archive --snapshot <token-cache.json> --side <claude|codex|grok> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--user-data <dir>] [--apply]'
  )
  process.exit(2)
}

function defaultUserData(): string | null {
  const name = process.env['AGENTSHED_APP_NAME']
  if (!name) return null
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', name)
  return null
}

function main(): void {
  const snapshot = arg('snapshot')
  const side = arg('side')
  const from = arg('from')
  const to = arg('to')
  const apply = process.argv.includes('--apply')
  if (!snapshot || !side || !from || !to || !SIDES.has(side) || !DAY.test(from) || !DAY.test(to) || from > to) usage()
  const userData = arg('user-data') ?? defaultUserData()
  if (!userData) {
    console.error('no --user-data given and no default for this platform')
    process.exit(2)
  }
  if (!existsSync(snapshot as string)) {
    console.error(`snapshot not found: ${snapshot}`)
    process.exit(2)
  }
  const version = process.env['AGENTSHED_APP_VERSION']
  if (!version) {
    console.error('AGENTSHED_APP_VERSION is not set: run through scripts/restore-archive.mjs')
    process.exit(2)
  }
  const stamp = `${version}+c${CACHE_VERSION}`

  // rowsFromCacheFile refuses a snapshot of another cache structure version (spec C16)
  const all = rowsFromCacheFile(snapshot as string)
  const rows = all.filter((r) => r.side === (side as AgentSide) && r.day !== '' && r.day >= (from as string) && r.day <= (to as string))
  const byDay = new Map<string, UsageRow[]>()
  for (const r of rows) {
    const list = byDay.get(r.day)
    if (list) list.push(r)
    else byDay.set(r.day, [r])
  }

  const archive = new UsageArchive(userData, { stamp })
  const current = archive.rows()
  console.log(`snapshot: ${snapshot}`)
  console.log(`archive:  ${join(userData, 'usage-archive.json')}`)
  console.log(`stamp:    ${stamp}`)
  console.log(`side ${side}, days ${from} … ${to}: ${byDay.size} day(s), ${rows.length} row(s)`)
  console.log('day          archive now   snapshot')
  const days = [...byDay.keys()].sort()
  for (const day of days) {
    const now = current.filter((r) => r.day === day && r.side === side).reduce((s, r) => s + r.total, 0)
    const next = (byDay.get(day) ?? []).reduce((s, r) => s + r.total, 0)
    console.log(`${day}  ${String(now).padStart(12)}  ${String(next).padStart(9)}`)
  }
  if (!apply) {
    console.log('dry run — nothing written; add --apply to write these rows')
    return
  }
  const outcome = archive.restore(rows, Date.now())
  console.log(`written ${outcome.pairs} (day, side) pair(s); ${outcome.skippedOwnDay} skipped as the scan's own day`)
}

main()
