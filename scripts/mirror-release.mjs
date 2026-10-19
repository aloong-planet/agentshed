#!/usr/bin/env node
// The release workflow's mirror and pointer steps (mac-distribution::REQ-003, REQ-004, Failures C1, C2): a formal
// release's DMGs are copied to the R2 bucket under releases/v<version>/, and latest.json is rewritten last, only
// after every mirrored file has been read back through the download host with the gated file's size and sha256.
//
//   node scripts/mirror-release.mjs upload <artifact directory>     the mirror job
//   node scripts/mirror-release.mjs pointer <artifact directory>    the pointer job
//
// Environment: GITHUB_REF_NAME (the tag), R2_ACCOUNT_ID, R2_BUCKET, DOWNLOAD_HOST, and the aws-cli credentials the
// workflow maps from the R2 secrets (docs/ops/r2-setup.md). A pre-release tag is refused: pre-releases never reach
// R2 (mac-distribution::CON-004), whatever the workflow's condition says.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { releaseFiles } from './lib/release-artifact.mjs'

/** The release's DMGs, for a formal tag only: pre-releases never reach R2 (mac-distribution::CON-004) */
function formalFiles(dir, tag) {
  if (tag.includes('-')) throw new Error(`${tag} is a pre-release; only formal releases are mirrored`)
  return releaseFiles(dir, tag)
}

/** Copies each DMG to releases/v<version>/<name>; its URL never changes content, so it is cached for good */
export function mirrorRelease({ dir, tag, bucket, log = console.log }) {
  const { version, names, files } = formalFiles(dir, tag)
  files.forEach((file, i) => {
    const key = `releases/v${version}/${names[i]}`
    bucket.put(key, file, { cacheControl: 'public, max-age=31536000, immutable', contentType: 'application/x-apple-diskimage' })
    log(`[mirror] uploaded ${key}`)
  })
}

const READS = 3
const PAUSE_MS = 10_000

/** The download host's answer for a URL, read up to READS times while it is not served */
async function served(url, probe, sleep) {
  let failure
  for (let attempt = 1; attempt <= READS; attempt += 1) {
    if (attempt > 1) await sleep(PAUSE_MS)
    try {
      const answer = await probe(url)
      if (answer.status === 200) return answer
      failure = `HTTP ${answer.status}`
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(`${url} is not served: ${failure}`)
}

/**
 * Reads every DMG back from the download host and compares it with the gated file, then rewrites latest.json:
 * { version, files: [{ name, arch, size, url }] }, the contract the landing page reads. Kept briefly in caches,
 * since it changes with every formal release.
 */
export async function pointRelease({ dir, tag, host, bucket, probe, sleep, log = console.log }) {
  const { version, names, files } = formalFiles(dir, tag)
  const pointer = {
    version,
    files: names.map((name, i) => ({
      name,
      // releaseFiles holds every name to <productName>-<version>-mac-<arch>.dmg, the packaging asset's DMG name
      arch: name.slice(name.indexOf(`-${version}-mac-`) + `-${version}-mac-`.length, -'.dmg'.length),
      size: statSync(files[i]).size,
      url: `${host}/releases/v${version}/${name}`
    }))
  }
  for (const [i, file] of pointer.files.entries()) {
    const answer = await served(file.url, probe, sleep)
    const digest = createHash('sha256').update(readFileSync(files[i])).digest('hex')
    if (answer.size !== file.size || answer.sha256 !== digest) {
      throw new Error(`${file.url}: ${file.name} is served with other bytes than the gated file`)
    }
    log(`[mirror] ${file.url} serves the gated file (${file.size} bytes, sha256 ${digest})`)
  }
  bucket.putText('latest.json', `${JSON.stringify(pointer, null, 2)}\n`, { cacheControl: 'public, max-age=300', contentType: 'application/json' })
  log(`[mirror] latest.json now points at ${version}`)
}

/** The bucket through aws-cli on R2's S3 endpoint; `run` takes aws-cli's arguments, and throws when it fails */
export function awsBucket({ bucket, endpoint, run }) {
  const copy = (file, key, { cacheControl, contentType }) =>
    run(['s3', 'cp', file, `s3://${bucket}/${key}`, '--endpoint-url', endpoint, '--region', 'auto',
      '--cache-control', cacheControl, '--content-type', contentType, '--only-show-errors'])
  return {
    put: (key, file, headers) => copy(file, key, headers),
    putText: (key, text, headers) => {
      const dir = mkdtempSync(join(tmpdir(), 'latest-'))
      try {
        const file = join(dir, 'object')
        writeFileSync(file, text)
        copy(file, key, headers)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
}

/** A public read of a URL: its status, and for a 200 the size and sha256 of the body, hashed as it streams */
export function httpProbe() {
  return async (url) => {
    const response = await fetch(url)
    if (response.status !== 200) {
      await response.body?.cancel()
      return { status: response.status }
    }
    const hash = createHash('sha256')
    let size = 0
    for await (const chunk of response.body) {
      hash.update(chunk)
      size += chunk.length
    }
    return { status: 200, size, sha256: hash.digest('hex') }
  }
}

const USAGE = 'usage: node scripts/mirror-release.mjs <upload|pointer> <artifact directory>'

export async function main(argv, env, { run, probe, sleep }) {
  const [step, dir] = argv
  if (!['upload', 'pointer'].includes(step) || !dir) throw new Error(USAGE)
  for (const name of ['GITHUB_REF_NAME', 'R2_ACCOUNT_ID', 'R2_BUCKET', 'DOWNLOAD_HOST']) {
    if (!env[name]) throw new Error(`${name} is not set`)
  }
  const bucket = awsBucket({ bucket: env.R2_BUCKET, endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, run })
  if (step === 'upload') mirrorRelease({ dir, tag: env.GITHUB_REF_NAME, bucket })
  else await pointRelease({ dir, tag: env.GITHUB_REF_NAME, host: env.DOWNLOAD_HOST, bucket, probe, sleep })
}

/** aws with the given arguments; its output on failure — the credentials stay in the environment it reads */
function runAws(args) {
  const result = spawnSync('aws', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw new Error(`aws could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`aws ${args.slice(0, 2).join(' ')} failed (exit ${result.status})${output ? `\n${output}` : ''}`)
  }
  return { stdout: result.stdout ?? '' }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env, { run: runAws, probe: httpProbe(), sleep: delay }).catch((error) => {
    console.error(`[mirror] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
