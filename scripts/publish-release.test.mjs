// The release workflow's publish step (mac-distribution::REQ-001/AC-02, REQ-003, Failures B3, C3, C5): the GitHub
// release is published once the whole artifact set has passed its gates, the files the in-app updater reads with the
// DMGs, never with part of it, and a re-run never mixes two builds' files.
//
// publishRelease is driven against an in-memory model of the repository's releases, standing in for GitHub at the
// system boundary; it records every state in which a release is public, so "never public with part of the set" is
// asserted over all of them. ghReleases, which implements the same operations with the GitHub CLI, is tested
// for the arguments it sends and the output it reads (shapes from gh 2.97.0).
//
// Gap: neither touches GitHub. The real gh against the real repository runs first on the first tag push (the
// first pre-release); a formal release's Latest marking on the first formal release.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { ghReleases, main, publishRelease } from './publish-release.mjs'

/** A model of GitHub's releases for one repository, with the semantics publishRelease relies on */
function fakeReleases(initial = [], { loseUploads = 0, corruptDigest = false } = {}) {
  const releases = initial.map((release) => ({ ...release, assets: [...(release.assets ?? [])] }))
  const publicStates = []
  const recordPublic = () => {
    for (const release of releases) if (!release.draft) publicStates.push(structuredClone(release))
  }
  const asset = (file) => {
    const bytes = readFileSync(file)
    const digest = createHash('sha256').update(corruptDigest ? Buffer.concat([bytes, Buffer.from('x')]) : bytes).digest('hex')
    return { name: basename(file), size: statSync(file).size, digest: `sha256:${digest}`, state: 'uploaded' }
  }
  return {
    releases,
    publicStates,
    list: () => releases.map((r) => ({ tagName: r.tag, isDraft: r.draft, isLatest: r.latest, isPrerelease: r.prerelease })),
    deleteDraft: (tag) => {
      const index = releases.findIndex((r) => r.tag === tag && r.draft)
      if (index < 0) throw new Error(`release not found: ${tag}`)
      releases.splice(index, 1)
    },
    createDraft: ({ tag, title, notes, prerelease, files }) => {
      const uploaded = files.slice(0, files.length - loseUploads).map(asset)
      releases.push({ tag, title, notes, draft: true, prerelease, latest: false, assets: uploaded })
    },
    view: (tag) => {
      const release = releases.find((r) => r.tag === tag && r.draft) ?? releases.find((r) => r.tag === tag)
      if (!release) throw new Error(`release not found: ${tag}`)
      return { isDraft: release.draft, isPrerelease: release.prerelease, assets: release.assets }
    },
    publish: (tag, { latest }) => {
      const release = releases.find((r) => r.tag === tag && r.draft)
      if (!release) throw new Error(`release not found: ${tag}`)
      release.draft = false
      if (latest) {
        for (const other of releases) other.latest = false
        release.latest = true
      }
      recordPublic()
    }
  }
}

/**
 * The gate job's artifact as the publish job downloads it: the version's directory with its files (the layout of the
 * manual verification run 39216743638's artifact, `0.1.0/Agentshed-0.1.0-mac-arm64.dmg` and the rest; upload-artifact
 * roots it at `release/`, the part of the paths before the first wildcard)
 */
function artifactDir(version, names) {
  const dir = mkdtempSync(join(tmpdir(), 'publish-release-'))
  mkdirSync(join(dir, version))
  for (const name of names) writeFileSync(join(dir, version, name), `bytes of ${name}`)
  return dir
}

/**
 * What a release packaging leaves for each arch, as the verification run 39216743638 left it: the DMG, the ZIP the
 * updater installs from and its blockmap, the two notary logs, and once per version the update metadata, which a
 * GitHub provider names latest-mac.yml
 */
function releaseSet(version, arches = ['arm64']) {
  return [
    ...arches.flatMap((arch) => {
      const base = `Agentshed-${version}-mac-${arch}`
      return [`${base}.dmg`, `${base}.zip`, `${base}.zip.blockmap`, `${base}.dmg.notary-log.json`, `${base}.app.notary-log.json`]
    }),
    'latest-mac.yml'
  ]
}

test('a formal tag publishes the whole set once, the update files with the DMG, titled for a release, marked Latest', (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = fakeReleases()
  publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} })

  assert.equal(store.releases.length, 1)
  const [release] = store.releases
  assert.equal(release.draft, false)
  assert.equal(release.prerelease, false)
  assert.equal(release.latest, true)
  assert.equal(release.title, 'v0.2.0-release')
  assert.equal(release.notes, 'Agentshed 0.2.0 for macOS. Release notes for this version follow.')
  const published = ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-arm64.zip', 'Agentshed-0.2.0-mac-arm64.zip.blockmap', 'latest-mac.yml']
  assert.deepEqual(release.assets.map((a) => a.name).sort(), published)
  assert.ok(store.publicStates.length > 0)
  for (const state of store.publicStates) assert.deepEqual(state.assets.map((a) => a.name).sort(), published)
})

test('a pre-release tag after a formal release is published as a pre-release, and Latest stays on the formal one', (t) => {
  const dir = artifactDir('0.3.0-beta.2', releaseSet('0.3.0-beta.2'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const formal = { tag: 'v0.2.0', title: 'v0.2.0-release', notes: '', draft: false, prerelease: false, latest: true, assets: [] }
  const store = fakeReleases([formal])
  publishRelease({ dir, tag: 'v0.3.0-beta.2', prerelease: true, releases: store, log: () => {} })

  const pre = store.releases.find((r) => r.tag === 'v0.3.0-beta.2')
  assert.equal(pre.draft, false)
  assert.equal(pre.prerelease, true)
  assert.equal(pre.latest, false)
  assert.equal(pre.title, 'v0.3.0-beta.2')
  assert.equal(store.releases.find((r) => r.tag === 'v0.2.0').latest, true)
})

test('a tag whose release is already public is refused, and nothing is created or deleted', (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const published = { tag: 'v0.2.0', title: 'v0.2.0-release', notes: '', draft: false, prerelease: false, latest: true, assets: [{ name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 1, digest: 'sha256:00', state: 'uploaded' }] }
  const store = fakeReleases([published])
  const before = structuredClone(store.releases)

  assert.throws(
    () => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} }),
    /v0\.2\.0 is already published; a re-run never replaces a published release's files/
  )
  assert.deepEqual(store.releases, before)
})

test("an earlier attempt's drafts for the tag are removed first, so only this run's files go public", (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const stale = (tag) => ({ tag, title: '', notes: '', draft: true, prerelease: false, latest: false, assets: [{ name: 'Agentshed-0.2.0-mac-arm64.dmg', size: 3, digest: 'sha256:5ca1e', state: 'uploaded' }] })
  const store = fakeReleases([stale('v0.2.0'), stale('v0.2.0'), stale('v0.3.0')])
  publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} })

  const forTag = store.releases.filter((r) => r.tag === 'v0.2.0')
  assert.equal(forTag.length, 1)
  assert.equal(forTag[0].draft, false)
  const digestOf = (name) => `sha256:${createHash('sha256').update(readFileSync(join(dir, '0.2.0', name))).digest('hex')}`
  const published = ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-arm64.zip', 'Agentshed-0.2.0-mac-arm64.zip.blockmap', 'latest-mac.yml']
  assert.deepEqual(
    forTag[0].assets.map((a) => [a.name, a.digest]).sort(),
    published.map((name) => [name, digestOf(name)])
  )
  assert.deepEqual(store.releases.filter((r) => r.tag === 'v0.3.0').map((r) => r.draft), [true])
})

test('an upload that did not land in full leaves nothing public', async (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0', ['arm64', 'x64']))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  await t.test('the release holds fewer files than were sent', () => {
    const store = fakeReleases([], { loseUploads: 1 })
    assert.throws(
      () => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} }),
      /the draft of v0\.2\.0 does not hold the files sent: missing latest-mac\.yml/
    )
    assert.deepEqual(store.publicStates, [])
    assert.equal(store.releases[0].draft, true)
  })

  await t.test('the create command fails after one upload', () => {
    const store = fakeReleases()
    const create = store.createDraft
    store.createDraft = (options) => {
      create({ ...options, files: options.files.slice(0, 1) })
      throw new Error('gh failed (exit 1): upload interrupted')
    }
    assert.throws(() => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} }), /upload interrupted/)
    assert.deepEqual(store.publicStates, [])
  })
})

test('a file whose stored bytes differ from the gated file leaves nothing public', (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = fakeReleases([], { corruptDigest: true })
  assert.throws(
    () => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} }),
    /the draft of v0\.2\.0 holds Agentshed-0\.2\.0-mac-arm64\.dmg with other bytes than the gated file/
  )
  assert.deepEqual(store.publicStates, [])
})

test("an artifact with no DMG, with another version's directory, or with a DMG of another version fails before the release store is touched", (t) => {
  const untouchable = new Proxy({}, { get: (_, operation) => () => { throw new Error(`the release store was touched: ${String(operation)}`) } })
  const empty = artifactDir('0.2.0', ['Agentshed-0.2.0-mac-arm64.app.notary-log.json'])
  const otherVersion = artifactDir('0.1.0', ['Agentshed-0.1.0-mac-arm64.dmg'])
  const misnamed = artifactDir('0.2.0', ['Agentshed-0.1.0-mac-arm64.dmg'])
  t.after(() => {
    for (const dir of [empty, otherVersion, misnamed]) rmSync(dir, { recursive: true, force: true })
  })
  assert.throws(() => publishRelease({ dir: empty, tag: 'v0.2.0', prerelease: false, releases: untouchable, log: () => {} }), /no DMG in /)
  assert.throws(
    () => publishRelease({ dir: otherVersion, tag: 'v0.2.0', prerelease: false, releases: untouchable, log: () => {} }),
    /the artifact holds 0\.1\.0, not one 0\.2\.0 directory/
  )
  assert.throws(
    () => publishRelease({ dir: misnamed, tag: 'v0.2.0', prerelease: false, releases: untouchable, log: () => {} }),
    /Agentshed-0\.1\.0-mac-arm64\.dmg is not a DMG of version 0\.2\.0/
  )
})

// A release without them would install for no one: the updater reads the metadata and installs from the ZIP
// (mac-distribution::REQ-001/AC-02, Failure B3)
test('an artifact without every update file fails before the release store is touched', (t) => {
  const untouchable = new Proxy({}, { get: (_, operation) => () => { throw new Error(`the release store was touched: ${String(operation)}`) } })
  const full = releaseSet('0.2.0')
  const cases = [
    ['no update metadata', full.filter((name) => name !== 'latest-mac.yml'), /no update metadata \(\*-mac\.yml\) in /],
    ['two update metadata files', [...full, 'beta-mac.yml'], /more than one update metadata file in .*: beta-mac\.yml, latest-mac\.yml/],
    ['no ZIP for the DMG', full.filter((name) => name !== 'Agentshed-0.2.0-mac-arm64.zip'), /no ZIP for Agentshed-0\.2\.0-mac-arm64\.dmg: Agentshed-0\.2\.0-mac-arm64\.zip/],
    ['no blockmap for the ZIP', full.filter((name) => name !== 'Agentshed-0.2.0-mac-arm64.zip.blockmap'), /no blockmap for Agentshed-0\.2\.0-mac-arm64\.zip/],
    ['a ZIP of another version', [...full, 'Agentshed-0.1.0-mac-arm64.zip'], /Agentshed-0\.1\.0-mac-arm64\.zip has no DMG of version 0\.2\.0 beside it/],
    ['a blockmap of another version', [...full, 'Agentshed-0.1.0-mac-arm64.zip.blockmap'], /Agentshed-0\.1\.0-mac-arm64\.zip\.blockmap has no DMG of version 0\.2\.0 beside it/]
  ]
  for (const [what, names, message] of cases) {
    const dir = artifactDir('0.2.0', names)
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    assert.throws(() => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: untouchable, log: () => {} }), message, what)
  }
})

test('a formal release that does not end up Latest fails the run where it can be seen', (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = fakeReleases()
  // GitHub publishes the draft but leaves Latest where it was
  store.publish = (tag) => {
    store.releases.find((r) => r.tag === tag && r.draft).draft = false
  }
  assert.throws(
    () => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} }),
    /v0\.2\.0 was published but is not as intended: expected Latest, a formal release/
  )
})

// Two runs for one tag overlapping (a tag deleted and pushed again mid-run): the other run's public release, read
// back by tag in place of this run's draft, holds other bytes under the same name, and the file check refuses it
test('a release another run made public while this one uploaded is left alone, and this run publishes nothing', (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = fakeReleases()
  const create = store.createDraft
  const names = ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-arm64.zip', 'Agentshed-0.2.0-mac-arm64.zip.blockmap', 'latest-mac.yml']
  const theirs = { tag: 'v0.2.0', title: 'v0.2.0-release', notes: '', draft: false, prerelease: false, latest: true, assets: names.map((name) => ({ name, size: 9, digest: 'sha256:07e5', state: 'uploaded' })) }
  store.createDraft = (options) => {
    store.releases.push(theirs)
    create(options)
  }
  // Reading the tag back finds the public release first, as gh's lookup by tag can
  store.view = (tag) => {
    const release = store.releases.find((r) => r.tag === tag && !r.draft)
    return { isDraft: release.draft, isPrerelease: release.prerelease, assets: release.assets }
  }
  const before = structuredClone(theirs)
  assert.throws(() => publishRelease({ dir, tag: 'v0.2.0', prerelease: false, releases: store, log: () => {} }), /other bytes than the gated file/)
  assert.deepEqual(theirs, before)
  assert.deepEqual(store.publicStates, [])
})

// The arguments are the contract with the GitHub CLI (each flag checked in `gh release create|edit|delete|list
// --help`, gh 2.97.0), so asserting them is asserting the boundary, not an implementation detail
test('the GitHub CLI adapter sends each operation as the gh command that performs it', () => {
  const calls = []
  const run = (args) => {
    calls.push(args)
    return { stdout: args[1] === 'list' ? '[]' : args[1] === 'view' ? '{"isDraft":true,"isPrerelease":false,"assets":[]}' : '' }
  }
  const gh = ghReleases('aloong-planet/agentshed', run)
  gh.list()
  gh.deleteDraft('v0.2.0')
  gh.createDraft({ tag: 'v0.2.0', title: 'v0.2.0-release', notes: 'n', prerelease: false, files: ['d/a.dmg', 'd/b.dmg'] })
  gh.createDraft({ tag: 'v0.3.0-beta', title: 'v0.3.0-beta', notes: 'n', prerelease: true, files: ['d/a.dmg'] })
  gh.view('v0.2.0')
  gh.publish('v0.2.0', { latest: true })
  gh.publish('v0.3.0-beta', { latest: false })
  const repo = ['-R', 'aloong-planet/agentshed']
  assert.deepEqual(calls, [
    ['release', 'list', '--json', 'tagName,isDraft,isLatest,isPrerelease', '--limit', '1000', ...repo],
    ['release', 'delete', 'v0.2.0', '--yes', ...repo],
    ['release', 'create', 'v0.2.0', 'd/a.dmg', 'd/b.dmg', '--draft', '--verify-tag', '--title', 'v0.2.0-release', '--notes', 'n', ...repo],
    ['release', 'create', 'v0.3.0-beta', 'd/a.dmg', '--draft', '--verify-tag', '--title', 'v0.3.0-beta', '--notes', 'n', '--prerelease', ...repo],
    ['release', 'view', 'v0.2.0', '--json', 'isDraft,isPrerelease,assets', ...repo],
    ['release', 'edit', 'v0.2.0', '--draft=false', '--latest', ...repo],
    ['release', 'edit', 'v0.3.0-beta', '--draft=false', '--latest=false', ...repo]
  ])
})

// Output shapes as gh 2.97.0 prints them (gh release list --json … and gh release view --json assets, cli/cli,
// 2026-10-18), trimmed to one entry each
const LIST_OUTPUT = '[{"isDraft":false,"isLatest":true,"isPrerelease":false,"tagName":"v2.102.0"},{"isDraft":true,"isLatest":false,"isPrerelease":true,"tagName":"v2.103.0-rc.1"}]\n'
const VIEW_OUTPUT = '{"assets":[{"apiUrl":"https://api.github.com/repos/cli/cli/releases/assets/599854636","contentType":"text/plain; charset=utf-8","createdAt":"2026-09-30T02:39:56Z","digest":"sha256:afe49e9affa232faa8212aed035417166f6ade9b9470acb53d4dbd28c0504e8d","downloadCount":173855,"id":"RA_kwDODKw3uc4jwQ4s","label":"GitHub CLI 2.102.0 checksums","name":"gh_2.102.0_checksums.txt","size":1971,"state":"uploaded","updatedAt":"2026-09-30T02:39:56Z","url":"https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_checksums.txt"}],"isDraft":false,"isPrerelease":false}\n'

test("the adapter reads gh's JSON into the fields publishing checks", () => {
  const gh = ghReleases('cli/cli', (args) => ({ stdout: args[1] === 'list' ? LIST_OUTPUT : VIEW_OUTPUT }))
  assert.deepEqual(gh.list(), [
    { tagName: 'v2.102.0', isDraft: false, isLatest: true, isPrerelease: false },
    { tagName: 'v2.103.0-rc.1', isDraft: true, isLatest: false, isPrerelease: true }
  ])
  const view = gh.view('v2.102.0')
  assert.equal(view.isDraft, false)
  assert.equal(view.isPrerelease, false)
  assert.deepEqual(view.assets.map(({ name, size, digest }) => ({ name, size, digest })), [
    { name: 'gh_2.102.0_checksums.txt', size: 1971, digest: 'sha256:afe49e9affa232faa8212aed035417166f6ade9b9470acb53d4dbd28c0504e8d' }
  ])
})

test('a failed gh command fails the operation that sent it', () => {
  const gh = ghReleases('aloong-planet/agentshed', () => {
    throw new Error('gh failed (exit 1): HTTP 422')
  })
  assert.throws(() => gh.deleteDraft('v0.2.0'), /HTTP 422/)
  assert.throws(() => gh.createDraft({ tag: 'v0.2.0', title: 't', notes: 'n', prerelease: false, files: ['a.dmg'] }), /HTTP 422/)
  assert.throws(() => gh.publish('v0.2.0', { latest: true }), /HTTP 422/)
})

test('the entry point refuses an environment it cannot classify, before any gh command', () => {
  const run = () => {
    throw new Error('gh was called')
  }
  const env = { GITHUB_REF_NAME: 'v0.2.0', GITHUB_REPOSITORY: 'aloong-planet/agentshed', PRERELEASE: 'false' }
  const without = (name) => Object.fromEntries(Object.entries(env).filter(([key]) => key !== name))
  assert.throws(() => main(['dist'], without('PRERELEASE'), run), /PRERELEASE must be "true" or "false"/)
  assert.throws(() => main(['dist'], { ...env, PRERELEASE: 'False' }, run), /PRERELEASE must be "true" or "false"/)
  assert.throws(() => main(['dist'], { ...env, PRERELEASE: '' }, run), /PRERELEASE must be "true" or "false"/)
  assert.throws(() => main(['dist'], without('GITHUB_REF_NAME'), run), /GITHUB_REF_NAME is not set/)
  assert.throws(() => main(['dist'], without('GITHUB_REPOSITORY'), run), /GITHUB_REPOSITORY is not set/)
  assert.throws(() => main([], env, run), /usage: node scripts\/publish-release\.mjs <artifact directory>/)
})

// The workflow passes the classification as a string, and the string 'false' is truthy
test('the classification in the environment reaches gh: "false" publishes Latest, "true" a pre-release', (t) => {
  const dir = artifactDir('0.2.0', releaseSet('0.2.0'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const assets = ['Agentshed-0.2.0-mac-arm64.dmg', 'Agentshed-0.2.0-mac-arm64.zip', 'Agentshed-0.2.0-mac-arm64.zip.blockmap', 'latest-mac.yml'].map((name) => ({
    name,
    size: 1,
    digest: `sha256:${createHash('sha256').update(readFileSync(join(dir, '0.2.0', name))).digest('hex')}`,
    state: 'uploaded'
  }))
  const sent = (prerelease) => {
    const calls = []
    const answers = [
      '[]',
      '',
      JSON.stringify({ isDraft: true, isPrerelease: prerelease, assets }),
      '',
      JSON.stringify([{ tagName: 'v0.2.0', isDraft: false, isLatest: !prerelease, isPrerelease: prerelease }])
    ]
    main([dir], { GITHUB_REF_NAME: 'v0.2.0', GITHUB_REPOSITORY: 'aloong-planet/agentshed', PRERELEASE: String(prerelease) }, (args) => {
      calls.push(args)
      return { stdout: answers[calls.length - 1] }
    })
    return { create: calls.find((args) => args[1] === 'create'), edit: calls.find((args) => args[1] === 'edit') }
  }
  const formal = sent(false)
  assert.ok(!formal.create.includes('--prerelease'))
  assert.ok(formal.edit.includes('--latest'))
  const pre = sent(true)
  assert.ok(pre.create.includes('--prerelease'))
  assert.ok(pre.edit.includes('--latest=false'))
  assert.ok(!pre.edit.includes('--latest'))
})
