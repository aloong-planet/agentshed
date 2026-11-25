// The R2 binding's stand-in (r2-binding.mjs) answers as the docs its header cites say the binding does
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { r2Binding } from './r2-binding.mjs'

/** Every page of a listing, as the binding answers them */
async function pages(binding, options) {
  const answered = []
  let cursor
  do {
    const page = await binding.list({ ...options, cursor })
    answered.push(page)
    cursor = page.cursor
  } while (answered.at(-1).truncated)
  return answered
}

test('a listing answers at most 1000 objects a page, in key order, with a cursor only while truncated', async () => {
  const keys = Array.from({ length: 2500 }, (_, i) => `releases/v0.${String(2499 - i).padStart(4, '0')}/a.dmg`)
  const binding = r2Binding({ objects: { ...Object.fromEntries(keys.map((key) => [key, 'x'])), 'stats/downloads.json': '{}' } })
  const answered = await pages(binding, { prefix: 'releases/' })

  assert.deepEqual(answered.map(({ objects }) => objects.length), [1000, 1000, 500])
  assert.deepEqual(answered.map(({ truncated }) => truncated), [true, true, false])
  assert.deepEqual(answered.map((page) => 'cursor' in page), [true, true, false])
  const listed = answered.flatMap(({ objects }) => objects)
  assert.equal(listed[0].key, 'releases/v0.0000/a.dmg')
  assert.equal(listed.at(-1).key, 'releases/v0.2499/a.dmg')
  assert.deepEqual(listed.map(({ key }) => key), [...keys].sort())
  assert.deepEqual(Object.keys(listed[0]).sort(), ['etag', 'httpEtag', 'key', 'size'])
  assert.equal(listed[0].size, 1)
  await assert.rejects(binding.list({ limit: 1001 }), RangeError)
})

test('a page cut short stays truncated, and an unlisted object is in no page while get still answers it', async () => {
  const binding = r2Binding({
    objects: { 'releases/a.dmg': 'a', 'releases/b.dmg': 'bb', 'releases/c.dmg': 'ccc', 'releases/d.dmg': 'dddd' },
    pageSize: 1,
    unlisted: ['releases/c.dmg']
  })
  const answered = await pages(binding, { prefix: 'releases/' })
  assert.deepEqual(answered.map(({ objects }) => objects.map(({ key }) => key)), [['releases/a.dmg'], ['releases/b.dmg'], ['releases/d.dmg']])
  assert.deepEqual(answered.map(({ truncated }) => truncated), [true, true, false])
  assert.equal((await binding.get('releases/c.dmg')).size, 3)
})

test('get answers null for an absent key, and put stores only when its precondition holds', async () => {
  const binding = r2Binding({ objects: { 'stats/downloads-shadow.json': '{"a":1}' } })
  assert.equal(await binding.get('stats/worker-runs.json'), null)
  const read = await binding.get('stats/downloads-shadow.json')
  assert.equal(await read.text(), '{"a":1}')
  assert.equal(read.size, 7)

  // Another writer comes in after the read: the read's etag is stale
  binding.write('stats/downloads-shadow.json', '{"b":2}')
  assert.equal(await binding.put('stats/downloads-shadow.json', '{"c":3}', { onlyIf: { etagMatches: read.etag } }), null)
  assert.equal(await (await binding.get('stats/downloads-shadow.json')).text(), '{"b":2}')
  assert.equal(await binding.put('stats/new.json', '{}', { onlyIf: { etagMatches: read.etag } }), null)
  assert.equal(await binding.get('stats/new.json'), null)

  const current = await binding.get('stats/downloads-shadow.json')
  const httpMetadata = { contentType: 'application/json', cacheControl: 'public, max-age=300' }
  const stored = await binding.put('stats/downloads-shadow.json', '{"d":4}', { onlyIf: { etagMatches: current.etag }, httpMetadata })
  assert.notEqual(stored.etag, current.etag)
  const after = await binding.get('stats/downloads-shadow.json')
  assert.equal(await after.text(), '{"d":4}')
  assert.equal(after.etag, stored.etag)
  assert.deepEqual(after.httpMetadata, httpMetadata)

  const createOnly = new Headers({ 'if-none-match': '*' })
  assert.equal(await binding.put('stats/downloads-shadow.json', '{"e":5}', { onlyIf: createOnly }), null)
  assert.equal(await (await binding.get('stats/downloads-shadow.json')).text(), '{"d":4}')
  assert.notEqual(await binding.put('stats/worker-runs.json', '{"f":6}', { onlyIf: createOnly }), null)
  assert.equal(await (await binding.get('stats/worker-runs.json')).text(), '{"f":6}')

  await assert.rejects(binding.put('stats/x.json', '{}', { onlyIf: new Headers({ 'if-match': '"etag-1"' }) }), /does not evaluate if-match/)
  await assert.rejects(binding.put('stats/x.json', '{}', { onlyIf: { etagDoesNotMatch: 'etag-1' } }), /does not evaluate etagDoesNotMatch/)
})

test('another writer coming in just before a put is there when its precondition is evaluated', async () => {
  const binding = r2Binding({
    objects: { 'stats/downloads-shadow.json': 'ours' },
    beforePut: (key, bucket) => { if (key === 'stats/downloads-shadow.json') bucket.write(key, 'theirs') }
  })
  const read = await binding.get('stats/downloads-shadow.json')
  assert.equal(await binding.put('stats/downloads-shadow.json', 'newer', { onlyIf: { etagMatches: read.etag } }), null)
  assert.equal(binding.peek('stats/downloads-shadow.json').text, 'theirs')
})

test('a failing call rejects with its error and changes nothing, while the calls it does not name go through', async () => {
  const error = new Error('the round trip failed')
  const binding = r2Binding({
    objects: { 'stats/a.json': 'a', 'stats/b.json': 'b' },
    failing: {
      get: (key) => (key === 'stats/a.json' ? error : undefined),
      put: (key, value) => (value === 'c' ? error : undefined),
      list: (prefix) => (prefix === 'releases/' ? error : undefined)
    }
  })
  await assert.rejects(binding.get('stats/a.json'), error)
  assert.equal(await (await binding.get('stats/b.json')).text(), 'b')
  await assert.rejects(binding.put('stats/b.json', 'c'), error)
  assert.equal(binding.peek('stats/b.json').text, 'b')
  await binding.put('stats/b.json', 'd')
  assert.equal(binding.peek('stats/b.json').text, 'd')
  await assert.rejects(binding.list({ prefix: 'releases/' }), error)
  assert.deepEqual((await binding.list({ prefix: 'stats/' })).objects.map(({ key }) => key), ['stats/a.json', 'stats/b.json'])
})

test('a call settles only after the caller has gone on', async () => {
  const binding = r2Binding({ objects: { 'stats/downloads.json': '{}' } })
  const order = []
  const reading = binding.get('stats/downloads.json').then(() => order.push('answered'))
  await Promise.resolve()
  order.push('went on')
  await reading
  assert.deepEqual(order, ['went on', 'answered'])
})
