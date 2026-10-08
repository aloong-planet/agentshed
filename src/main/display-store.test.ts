// The filesystem store seam: no Electron or private-state access. Full-process restoration is e2e.
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { emptySnapshot } from '@shared/domain'
import { emptyDisplayData } from '@shared/display-data'
import { DisplayStore } from './display-store'
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
function dir(): string { const d = mkdtempSync(join(tmpdir(), 'agentshed-display-')); dirs.push(d); return d }
it('restores the successful snapshot after a normal flush and a new store instance', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(123456)
  store.save(data)
  await store.flush()
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(123456)
})

it('drops a corrupt snapshot leaf without losing an independently valid preview', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(100)
  data.reads = [{ kind: 'artifactContent', file: '/viewed.md', data: { text: 'kept preview', truncated: false } }]
  store.save(data)
  await store.flush()
  // Corruption enters at the filesystem boundary, not through a fabricated private state.
  const file = join(root, 'display-cache.json')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see #192
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- see #193
  raw.data.snapshot.global.skills = [null]
  writeFileSync(file, JSON.stringify(raw))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot).toBeNull()
  expect(restored.reads).toEqual([{ kind: 'artifactContent', file: '/viewed.md', data: { text: 'kept preview', truncated: false } }])
})

it('coalesces pending writes and flushes the newest successful payload', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(10)
  store.save(data)
  const flushing = store.flush()
  data.snapshot = emptySnapshot(20)
  store.save(data)
  await flushing
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(20)
})

it('a failed atomic write retains the previous disk copy and can later retry', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(10)
  store.save(data)
  await store.flush()
  // A directory at the temporary file's location makes writeFile fail on every platform.
  const obstruction = join(root, `.display-cache.json.tmp-${process.pid}`)
  mkdirSync(obstruction)
  data.snapshot = emptySnapshot(20)
  store.save(data)
  await expect(store.flush()).rejects.toThrow()
  expect(store.get().snapshot?.scannedAt).toBe(20)
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(10)
  rmSync(obstruction, { recursive: true })
  await store.flush()
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(20)
})

it.each(['{broken', '{"version":999,"data":{}}'])('an unreadable display envelope falls back to cold start: %s', content => {
  const root = dir()
  writeFileSync(join(root, 'display-cache.json'), content)
  expect(new DisplayStore(root).get().snapshot).toBeNull()
})

it('isolates a saved page whose numeric data overflowed JSON without discarding another preview', () => {
  const root = dir()
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), reads: [
      { kind: 'sessionPage', file: '/session.jsonl', data: {
        file: '/session.jsonl', side: 'claude', revision: 'page', title: 'Question', at: 1,
        tokens: 'OVERFLOW', bytes: 100, forkState: 'none', forkPoints: 0,
        forkParentTitle: null, forkParentFile: null, questions: []
      } },
      { kind: 'artifactContent', file: '/good.md', data: { text: 'Good body', truncated: false } }
    ]
  } }).replace('"OVERFLOW"', '1e400'))
  expect(new DisplayStore(root).get().reads.map(r => r.kind)).toEqual(['artifactContent'])
})
