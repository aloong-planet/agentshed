import { expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { displayQuery, hydrateDisplayQueries } from './display-queries'
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
