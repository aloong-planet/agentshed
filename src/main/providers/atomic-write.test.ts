// What a failed write leaves behind, for each writer that replaces its file with a temporary one (token-stats C3, C8;
// i18n Preference persistence). The seam is each writer's own interface.
//
// The two steps are failed at the node:fs boundary, because no real failure reaches them here: nothing but a full disk
// fails a write after it has created its file, and nothing fails only the rename while the target stays a good file. Each
// case asserts that the failure fired, so a writer that stopped reaching it goes red rather than passing on nothing. The
// real failures — a directory at the temporary path, a read-only directory, the rename blocked by a directory at the
// target — are driven in archive.test.ts, token-stats.test.ts, prefs-store.test.ts and e2e/archive-write-failure.spec.ts.
//
// Gap: a real full disk is not in the suite, since it needs a volume of its own. Measured once on a disk image, the archive
// answered ENOSPC with its last good file and no temporary file left.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeAppError } from '@shared/errors'
import { PrefsStore } from '../prefs-store'
import { recordRunVersion } from '../run-version'
import { UsageArchive } from './archive'
import { encodeClaudeProjectDir } from './claude'
import { TokenEngine } from './token-stats'
import type { ScanRoots } from './types'

const failing = vi.hoisted(() => ({ step: null as 'write' | 'rename' | null, prefix: '', fired: false }))

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  const armed = (step: 'write' | 'rename', path: unknown): boolean =>
    failing.step === step && typeof path === 'string' && (path.split('/').pop() ?? '').startsWith(failing.prefix)
  const fire = (code: string): Error => {
    failing.step = null
    failing.fired = true
    return Object.assign(new Error(`${code}: a failure at this step`), { code })
  }
  return {
    ...fs,
    writeFileSync: (path: string, data: string, ...rest: []) => {
      if (armed('write', path)) {
        // What a full disk leaves: the file exists, with as much as fitted
        fs.writeFileSync(path, data.slice(0, Math.ceil(data.length / 2)))
        throw fire('ENOSPC')
      }
      return fs.writeFileSync(path, data, ...rest)
    },
    renameSync: (from: string, to: string) => {
      if (armed('rename', from)) throw fire('EACCES')
      return fs.renameSync(from, to)
    }
  }
})

const ANCHOR = Date.parse('2026-08-15T12:00:00')
let dir: string
let store: string
let logged: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-atomic-'))
  store = join(dir, 'store')
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  failing.step = null
  failing.fired = false
})
afterEach(() => {
  logged.mockRestore()
  rmSync(dir, { recursive: true, force: true })
})

/** A save of the writer's own, each with content of its own, and what the writer does when the save fails */
interface Writer {
  name: string
  prefix: string
  file: string
  open: () => { save: (n: number) => Promise<unknown>; failedSave: (n: number) => Promise<void> }
}

const archive: Writer = {
  name: 'the usage archive',
  prefix: '.usage-archive.w-',
  file: 'usage-archive.json',
  open: () => {
    const a = new UsageArchive(store, { stamp: 's', now: () => ANCHOR })
    const merge = (n: number): ReturnType<UsageArchive['merge']> =>
      a.merge([{ day: '2026-08-15', side: 'claude', projectKey: '/p', model: 'm', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: n }], ANCHOR)
    return {
      save: (n) => Promise.resolve(merge(n)),
      failedSave: (n) => {
        const r = merge(n)
        expect(r.fileFailed).toBe(true)
        expect(r.rows.map((x) => x.total)).toEqual([n])
        return Promise.resolve()
      }
    }
  }
}

const tokenCache: Writer = {
  name: 'the token cache',
  prefix: '.token-cache.j-',
  file: 'token-cache.json',
  open: () => {
    const proj = join(dir, 'proj')
    const roots: ScanRoots = {
      claudeHome: join(dir, '.claude'),
      claudeConfigFile: join(dir, '.claude.json'),
      codexHome: join(dir, '.codex'),
      geminiHome: join(dir, '.gemini'),
      grokHome: join(dir, '.grok'),
      antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
      agentsSkillsDir: join(dir, '.agents', 'skills')
    }
    const e = new TokenEngine(store)
    const build = (n: number): ReturnType<TokenEngine['build']> => {
      const sessions = join(dir, '.claude', 'projects', encodeClaudeProjectDir(proj))
      mkdirSync(sessions, { recursive: true })
      // The Claude line shapes measured in token-stats.test.ts
      writeFileSync(join(sessions, `s${n}.jsonl`), [
        JSON.stringify({ type: 'user', message: { role: 'user', content: `question ${n}` } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-08-14T02:00:00Z', message: { model: 'claude-fable-5', usage: { input_tokens: 1, output_tokens: n } } })
      ].join('\n') + '\n')
      return e.build(roots, [proj])
    }
    return {
      save: (n) => build(n),
      failedSave: async (n) => {
        const r = await build(n)
        expect([...r.sessionFiles].map((f) => basename(f))).toContain(`s${n}.jsonl`)
        expect(logged).toHaveBeenCalledWith('[token-cache] save failed:', expect.anything())
      }
    }
  }
}

const prefs: Writer = {
  name: 'the preference store',
  prefix: '.prefs.json.tmp-',
  file: 'prefs.json',
  open: () => {
    const s = new PrefsStore(store)
    const span = (n: number): 30 | 60 | 90 => (n === 1 ? 60 : n === 2 ? 90 : 30)
    return {
      save: (n) => Promise.resolve(s.setTrendSpan(span(n))),
      failedSave: (n) => {
        let thrown: unknown
        try {
          s.setTrendSpan(span(n))
        } catch (error) {
          thrown = error
        }
        expect(decodeAppError(thrown)?.code).toBe('prefs-write-failed')
        expect(s.get().trendSpan).toBe(span(n))
        return Promise.resolve()
      }
    }
  }
}

const runVersion: Writer = {
  name: 'the record of the last run’s version',
  prefix: '.last-run-version.json.tmp-',
  file: 'last-run-version.json',
  open: () => {
    const version = (n: number): string => `1.${n}.0`
    return {
      save: (n) => Promise.resolve(recordRunVersion(store, version(n))),
      failedSave: (n) => {
        expect(recordRunVersion(store, version(n))).toBe(true)
        expect(logged).toHaveBeenCalledWith('[run-version] could not record this run\'s version:', expect.anything())
        return Promise.resolve()
      }
    }
  }
}

describe.each([archive, tokenCache, prefs, runVersion])('$name', (w) => {
  it.each(['write', 'rename'] as const)('a failed %s leaves the last good file and no temporary file', async (step) => {
    const { save, failedSave } = w.open()
    await save(1)
    const lastGood = readFileSync(join(store, w.file), 'utf8')

    failing.step = step
    failing.prefix = w.prefix
    await failedSave(2)
    expect(failing.fired).toBe(true)
    expect(readFileSync(join(store, w.file), 'utf8')).toBe(lastGood)
    expect(readdirSync(store)).toEqual([w.file])

    await save(3)
    expect(readFileSync(join(store, w.file), 'utf8')).not.toBe(lastGood)
    expect(readdirSync(store)).toEqual([w.file])
  })
})
