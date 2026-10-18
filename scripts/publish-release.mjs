#!/usr/bin/env node
// The release workflow's publish step (mac-distribution::REQ-003, Failures C3, C5): publishes the GitHub release
// for a tag from the DMGs the macOS gate job passed, all of them or none.
//
//   GITHUB_REF_NAME=v0.2.0 PRERELEASE=false GITHUB_REPOSITORY=<owner>/<repo> GH_TOKEN=… \
//     node scripts/publish-release.mjs <artifact directory>
//
// The release is created as a draft, which only the repository's writers can see, with every DMG uploaded to it;
// each upload is checked against the gated file by its sha256 before the draft is made public in one step. So a
// failed or partial upload leaves a draft behind and nothing public. A re-run deletes the drafts an earlier attempt
// left for the tag and starts again, and refuses a tag whose release is already public, so a release never holds
// two builds' files. PRERELEASE comes from the workflow, which tells a pre-release by the tag alone.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Publishes the DMGs of the gate job's artifact, downloaded to `dir` (`<dir>/<version>/<files>`), as the release
 * of `tag`. `releases` is the release store (ghReleases below, or a
 * stand-in): list, deleteDraft, createDraft, view and publish.
 */
export function publishRelease({ dir, tag, prerelease, releases, log = console.log }) {
  const version = tag.slice(1)
  // The artifact keeps the gate job's layout under release/: one directory named for the version
  const entries = readdirSync(dir)
  if (entries.length !== 1 || entries[0] !== version || !statSync(join(dir, version)).isDirectory()) {
    throw new Error(`the artifact holds ${entries.join(', ') || 'nothing'}, not one ${version} directory`)
  }
  const versionDir = join(dir, version)
  const names = readdirSync(versionDir).filter((name) => name.endsWith('.dmg')).sort()
  if (names.length === 0) throw new Error(`no DMG in ${versionDir}`)
  const foreign = names.filter((name) => !name.includes(`-${version}-mac-`))
  if (foreign.length > 0) throw new Error(`${foreign.join(', ')} is not a DMG of version ${version}`)
  const files = names.map((name) => join(versionDir, name))

  const existing = releases.list().filter((release) => release.tagName === tag)
  if (existing.some((release) => !release.isDraft)) {
    throw new Error(`${tag} is already published; a re-run never replaces a published release's files`)
  }
  for (let i = 0; i < existing.length; i += 1) releases.deleteDraft(tag)
  if (existing.length > 0) log(`[release] removed ${existing.length} draft(s) an earlier attempt left for ${tag}`)

  log(`[release] uploading ${names.join(', ')} to a draft of ${tag}`)
  releases.createDraft({
    tag,
    title: prerelease ? tag : `${tag}-release`,
    notes: `Agentshed ${version} for macOS. Release notes for this version follow.`,
    prerelease,
    files
  })
  const draft = releases.view(tag)
  const held = new Map(draft.assets.map((asset) => [asset.name, asset]))
  const missing = files.map((file) => basename(file)).filter((name) => !held.has(name))
  if (missing.length > 0) throw new Error(`the draft of ${tag} does not hold the files sent: missing ${missing.join(', ')}`)
  for (const file of files) {
    const digest = `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
    if (held.get(basename(file)).digest !== digest) {
      throw new Error(`the draft of ${tag} holds ${basename(file)} with other bytes than the gated file`)
    }
  }

  releases.publish(tag, { latest: !prerelease })
  const published = releases.list().find((release) => release.tagName === tag)
  if (!published || published.isDraft || published.isPrerelease !== prerelease || published.isLatest !== !prerelease) {
    const intended = prerelease ? 'not Latest, a pre-release' : 'Latest, a formal release'
    throw new Error(`${tag} was published but is not as intended: expected ${intended}; GitHub reports ${JSON.stringify(published ?? null)}`)
  }
  log(`[release] published ${tag} (${prerelease ? 'pre-release' : 'Latest'}) with ${names.join(', ')}`)
}

/** The release store through the GitHub CLI; `run` takes gh's arguments and returns its stdout, or throws */
export function ghReleases(repo, run) {
  const gh = (...args) => run([...args, '-R', repo]).stdout
  return {
    list: () => JSON.parse(gh('release', 'list', '--json', 'tagName,isDraft,isLatest,isPrerelease', '--limit', '1000')),
    deleteDraft: (tag) => gh('release', 'delete', tag, '--yes'),
    createDraft: ({ tag, title, notes, prerelease, files }) =>
      gh('release', 'create', tag, ...files, '--draft', '--verify-tag', '--title', title, '--notes', notes, ...(prerelease ? ['--prerelease'] : [])),
    view: (tag) => JSON.parse(gh('release', 'view', tag, '--json', 'isDraft,isPrerelease,assets')),
    publish: (tag, { latest }) => gh('release', 'edit', tag, '--draft=false', latest ? '--latest' : '--latest=false')
  }
}

export function main(argv, env, run) {
  const [dir] = argv
  if (!dir) throw new Error('usage: node scripts/publish-release.mjs <artifact directory>')
  const tag = env.GITHUB_REF_NAME
  if (!tag) throw new Error('GITHUB_REF_NAME is not set: run this on a tag push')
  const repo = env.GITHUB_REPOSITORY
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set')
  if (env.PRERELEASE !== 'true' && env.PRERELEASE !== 'false') {
    throw new Error(`PRERELEASE must be "true" or "false" (found: ${JSON.stringify(env.PRERELEASE ?? null)})`)
  }
  publishRelease({ dir, tag, prerelease: env.PRERELEASE === 'true', releases: ghReleases(repo, run) })
}

/** gh with the given arguments; its output on failure, never the token, which gh reads from GH_TOKEN */
function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw new Error(`gh could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`gh ${args.slice(0, 2).join(' ')} failed (exit ${result.status})${output ? `\n${output}` : ''}`)
  }
  return { stdout: result.stdout ?? '' }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2), process.env, runGh)
  } catch (error) {
    console.error(`[release] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
