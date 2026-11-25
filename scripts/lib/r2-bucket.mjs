// The release bucket through aws-cli on R2's S3 endpoint, for the release workflow's mirror
// (scripts/mirror-release.mjs). The credentials stay in the environment aws-cli reads (docs/ops/r2-setup.md); nothing
// here sees them.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The bucket through aws-cli on R2's S3 endpoint; `run` takes aws-cli's arguments, and throws when it fails */
export function awsBucket({ bucket, endpoint, run }) {
  const target = ['--endpoint-url', endpoint, '--region', 'auto']
  const copy = (file, key, { cacheControl, contentType }) =>
    run(['s3', 'cp', file, `s3://${bucket}/${key}`, ...target,
      '--cache-control', cacheControl, '--content-type', contentType, '--only-show-errors'])
  const throughFile = (use) => {
    const dir = mkdtempSync(join(tmpdir(), 'latest-'))
    try {
      return use(join(dir, 'object'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  return {
    put: (key, file, headers) => copy(file, key, headers),
    putText: (key, text, headers) => throughFile((file) => {
      writeFileSync(file, text)
      copy(file, key, headers)
    })
  }
}

/** aws with the given arguments; its output on failure — the credentials stay in the environment it reads */
export function runAws(args) {
  const result = spawnSync('aws', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw new Error(`aws could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`aws ${args.slice(0, 2).join(' ')} failed (exit ${result.status})${output ? `\n${output}` : ''}`)
  }
  return { stdout: result.stdout ?? '' }
}
