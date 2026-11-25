// The command that sends the site's app assets to the website repository (scripts/site-assets.mjs): what it refuses
// before it touches anything, what it sends when an asset changed, and that what it sends is the assets alone.
//
// The website repository is a bare repository on disk, cloned through a file:// URL so that `--depth` works as it does
// against GitHub; Agentshed's own repository is a scratch repository holding build/icon.png; git runs for real in both.
// What stands in for the system boundary: `gh` (the pull request is a recorded call), and `sips` (a function that
// makes bytes from the icon and the size), except in the one case that runs the real `sips` on macOS.
//
// Gap: nothing here reaches GitHub. `git push` to github.com and `gh pr create` run for real only in a run of the
// command itself; the evidence run recorded in the delivery of the pull request that added it is the one such run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_DIR, ASSET_PATHS, DEFAULT_REPO, ICON_SIZES, SHOT_NAMES, SHOT_SIZE, assertOnlyAssets, main, pngSize, readShots, runCommand, sipsScale
} from './site-assets.mjs'

// No test reads the machine's git configuration: a signing key or a commit template there must not change a run
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com'
})

const scratch = []
const dir = (name) => {
  const path = mkdtempSync(join(tmpdir(), `site-assets-test-${name}-`))
  scratch.push(path)
  return path
}
test.after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })))

const git = (cwd, ...args) => runCommand('git', args, { cwd }).trim()

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])

/** The bytes of a PNG that has a header of this size and an end chunk, and a body that tells one picture from another */
function png(width, height, picture = '') {
  const header = Buffer.alloc(33)
  PNG_SIGNATURE.copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'latin1')
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return Buffer.concat([header, Buffer.from(picture), PNG_END])
}
const shot = (name, picture = name) => png(SHOT_SIZE.width, SHOT_SIZE.height, picture)

/** A directory with every screenshot, `picture` naming what each one shows (by default, its own name) */
function shotsDir(overrides = {}) {
  const path = dir('shots')
  for (const name of SHOT_NAMES) writeFileSync(join(path, name), overrides[name] ?? shot(name))
  return path
}

/** The icon the fake `sips` makes from the source's bytes: it depends on both the bytes and the size */
const fakeScale = (source, size, dest) => writeFileSync(dest, Buffer.concat([Buffer.from(`icon ${size}:`), readFileSync(source)]))

/** Agentshed's repository, as far as the command reads it: a commit holding build/icon.png */
function agentshed(icon = 'ICON v1') {
  const root = dir('agentshed')
  git(root, 'init', '--quiet', '--initial-branch=main')
  mkdirSync(join(root, 'build'))
  writeFileSync(join(root, 'build', 'icon.png'), icon)
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'icon')
  return root
}

/** The website repository: a bare repository whose main holds every asset as the command would write it from `icon` */
function website({ icon = 'ICON v1', pictures = {}, branch = 'main' } = {}) {
  const bare = join(dir('website'), 'website.git')
  git(dirname(bare), 'init', '--quiet', '--bare', `--initial-branch=${branch}`, bare)
  const work = dir('website-work')
  git(work, 'init', '--quiet', `--initial-branch=${branch}`)
  mkdirSync(join(work, ASSET_DIR, 'shots'), { recursive: true })
  for (const name of SHOT_NAMES) writeFileSync(join(work, ASSET_DIR, 'shots', name), pictures[name] ?? shot(name))
  const source = join(dir('icon-source'), 'icon.png')
  writeFileSync(source, icon)
  for (const size of ICON_SIZES) fakeScale(source, size, join(work, ASSET_DIR, `icon-${size}.png`))
  mkdirSync(join(work, 'apps', 'home'), { recursive: true })
  writeFileSync(join(work, 'apps', 'home', 'index.html'), '<p>the homepage</p>')
  git(work, 'add', '.')
  git(work, 'commit', '--quiet', '-m', 'the website repository')
  git(work, 'push', '--quiet', bare, branch)
  return { bare, url: `file://${bare}` }
}

/** A run of the command with the pull request recorded and `sips` faked; resolves to what it printed and sent */
async function send(argv, { root = agentshed(), site = website(), fakeGh, scaleIcon = fakeScale } = {}) {
  const printed = []
  const prs = []
  const run = (command, args, options) => {
    if (command !== 'gh') return runCommand(command, args, options)
    prs.push(args)
    if (fakeGh) return fakeGh(args)
    return 'https://github.com/aloong-planet/aloong-planet-home/pull/1\n'
  }
  const code = await main([...argv, '--remote', site.url], {
    root, run, scaleIcon, log: (text) => printed.push(text), now: () => new Date('2026-11-25T10:00:00Z')
  })
  return { code, printed: printed.join('\n'), prs, site, root }
}

const branches = (site) => git(site.bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').sort()
const changedBy = (site, branch) => git(site.bare, 'diff', '--name-only', `main...${branch}`).split('\n').filter(Boolean)
const pathOf = (name) => `${ASSET_DIR}/shots/${name}`

test('the site shows twelve screenshots, six views in two languages, and two icons', () => {
  assert.equal(SHOT_NAMES.length, 12)
  assert.deepEqual(SHOT_NAMES.filter((name) => name.endsWith('-en.png')).map((name) => name.replace('-en.png', '')),
    ['overview', 'project', 'memory', 'tokens', 'session', 'search'])
  assert.deepEqual(ASSET_PATHS.filter((path) => path.includes('icon-')), [`${ASSET_DIR}/icon-64.png`, `${ASSET_DIR}/icon-256.png`])
  assert.equal(ASSET_PATHS.length, 14)
})

test('a PNG is read for its size, and a file that is no whole PNG is named for what is wrong with it', () => {
  assert.deepEqual(pngSize(png(1840, 1035)), { width: 1840, height: 1035 })
  assert.match(pngSize(Buffer.from('GIF89a, not a PNG at all, but long enough to have a header to read')).problem, /not a PNG/)
  assert.match(pngSize(png(1840, 1035).subarray(0, 40)).problem, /cut short/)
  assert.match(pngSize(Buffer.alloc(0)).problem, /not a PNG/)
})

test('the screenshots are checked as a set: each one that is missing, extra, damaged or of another size is a problem of its own', () => {
  assert.deepEqual(readShots(shotsDir()).problems, [])
  assert.equal(readShots(shotsDir()).shots.length, 12)

  const incomplete = shotsDir()
  rmSync(join(incomplete, 'memory-zh.png'))
  writeFileSync(join(incomplete, 'hero-en.png'), shot('hero'))
  writeFileSync(join(incomplete, 'search-en.png'), png(1800, 1000))
  writeFileSync(join(incomplete, 'tokens-en.png'), 'not a picture')
  writeFileSync(join(incomplete, 'session-zh.png'), png(1840, 1035).subarray(0, 40))
  assert.deepEqual(readShots(incomplete).problems, [
    'memory-zh.png is missing',
    'hero-en.png is not one of the site\'s screenshots',
    'tokens-en.png is not a PNG',
    'session-zh.png is cut short: it does not end with the PNG end chunk',
    'search-en.png is 1800×1000, not 1840×1035'
  ])
  assert.equal(readShots(incomplete).shots.length, 8)

  // The Finder's file is no screenshot and no problem
  const finder = shotsDir()
  writeFileSync(join(finder, '.DS_Store'), 'x')
  assert.deepEqual(readShots(finder).problems, [])
  assert.match(readShots(join(finder, 'nowhere')).problems[0], /cannot be read: ENOENT/)
})

test('only the site\'s assets may be changed', () => {
  assertOnlyAssets(ASSET_PATHS)
  assertOnlyAssets([])
  for (const stray of [
    'apps/home/index.html', 'apps/agentshed/src/i18n/ui.ts', `${ASSET_DIR}/shots/extra.png`, `${ASSET_DIR}/shots/../../src/x.js`,
    `${ASSET_DIR}/media/agentshed-intro-poster.jpg`, 'README.md'
  ]) {
    assert.throws(() => assertOnlyAssets([ASSET_PATHS[0], stray]), (error) => error.message.includes(stray), stray)
  }
})

test('shots that cannot be used stop the run before anything is cloned', async () => {
  const calls = []
  const incomplete = shotsDir()
  rmSync(join(incomplete, 'overview-en.png'))
  const site = website()
  const printed = []
  const code = await main(['--shots', incomplete, '--remote', site.url], {
    root: agentshed(), run: (...call) => { calls.push(call[0]); return runCommand(...call) }, scaleIcon: fakeScale, log: (text) => printed.push(text)
  })
  assert.equal(code, 1)
  assert.match(printed.join('\n'), /overview-en\.png is missing/)
  assert.deepEqual(calls, [], 'no command ran')
})

test('options that make no sense are refused', async () => {
  assert.equal(await main([]), 1)
  assert.equal(await main(['--shots']), 1)
  assert.equal(await main(['--shots', 'x', '--frobnicate']), 1)
})

test('an icon source with uncommitted changes stops the run', async () => {
  const root = agentshed()
  writeFileSync(join(root, 'build', 'icon.png'), 'ICON v2, not committed')
  const result = await send(['--shots', shotsDir()], { root })
  assert.equal(result.code, 1)
  assert.match(result.printed, /build\/icon\.png has uncommitted changes/)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
})

test('when no asset changed, nothing is pushed and no pull request is opened', async () => {
  const result = await send(['--shots', shotsDir()])
  assert.equal(result.code, 0)
  assert.match(result.printed, /nothing to send/)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
})

test('a retaken screenshot is sent as one branch and one pull request that change that file alone', async () => {
  const result = await send(['--shots', shotsDir({ 'tokens-en.png': shot('tokens-en.png', 'retaken') })])
  assert.equal(result.code, 0)
  const head = git(result.root, 'rev-parse', 'HEAD')
  const branch = `assets/agentshed-20261125-${head.slice(0, 7)}`
  assert.deepEqual(branches(result.site), [branch, 'main'])
  assert.deepEqual(changedBy(result.site, branch), [pathOf('tokens-en.png')])
  assert.equal(git(result.site.bare, 'rev-list', '--count', `main..${branch}`), '1')

  assert.equal(result.prs.length, 1)
  const [pr] = result.prs
  const arg = (flag) => pr[pr.indexOf(flag) + 1]
  assert.deepEqual(pr.slice(0, 2), ['pr', 'create'])
  assert.equal(arg('--repo'), DEFAULT_REPO)
  assert.equal(arg('--base'), 'main')
  assert.equal(arg('--head'), branch)
  assert.equal(arg('--title'), `Update Agentshed's site screenshots and icon (agentshed ${head.slice(0, 7)})`)
  assert.match(arg('--body'), new RegExp(`from its commit ${head}`))
  assert.match(arg('--body'), /Changed files \(1\)/)
  assert.ok(arg('--body').includes(`- ${pathOf('tokens-en.png')}`))
  assert.match(result.printed, /opened https:\/\/github\.com\/aloong-planet\/aloong-planet-home\/pull\/1/)
  // The commit's own message says the same as the pull request
  assert.match(git(result.site.bare, 'log', '-1', '--format=%B', branch), new RegExp(`from its commit ${head}`))
})

test('a changed app icon sends both icons, and the shots that did not change are not sent', async () => {
  const result = await send(['--shots', shotsDir()], { root: agentshed('ICON v2'), site: website({ icon: 'ICON v1' }) })
  assert.equal(result.code, 0)
  const branch = branches(result.site).find((name) => name !== 'main')
  assert.deepEqual(changedBy(result.site, branch).sort(), ICON_SIZES.map((size) => `${ASSET_DIR}/icon-${size}.png`).sort())
  assert.equal(git(result.site.bare, 'show', `${branch}:${ASSET_DIR}/icon-64.png`), 'icon 64:ICON v2')
})

test('--title and --note describe a pull request that is not meant to be merged', async () => {
  const result = await send(['--shots', shotsDir({ 'search-zh.png': shot('search-zh.png', 'marked') }), '--title', 'Evidence run: do not merge', '--note', 'An evidence run of the asset command; it will not be merged.'])
  const [pr] = result.prs
  assert.equal(pr[pr.indexOf('--title') + 1], 'Evidence run: do not merge')
  assert.ok(pr[pr.indexOf('--body') + 1].startsWith('An evidence run of the asset command; it will not be merged.\n\nOpened by'))
})

test('a dry run commits locally, sends nothing and keeps the clone for inspection', async (t) => {
  const result = await send(['--shots', shotsDir({ 'project-zh.png': shot('project-zh.png', 'retaken') }), '--dry-run'])
  assert.equal(result.code, 0)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
  const kept = result.printed.match(/in (\S+site-assets-\S+\/home), nothing pushed/)?.[1]
  assert.ok(kept && existsSync(kept), 'the clone is kept and named')
  t.after(() => rmSync(dirname(kept), { recursive: true, force: true }))
  assert.deepEqual(git(kept, 'show', '--name-only', '--format=', 'HEAD').split('\n'), [pathOf('project-zh.png')])
  assert.match(result.printed, /title: Update Agentshed's site screenshots and icon/)
  assert.ok(result.printed.includes(`  ${pathOf('project-zh.png')}`))
})

test('a second run from the same commit on the same day takes the next free branch name', async () => {
  const site = website()
  const root = agentshed()
  const first = await send(['--shots', shotsDir({ 'memory-en.png': shot('memory-en.png', 'once') })], { site, root })
  const second = await send(['--shots', shotsDir({ 'memory-en.png': shot('memory-en.png', 'twice') })], { site, root })
  assert.equal(first.code + second.code, 0)
  const head = git(root, 'rev-parse', 'HEAD').slice(0, 7)
  assert.deepEqual(branches(site), [`assets/agentshed-20261125-${head}`, `assets/agentshed-20261125-${head}-2`, 'main'])
})

test('a file that is not one of the assets stops the run before anything is committed', async () => {
  const stray = (source, size, dest) => {
    fakeScale(source, size, dest)
    writeFileSync(join(dirname(dest), 'extra.png'), 'not an asset')
  }
  const result = await send(['--shots', shotsDir({ 'tokens-en.png': shot('tokens-en.png', 'retaken') })], { scaleIcon: stray })
  assert.equal(result.code, 1)
  assert.match(result.printed, /refusing to go on: 1 changed path\(s\) are not the site's assets: apps\/agentshed\/public\/extra\.png/)
  assert.deepEqual(result.prs, [])
  assert.deepEqual(branches(result.site), ['main'])
  rmSync(result.printed.match(/kept in (\S+)\)/)[1], { recursive: true, force: true })
})

test('--base picks the branch of the website repository that the clone, the commit and the pull request start from', async () => {
  const result = await send(['--shots', shotsDir({ 'search-en.png': shot('search-en.png', 'retaken') }), '--base', 'trunk'], { site: website({ branch: 'trunk' }) })
  assert.equal(result.code, 0)
  const [pr] = result.prs
  assert.equal(pr[pr.indexOf('--base') + 1], 'trunk')
  assert.equal(git(result.site.bare, 'rev-list', '--count', `trunk..${pr[pr.indexOf('--head') + 1]}`), '1')
})

test('a failed pull request is reported, with where the clone was kept', async () => {
  const result = await send(['--shots', shotsDir({ 'tokens-zh.png': shot('tokens-zh.png', 'retaken') })], {
    fakeGh: () => { throw new Error('gh pr create failed: not logged in') }
  })
  assert.equal(result.code, 1)
  assert.match(result.printed, /failed: gh pr create failed: not logged in/)
  const kept = result.printed.match(/kept in (\S+)\)/)?.[1]
  assert.ok(kept && existsSync(kept))
  rmSync(kept, { recursive: true, force: true })
})

test('the real sips makes the icons at the sizes the site uses', { skip: process.platform !== 'darwin' && 'sips is on macOS only' }, () => {
  const icon = fileURLToPath(new URL('../build/icon.png', import.meta.url))
  for (const size of ICON_SIZES) {
    const out = join(dir('sips'), `icon-${size}.png`)
    sipsScale(icon, size, out)
    assert.deepEqual(pngSize(readFileSync(out)), { width: size, height: size })
  }
})
