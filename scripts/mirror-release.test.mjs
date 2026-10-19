// The release workflow's mirror and pointer steps (mac-distribution::REQ-003, REQ-004, Failures C1, C2): a formal
// release's DMGs go to R2 under releases/v<version>/, and latest.json is written last, only after every mirrored
// file has been read back through the download host with the gated file's size and sha256.
//
// mirrorRelease and pointRelease are driven against an in-memory model of the bucket, standing in for R2 at the
// system boundary; the probe answers from the same model by mapping the download host's URL to a key, and the model
// records which objects existed when the pointer was written. awsBucket is tested for the aws-cli arguments it
// sends (Transfer's flags, which R2 serves today), httpProbe against a real HTTP server on localhost.
//
// Gap: nothing here touches R2 or the download host. The mirror and pointer jobs run only on a formal tag, so their
// first real run is the first formal release (Waiting in #236).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { awsBucket, httpProbe, main, mirrorRelease, pointRelease } from './mirror-release.mjs'

const HOST = 'https://dl.agentshed.aloongplanet.com'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The gate job's artifact as downloaded: `<version>/<files>` (run 39140793605's layout) */
function artifactDir(version, names) {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-release-'))
  mkdirSync(join(dir, version))
  for (const name of names) writeFileSync(join(dir, version, name), `bytes of ${name}`)
  return dir
}

/** A model of the R2 bucket: objects by key, and the keys present each time the pointer was written */
function bucketModel({ failOnPut = 0 } = {}) {
  const objects = new Map()
  const pointerWrites = []
  let puts = 0
  return {
    objects,
    pointerWrites,
    put: (key, file, { cacheControl, contentType }) => {
      puts += 1
      if (puts === failOnPut) throw new Error('aws failed (exit 1): upload interrupted')
      objects.set(key, { bytes: readFileSync(file), cacheControl, contentType })
    },
    putText: (key, text, { cacheControl, contentType }) => {
      if (key === 'latest.json') pointerWrites.push([...objects.keys()].sort())
      objects.set(key, { bytes: Buffer.from(text), cacheControl, contentType })
    }
  }
}

test("a formal release's DMGs go to releases/v<version>/ with immutable caching, and nothing else is written", (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-arm64.dmg.notary-log.json', 'Agentshed-0.2.0-mac-arm64.app.notary-log.json'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bucket = bucketModel()
  mirrorRelease({ dir, tag: 'v0.2.0', bucket, log: () => {} })

  assert.deepEqual([...bucket.objects.keys()], ['releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'])
  const object = bucket.objects.get('releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg')
  assert.equal(object.cacheControl, 'public, max-age=31536000, immutable')
  assert.equal(object.contentType, 'application/x-apple-diskimage')
  assert.equal(sha256(object.bytes), sha256(readFileSync(join(dir, '0.2.0', 'Agentshed-0.2.0-mac-arm64.dmg'))))
})

/** The download host's public read, answered from the bucket model: a URL under HOST maps to its key */
function probeOf(bucket, { missFirst = 0 } = {}) {
  const misses = new Map()
  return async (url) => {
    assert.ok(url.startsWith(`${HOST}/`), url)
    const key = url.slice(HOST.length + 1)
    const seen = misses.get(key) ?? 0
    misses.set(key, seen + 1)
    const object = bucket.objects.get(key)
    if (!object || seen < missFirst) return { status: 404 }
    return { status: 200, size: object.bytes.length, sha256: sha256(object.bytes) }
  }
}

test('the pointer is written last, naming the version and each file with its download URL', async (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-arm64.dmg.notary-log.json'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bucket = bucketModel()
  mirrorRelease({ dir, tag: 'v0.2.0', bucket, log: () => {} })
  await pointRelease({ dir, tag: 'v0.2.0', host: HOST, bucket, probe: probeOf(bucket), sleep: async () => {}, log: () => {} })

  const pointer = bucket.objects.get('latest.json')
  assert.ok(pointer, 'no latest.json')
  assert.equal(pointer.cacheControl, 'public, max-age=300')
  assert.equal(pointer.contentType, 'application/json')
  const size = readFileSync(join(dir, '0.2.0', 'Agentshed-0.2.0-mac-arm64.dmg')).length
  assert.deepEqual(JSON.parse(pointer.bytes.toString('utf8')), {
    version: '0.2.0',
    files: [
      {
        name: 'Agentshed-0.2.0-mac-arm64.dmg',
        arch: 'arm64',
        size,
        url: 'https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'
      }
    ]
  })
  assert.deepEqual(bucket.pointerWrites, [['releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg']])
})

test('a mirrored file the download host cannot serve leaves the pointer unwritten', async (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-x64.dmg'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bucket = bucketModel()
  mirrorRelease({ dir, tag: 'v0.2.0', bucket, log: () => {} })
  bucket.objects.delete('releases/v0.2.0/Agentshed-0.2.0-mac-x64.dmg')
  await assert.rejects(
    pointRelease({ dir, tag: 'v0.2.0', host: HOST, bucket, probe: probeOf(bucket), sleep: async () => {}, log: () => {} }),
    /https:\/\/dl\.agentshed\.aloongplanet\.com\/releases\/v0\.2\.0\/Agentshed-0\.2\.0-mac-x64\.dmg is not served: HTTP 404/
  )
  assert.equal(bucket.objects.has('latest.json'), false)
})

test('a file the download host serves with other bytes than the gated file leaves the pointer unwritten', async (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bucket = bucketModel()
  mirrorRelease({ dir, tag: 'v0.2.0', bucket, log: () => {} })
  // Same length, other bytes: only the sha256 can tell them apart
  const key = 'releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'
  const stale = Buffer.from(bucket.objects.get(key).bytes)
  stale[0] ^= 0xff
  bucket.objects.set(key, { ...bucket.objects.get(key), bytes: stale })
  await assert.rejects(
    pointRelease({ dir, tag: 'v0.2.0', host: HOST, bucket, probe: probeOf(bucket), sleep: async () => {}, log: () => {} }),
    /Agentshed-0\.2\.0-mac-arm64\.dmg is served with other bytes than the gated file/
  )
  assert.equal(bucket.objects.has('latest.json'), false)
})

test('a file the download host misses once is read again after a pause, and then the pointer is written', async (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bucket = bucketModel()
  mirrorRelease({ dir, tag: 'v0.2.0', bucket, log: () => {} })
  const pauses = []
  await pointRelease({ dir, tag: 'v0.2.0', host: HOST, bucket, probe: probeOf(bucket, { missFirst: 1 }), sleep: async (ms) => pauses.push(ms), log: () => {} })
  assert.ok(bucket.objects.has('latest.json'))
  assert.equal(pauses.length, 1)
  assert.ok(pauses[0] > 0)
})

// A failed upload fails the mirror job, so the pointer job, which needs it, never runs (Failure C1)
test('an upload that fails partway fails the mirror', (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-x64.dmg'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bucket = bucketModel({ failOnPut: 2 })
  assert.throws(() => mirrorRelease({ dir, tag: 'v0.2.0', bucket, log: () => {} }), /upload interrupted/)
  assert.deepEqual([...bucket.objects.keys()], ['releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg'])
})

// The arguments are the contract with aws-cli: Transfer's flags, which R2 serves today (a DMG uploaded in parts with
// application/x-apple-diskimage and immutable caching; latest.json in one PUT with application/json, max-age=300)
test('the aws-cli adapter copies each object with its headers to the bucket on the R2 endpoint', () => {
  const calls = []
  const run = (args) => {
    // what the text upload sends, read while its temporary file still exists
    calls.push({ args, body: args[2].includes('latest-') ? readFileSync(args[2], 'utf8') : null })
    return { stdout: '' }
  }
  const bucket = awsBucket({ bucket: 'agentshed-releases', endpoint: 'https://acct.r2.cloudflarestorage.com', run })
  bucket.put('releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg', '/a/Agentshed-0.2.0-mac-arm64.dmg', { cacheControl: 'public, max-age=31536000, immutable', contentType: 'application/x-apple-diskimage' })
  bucket.putText('latest.json', '{"version":"0.2.0"}\n', { cacheControl: 'public, max-age=300', contentType: 'application/json' })
  assert.equal(calls.length, 2)
  const tail = ['--endpoint-url', 'https://acct.r2.cloudflarestorage.com', '--region', 'auto']
  assert.deepEqual(calls[0].args, ['s3', 'cp', '/a/Agentshed-0.2.0-mac-arm64.dmg', 's3://agentshed-releases/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg', ...tail, '--cache-control', 'public, max-age=31536000, immutable', '--content-type', 'application/x-apple-diskimage', '--only-show-errors'])
  assert.deepEqual(calls[1].args.slice(0, 2), ['s3', 'cp'])
  assert.deepEqual(calls[1].args.slice(3), ['s3://agentshed-releases/latest.json', ...tail, '--cache-control', 'public, max-age=300', '--content-type', 'application/json', '--only-show-errors'])
  assert.equal(calls[1].body, '{"version":"0.2.0"}\n')
  assert.throws(() => readFileSync(calls[1].args[2]), /ENOENT/)
})

const listening = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

test('the HTTP probe reports the status, and the size and sha256 of the bytes it read', async (t) => {
  const body = Buffer.concat([Buffer.from('a DMG of '), Buffer.alloc(200_000, 7)])
  const server = createServer((request, response) => {
    if (request.url === '/releases/v0.2.0/a.dmg') {
      response.writeHead(200)
      response.end(body)
    } else {
      response.writeHead(404)
      response.end('not here')
    }
  })
  const port = await listening(server)
  t.after(() => server.close())
  const closed = createServer()
  const closedPort = await listening(closed)
  await new Promise((resolve) => closed.close(resolve))

  const probe = httpProbe()
  assert.deepEqual(await probe(`http://127.0.0.1:${port}/releases/v0.2.0/a.dmg`), { status: 200, size: body.length, sha256: sha256(body) })
  assert.deepEqual(await probe(`http://127.0.0.1:${port}/latest.json`), { status: 404 })
  await assert.rejects(probe(`http://127.0.0.1:${closedPort}/releases/v0.2.0/a.dmg`))
})

const ENV = { GITHUB_REF_NAME: 'v0.2.0', R2_ACCOUNT_ID: 'acct', R2_BUCKET: 'agentshed-releases', DOWNLOAD_HOST: HOST }

test('the entry point refuses a missing setting or an unknown step before any command', async () => {
  const deps = {
    run: () => { throw new Error('aws was called') },
    probe: async () => { throw new Error('the host was read') },
    sleep: async () => {}
  }
  const without = (name) => Object.fromEntries(Object.entries(ENV).filter(([key]) => key !== name))
  assert.equal(Object.keys(ENV).length, 4)
  for (const name of Object.keys(ENV)) {
    await assert.rejects(main(['upload', 'artifact'], without(name), deps), new RegExp(`${name} is not set`), name)
  }
  await assert.rejects(main(['sync', 'artifact'], ENV, deps), /usage: node scripts\/mirror-release\.mjs <upload\|pointer> <artifact directory>/)
  await assert.rejects(main(['pointer'], ENV, deps), /usage: node scripts\/mirror-release\.mjs <upload\|pointer> <artifact directory>/)
})

test('the entry point uploads to the bucket on the account endpoint, and points at the download host', async (t) => {
  const dir = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.dmg'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dmg = readFileSync(join(dir, '0.2.0', 'Agentshed-0.2.0-mac-arm64.dmg'))
  const calls = []
  const run = (args) => {
    calls.push({ args, body: args[3].endsWith('/latest.json') ? readFileSync(args[2], 'utf8') : null })
    return { stdout: '' }
  }
  const probe = async (url) => (url === `${HOST}/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg` ? { status: 200, size: dmg.length, sha256: sha256(dmg) } : { status: 404 })
  await main(['upload', dir], ENV, { run, probe, sleep: async () => {} })
  await main(['pointer', dir], ENV, { run, probe, sleep: async () => {} })

  assert.equal(calls.length, 2)
  for (const { args } of calls) assert.deepEqual(args.slice(4, 6), ['--endpoint-url', 'https://acct.r2.cloudflarestorage.com'])
  assert.equal(calls[0].args[3], 's3://agentshed-releases/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg')
  assert.equal(calls[1].args[3], 's3://agentshed-releases/latest.json')
  assert.equal(JSON.parse(calls[1].body).files[0].url, `${HOST}/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg`)
})

// The workflow's condition keeps pre-releases from these jobs; the script refuses them as well (CON-004)
test('a pre-release tag is refused before the bucket or the download host is touched', async (t) => {
  const dir = artifactDir('0.2.0-beta.2', ['Agentshed-0.2.0-beta.2-mac-arm64.dmg'])
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const untouchable = new Proxy({}, { get: (_, operation) => () => { throw new Error(`touched: ${String(operation)}`) } })
  const probe = async () => { throw new Error('touched: probe') }
  assert.throws(() => mirrorRelease({ dir, tag: 'v0.2.0-beta.2', bucket: untouchable, log: () => {} }), /v0\.2\.0-beta\.2 is a pre-release; only formal releases are mirrored/)
  await assert.rejects(
    pointRelease({ dir, tag: 'v0.2.0-beta.2', host: HOST, bucket: untouchable, probe, sleep: async () => {}, log: () => {} }),
    /v0\.2\.0-beta\.2 is a pre-release; only formal releases are mirrored/
  )
})
