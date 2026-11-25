// A Worker's R2 binding (R2Bucket) standing in at the system boundary, for the Worker's cases. What it answers follows
// Cloudflare's Workers API reference for R2 (cloudflare/cloudflare-docs, branch production at
// 1c6e6325496800447ff31891173bc380ec188db6, src/content/docs/r2/api/workers/workers-api-reference.mdx):
//
// - get answers null for a key that does not exist (:111), and otherwise the object with its size (:156), etag (:160),
//   httpMetadata (:177) and text() (:221);
// - put stores the value with its httpMetadata (:314), unless its onlyIf precondition (:310) fails, when it answers
//   null and stores nothing (:118). A precondition is an R2Conditional's etagMatches (:489), which fails for a key
//   that does not exist as RFC 7232's If-Match does, or a Headers object's conditional headers (:505), of which
//   If-None-Match: * is evaluated, failing for a key that exists (RFC 7232, section 3.2). Any other precondition
//   throws, so that no case passes on a condition this stand-in does not evaluate;
// - list answers the objects under a prefix ordered lexicographically (:131), at most `limit` of them, 1000 by default
//   and at most (:378), and may answer fewer (:131): `pageSize` cuts every page shorter while it stays truncated, so
//   only `truncated` tells whether more follow (:402), and `cursor` is there only when it is truncated (:475). The
//   objects carry no httpMetadata, which a listing includes only when asked to (:396).
//
// Every call settles on a later macrotask, as a binding's call does after its round trip: a call not awaited has not
// happened when the caller goes on. `write` is another writer's unconditional put, and `beforePut` runs just before
// each put is evaluated, where another writer may come in between the caller's read and its write; `unlisted` keys
// are left out of every listing while get still answers them, as a listing that misses an object would; `failing`
// makes a call reject, as a binding's call does when its round trip fails: for each of get, put and list, a function of
// the call's key (the prefix for list; the key and the value for put) answering the error, or nothing for a call that
// goes through.
//
// Gap: the docs are the only source. Whether the real runtime enforces etagMatches and If-None-Match: * on put, and how
// its pages are cut, was not observed; the Worker's first runs in production are that check (docs/ops/download-count.md).
const MAX_LIMIT = 1000

const byteLength = (text) => new TextEncoder().encode(text).length
const later = (call) => new Promise((resolve, reject) => {
  setImmediate(() => {
    try {
      resolve(call())
    } catch (error) {
      reject(error)
    }
  })
})

/**
 * A bucket holding `objects` (key -> text, or { text, size, httpMetadata } for an object whose size is not its text's,
 * such as a DMG never read)
 */
export function r2Binding({ objects = {}, pageSize = MAX_LIMIT, unlisted = [], beforePut, failing = {} } = {}) {
  const store = new Map()
  const fails = (call, ...args) => {
    const error = failing[call]?.(...args)
    if (error) throw error
  }
  let uploads = 0
  const save = (key, value) => {
    const { text = '', size = byteLength(text), httpMetadata = {} } = typeof value === 'string' ? { text: value } : value
    uploads += 1
    const etag = `etag-${uploads}`
    store.set(key, { key, text, size, etag, httpEtag: `"${etag}"`, httpMetadata: { ...httpMetadata } })
    return store.get(key)
  }
  for (const [key, value] of Object.entries(objects)) save(key, value)
  const meta = ({ key, size, etag, httpEtag }) => ({ key, size, etag, httpEtag })

  const holds = (key, onlyIf) => {
    if (onlyIf === undefined) return true
    const object = store.get(key)
    if (onlyIf instanceof Headers) {
      for (const [name, value] of onlyIf) {
        if (name !== 'if-none-match' || value !== '*') throw new Error(`the stand-in does not evaluate ${name}: ${value}`)
      }
      return object === undefined
    }
    const fields = Object.keys(onlyIf)
    if (fields.length !== 1 || fields[0] !== 'etagMatches') throw new Error(`the stand-in does not evaluate ${fields.join(', ')}`)
    return object !== undefined && object.etag === onlyIf.etagMatches
  }

  const binding = {
    get: (key) => later(() => {
      fails('get', key)
      const object = store.get(key)
      if (object === undefined) return null
      return { ...meta(object), httpMetadata: { ...object.httpMetadata }, text: async () => object.text }
    }),
    put: (key, value, { onlyIf, httpMetadata } = {}) => later(() => {
      beforePut?.(key, binding)
      fails('put', key, value)
      if (typeof value !== 'string') throw new Error('the stand-in stores text only')
      if (!holds(key, onlyIf)) return null
      return meta(save(key, { text: value, httpMetadata }))
    }),
    list: ({ prefix = '', cursor, limit = MAX_LIMIT } = {}) => later(() => {
      fails('list', prefix)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError(`limit ${limit} is not 1 to ${MAX_LIMIT}`)
      const after = cursor === undefined ? null : atob(cursor)
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix) && !unlisted.includes(key) && (after === null || key > after)).sort()
      const page = keys.slice(0, Math.min(limit, pageSize))
      const truncated = page.length < keys.length
      return {
        objects: page.map((key) => meta(store.get(key))),
        truncated,
        ...(truncated ? { cursor: btoa(page.at(-1)) } : {}),
        delimitedPrefixes: []
      }
    }),
    /** Another writer's put, with no precondition */
    write: (key, value) => { save(key, value) },
    /** What the bucket holds under a key, read past the binding, as the case's own view of the bucket */
    peek: (key) => store.get(key)
  }
  return binding
}
