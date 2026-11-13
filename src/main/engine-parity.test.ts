// The parity command's core (ADR-0045) over the scan fixture's real-shaped session files. The module's side is the
// TypeScript parser here, as no side's parsing is in the module yet: the cases hold the comparison and its report, and
// each change that moves a side in proves its own parse with the command over this machine's data.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { firstDifference, parityExitCode, runParity } from './engine-parity'
import { runParseJob, type ParseJob, type ParseResult } from './providers/token-stats'
import { mkScanHome, type ScanHome } from './testing/scan-home'

let dir: string
let home: ScanHome
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-parity-'))
  home = mkScanHome(join(dir, 'home'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** The result with its first number, in key order, made one larger; and where that number is */
function planted(result: ParseResult): { result: ParseResult; at: string } {
  const copy = structuredClone(result)
  const visit = (value: unknown, path: string): string | null => {
    if (typeof value !== 'object' || value === null) return null
    const entries: Array<[string, unknown]> = Array.isArray(value)
      ? value.map((v, i) => [`[${i}]`, v])
      : Object.keys(value).sort().map((k) => [path ? `.${k}` : k, (value as Record<string, unknown>)[k]])
    for (const [step, child] of entries) {
      if (typeof child === 'number') {
        const key = step.startsWith('[') ? Number(step.slice(1, -1)) : step.replace(/^\./, '')
        ;(value as Record<string | number, unknown>)[key] = child + 1
        return `${path}${step}`
      }
      const found = visit(child, `${path}${step}`)
      if (found !== null) return found
    }
    return null
  }
  const at = visit(copy, '')
  if (at === null) throw new Error('the result holds no number to plant a difference in')
  return { result: copy, at }
}

describe('the parity command (ADR-0045)', () => {
  it('over two session files both parsers give the same results for: the command reports both equal and exits 0', async () => {
    const files = [home.claude.asked, home.codex.fork]
    const report = await runParity({ roots: home.roots, sides: [], files, typescript: runParseJob, module: runParseJob, cacheDir: join(dir, 'cache') })

    expect(report).toEqual({ compared: files, differing: [], failed: [], missing: [] })
    expect(parityExitCode(report)).toBe(0)
  })

  it('a difference planted in one file\'s result: the command reports that file and where its results part, and exits 1', async () => {
    const files = [home.claude.asked, home.codex.fork]
    let at = ''
    const module = async (job: ParseJob): Promise<ParseResult> => {
      const result = await runParseJob(job)
      if (job.file !== home.codex.fork) return result
      const plant = planted(result)
      at = plant.at
      return plant.result
    }

    const report = await runParity({ roots: home.roots, sides: [], files, typescript: runParseJob, module, cacheDir: join(dir, 'cache') })

    expect(at).not.toBe('')
    expect(report.differing).toEqual([{ file: home.codex.fork, at }])
    expect(report.compared).toEqual(files)
    expect(parityExitCode(report)).toBe(1)
  })

  it('a module that cannot parse a file, and a file the scan never met, are each reported and fail the command', async () => {
    const never = join(dir, 'not-a-session.jsonl')
    const report = await runParity({
      roots: home.roots,
      sides: ['grok'],
      files: [never],
      typescript: runParseJob,
      module: () => Promise.reject(new Error('the engine module does not parse grok files yet')),
      cacheDir: join(dir, 'cache')
    })

    expect(report).toEqual({
      compared: [],
      differing: [],
      failed: [{ file: home.grok, message: 'the engine module: the engine module does not parse grok files yet' }],
      missing: [never]
    })
    expect(parityExitCode(report)).toBe(1)
  })
})

describe('where two results first part', () => {
  it.each<{ name: string; a: unknown; b: unknown; at: string | null }>([
    { name: 'equal data, keys in another order and a key holding undefined', a: { x: [1, { y: 'a' }], z: undefined }, b: { x: [1, { y: 'a' }] }, at: null },
    { name: 'a number', a: { x: [1, { y: 2 }] }, b: { x: [1, { y: 3 }] }, at: 'x[1].y' },
    { name: 'a list\'s length', a: { x: [1] }, b: { x: [1, 2] }, at: 'x.length' },
    { name: 'a key one side lacks', a: { x: 1 }, b: { x: 1, w: null }, at: 'w' },
    { name: 'zero and minus zero', a: { x: 0 }, b: { x: -0 }, at: 'x' },
    { name: 'a value that is not plain data', a: { x: new Map() }, b: { x: new Map() }, at: 'x (not plain data)' }
  ])('$name', ({ a, b, at }) => {
    expect(firstDifference(a, b)).toBe(at)
  })
})
