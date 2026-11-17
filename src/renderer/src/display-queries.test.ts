import { expect, it } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { displayQuery, hydrateDisplayQueries } from './display-queries'
import { createQueryClient } from './query-client'
import { appError, ERR } from '@shared/errors'
import type { FileContentResult } from './memory-content-query'

it('retains the last successful read across a failed refresh and query removal', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  let fails = false
  const options = () => displayQuery<FileContentResult>(client, ['memoryContent', '/a'], () => Promise.resolve<FileContentResult>(fails
    ? { ok: false, error: new Error('source unavailable') }
    : { ok: true, text: { text: 'read previously', truncated: false } }))
  await client.fetchQuery(options())
  fails = true
  expect(await client.fetchQuery(options())).toEqual({ ok: true, text: { text: 'read previously', truncated: false } })
  client.removeQueries()
  expect(options().initialData()).toEqual({ ok: true, text: { text: 'read previously', truncated: false } })
  client.clear()
})

it('authoritative session absence retires the display copy while a transient error does not', async () => {
  const client = new QueryClient()
  let result: { ok: true; label: string } | { ok: false; error: unknown } = { ok: true, label: 'old page' }
  const options = displayQuery(client, ['sessionPage', '/s'], () => Promise.resolve(result))
  await options.queryFn()
  result = { ok: false, error: new Error('temporary') }
  expect(await options.queryFn()).toEqual({ ok: true, label: 'old page' })
  result = { ok: false, error: appError(ERR.sessionNotWhitelisted) }
  expect((await options.queryFn()).ok).toBe(false)
  expect(options.initialData()).toBeUndefined()
  client.clear()
})

it('bootstrap hydrates read previews without fetching and never replaces a newer live result', () => {
  const client = new QueryClient()
  client.setQueryData(['memoryContent', '/live'], { ok: true, text: { text: 'fresh', truncated: false } })
  client.setQueryData(['memoryContent', '/failed'], { ok: false, error: new Error('unavailable') })
  hydrateDisplayQueries(client, [
    { kind: 'memoryContent', file: '/live', data: { text: 'old', truncated: false } },
    { kind: 'skillContent', file: '/saved', data: { text: 'saved', truncated: false } },
    { kind: 'memoryContent', file: '/failed', data: { text: 'last good', truncated: false } }
  ])
  expect(client.getQueryData(['memoryContent', '/live'])).toEqual({ ok: true, text: { text: 'fresh', truncated: false } })
  expect(client.getQueryData(['skillContent', '/saved'])).toEqual({ ok: true, text: { text: 'saved', truncated: false } })
  expect(client.getQueryData(['memoryContent', '/failed'])).toEqual({ ok: true, text: { text: 'last good', truncated: false } })
  expect(client.isFetching()).toBe(0)
  client.clear()
})

it('a turn over the keep size is not retained once its query is removed, while a kept turn is', async () => {
  const client = new QueryClient()
  const turn = (unkept: boolean) => ({ ok: true as const, ms: 3, turn: { blocks: [], bytesRead: 9, ...(unkept ? { unkept: true as const } : {}) } })
  const over = displayQuery(client, ['turnContent', '/s', 0, 'r0'], () => Promise.resolve(turn(true)))
  const within = displayQuery(client, ['turnContent', '/s', 1, 'r1'], () => Promise.resolve(turn(false)))
  await client.fetchQuery(over)
  await client.fetchQuery(within)
  client.removeQueries()
  expect(over.initialData()).toBeUndefined()
  expect(within.initialData()).toEqual(turn(false))
  client.clear()
})

it('a turn kept earlier under its key leaves the copy once a fetch returns it over the keep size', async () => {
  const client = new QueryClient()
  let unkept = false
  const options = displayQuery(client, ['turnContent', '/s', 0, 'r0'], () => Promise.resolve({ ok: true as const, ms: 3,
    turn: { blocks: [], bytesRead: 9, ...(unkept ? { unkept: true as const } : {}) } }))
  await client.fetchQuery(options)
  expect(options.initialData()).toEqual({ ok: true, ms: 3, turn: { blocks: [], bytesRead: 9 } })
  unkept = true
  await options.queryFn()
  expect(options.initialData()).toBeUndefined()
  client.clear()
})

it("the renderer's client drops a turn over the keep size once no row shows it, whether its fetch returns before or after the row closes", async () => {
  const client = createQueryClient()
  const result = (unkept: boolean) => ({ ok: true as const, ms: 3, turn: { blocks: [], bytesRead: 9, ...(unkept ? { unkept: true as const } : {}) } })
  const key = (i: number) => ['turnContent', '/s', i, `r${i}`]
  let release: Array<() => void> = []
  const row = (i: number, unkept: boolean, pending: boolean): () => void => new QueryObserver(client, displayQuery(client, key(i), () =>
    pending ? new Promise<ReturnType<typeof result>>((r) => { release.push(() => r(result(unkept))) }) : Promise.resolve(result(unkept)))).subscribe(() => {})
  const settled = () => new Promise((r) => setTimeout(r, 0))
  const closedAfter = row(0, true, false)
  await settled()
  expect(client.getQueryData(key(0)), 'shown while its row is open').toEqual(result(true))
  closedAfter()
  expect(client.getQueryData(key(0))).toBeUndefined()
  row(1, true, true)()
  row(2, false, true)()
  for (const r of release) r()
  release = []
  await settled()
  expect(client.getQueryData(key(1)), 'its fetch returned after its row closed').toBeUndefined()
  expect(client.getQueryData(key(2)), 'a kept turn stays').toEqual(result(false))
  client.clear()
})

it("the renderer's client keeps turns within the total limit, the earliest fetched leaving first once no row shows it", async () => {
  // Each turn below serialises to 27 units, so a limit of 54 holds two
  const client = createQueryClient(54)
  const result = (i: number) => ({ ok: true as const, ms: 3, turn: { blocks: [], bytesRead: i } })
  const key = (i: number) => ['turnContent', '/s', i, `r${i}`]
  const options = (i: number) => displayQuery(client, key(i), () => Promise.resolve(result(i)))
  await client.fetchQuery(options(1))
  await client.fetchQuery(options(2))
  await client.fetchQuery({ ...options(1), staleTime: 0 })
  await client.fetchQuery(options(3))
  expect(options(2).initialData(), 'the earliest fetched leaves the copy').toBeUndefined()
  expect(client.getQueryData(key(2)), 'and the cache, no row showing it').toBeUndefined()
  for (const i of [1, 3]) {
    expect(options(i).initialData()).toEqual(result(i))
    expect(client.getQueryData(key(i))).toEqual(result(i))
  }
  // A row opening refetches its turn, which makes it the latest fetched: [3, 1], then 4 and 5 push it out
  const shown = new QueryObserver(client, options(1)).subscribe(() => {})
  await new Promise((r) => setTimeout(r, 0))
  await client.fetchQuery(options(4))
  await client.fetchQuery(options(5))
  expect(options(1).initialData()).toBeUndefined()
  expect(client.getQueryData(key(1)), 'a released turn stays while its row shows it').toEqual(result(1))
  shown()
  expect(client.getQueryData(key(1)), 'and leaves once its row closes').toBeUndefined()
  for (const i of [4, 5]) expect(client.getQueryData(key(i))).toEqual(result(i))
  client.clear()
})

it('hydrating restored turns keeps them within the total limit, the earliest saved leaving first', () => {
  const client = createQueryClient(54)
  const read = (i: number) => ({ kind: 'turnContent' as const, file: '/s', i, revision: `r${i}`, ms: 3, bodyBytes: 40, data: { blocks: [], bytesRead: i } })
  hydrateDisplayQueries(client, [read(1), read(2), read(3)])
  const key = (i: number) => ['turnContent', '/s', i, `r${i}`]
  const copy = (i: number) => displayQuery(client, key(i), () => Promise.reject(new Error('not fetched'))).initialData()
  expect(copy(1)).toBeUndefined()
  expect(client.getQueryData(key(1))).toBeUndefined()
  for (const i of [2, 3]) {
    expect(copy(i)).toEqual({ ok: true, ms: 3, turn: { blocks: [], bytesRead: i } })
    expect(client.getQueryData(key(i))).toEqual({ ok: true, ms: 3, turn: { blocks: [], bytesRead: i } })
  }
  client.clear()
})
