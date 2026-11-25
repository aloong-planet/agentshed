#!/usr/bin/env node
// The site's app assets: the screenshots and the app icon that Agentshed's website takes from the app. The website
// lives in the aloong-planet-home repository (apps/agentshed/), and its assets change there only through a pull
// request that this command opens (aloong-planet-home app-sites::REQ-004/AC-01).
//
//   pnpm site:assets --shots <directory> [--dry-run] [--title <text>] [--note <text>]
//                    [--remote <git url>] [--repo <owner/name>] [--base <branch>]
//
// What it does, in order:
//   1. Checks the directory of screenshots: exactly the twelve files <view>-<language>.png (six views, English and
//      Chinese), each a whole PNG of 1840×1035 pixels. Anything missing, extra, damaged or of another size fails the
//      run before anything is cloned, and every problem is listed.
//   2. Scales the app icon, build/icon.png, to the site's two sizes with `sips` (macOS only), as the site's icons
//      have always been made.
//   3. Clones the website repository's base branch into a new temporary directory, writes the fourteen files at
//      their paths under apps/agentshed/public/, stages exactly those paths, and refuses to go on when anything
//      else is changed or staged. When no byte changed, it says so and opens nothing.
//   4. Commits on a new branch assets/agentshed-<date>-<source commit>, pushes it and opens the pull request with `gh`,
//      whose body names the commit of this repository the assets come from. With --dry-run it stops after the local
//      commit, prints what it would send, and keeps the clone for inspection.
//
// The screenshots are taken from the app by hand and not by this command. Four groups of them show the owner's own
// data, approved for publication on 2026-10-13 (overview, project, tokens, and the Chinese session cut); the memory,
// search and English session cuts show made-up data. The icon source must be committed: the pull request names this repository's HEAD as the source, so a
// changed but uncommitted build/icon.png would be described by a commit that does not hold it.
//
// --title and --note replace the pull request's title and add a line at the top of its body, for a run whose pull
// request is not meant to be merged. Needs: git, gh logged in with access to the website repository, and on macOS
// sips. Exit code 0 when the pull request is opened, the dry run is done or nothing changed, 1 otherwise.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VIEWS = ['overview', 'project', 'memory', 'tokens', 'session', 'search']
export const LANGUAGES = ['en', 'zh']
export const SHOT_SIZE = { width: 1840, height: 1035 }
export const ICON_SIZES = [64, 256]
export const ASSET_DIR = 'apps/agentshed/public'

export const DEFAULT_REMOTE = 'https://github.com/aloong-planet/aloong-planet-home.git'
export const DEFAULT_REPO = 'aloong-planet/aloong-planet-home'
export const DEFAULT_BASE = 'main'

const here = dirname(fileURLToPath(import.meta.url))

/** The screenshot files the site shows, by name */
export const SHOT_NAMES = VIEWS.flatMap((view) => LANGUAGES.map((language) => `${view}-${language}.png`))

/** Every path the pull request may change, relative to the website repository's root */
export const ASSET_PATHS = [
  ...SHOT_NAMES.map((name) => `${ASSET_DIR}/shots/${name}`),
  ...ICON_SIZES.map((size) => `${ASSET_DIR}/icon-${size}.png`)
]

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])

/** The size a PNG's header gives, or the reason it is not a whole PNG */
export function pngSize(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    return { problem: 'is not a PNG' }
  }
  if (!bytes.subarray(bytes.length - PNG_END.length).equals(PNG_END)) return { problem: 'is cut short: it does not end with the PNG end chunk' }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** The names of the usable screenshots of a directory, and every problem with the directory, one sentence each */
export function readShots(dir) {
  const problems = []
  let entries = []
  try {
    entries = readdirSync(dir).filter((name) => name !== '.DS_Store').sort()
  } catch (error) {
    return { shots: [], problems: [`${dir} cannot be read: ${error.code ?? error.message}`] }
  }
  for (const name of SHOT_NAMES) if (!entries.includes(name)) problems.push(`${name} is missing`)
  for (const name of entries) if (!SHOT_NAMES.includes(name)) problems.push(`${name} is not one of the site's screenshots`)
  const shots = []
  for (const name of SHOT_NAMES.filter((n) => entries.includes(n))) {
    const size = pngSize(readFileSync(join(dir, name)))
    if (size.problem) problems.push(`${name} ${size.problem}`)
    else if (size.width !== SHOT_SIZE.width || size.height !== SHOT_SIZE.height) {
      problems.push(`${name} is ${size.width}×${size.height}, not ${SHOT_SIZE.width}×${SHOT_SIZE.height}`)
    } else shots.push(name)
  }
  return { shots, problems }
}

/** Throws when a staged or changed path is not one of the site's assets */
export function assertOnlyAssets(paths) {
  const stray = paths.filter((path) => !ASSET_PATHS.includes(path))
  if (stray.length > 0) throw new Error(`refusing to go on: ${stray.length} changed path(s) are not the site's assets: ${stray.join(', ')}`)
}

/** The app icon at one size, made as the site's icons always were: `sips -z <n> <n> <source> --out <dest>` */
export function sipsScale(source, size, dest) {
  if (process.platform !== 'darwin') throw new Error('scaling the icon needs sips, which only macOS has')
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', dest], { stdio: 'pipe' })
}

function parseArgs(argv) {
  const options = { dryRun: false, remote: DEFAULT_REMOTE, repo: DEFAULT_REPO, base: DEFAULT_BASE }
  const valued = { '--shots': 'shots', '--title': 'title', '--note': 'note', '--remote': 'remote', '--repo': 'repo', '--base': 'base' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg in valued) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`)
      options[valued[arg]] = argv[++i]
    } else throw new Error(`unknown option ${arg}`)
  }
  if (!options.shots) throw new Error('--shots <directory> is required: the folder of the twelve retaken screenshots')
  return options
}

/** Runs a command and returns its output; a failing command throws with its error output in the message */
export function runCommand(command, args, { cwd } = {}) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const output = `${error.stderr ?? ''}`.trim()
    throw new Error(`${command} ${args.join(' ')} failed${output ? `: ${output}` : ''}`, { cause: error })
  }
}

const defaults = {
  run: runCommand,
  scaleIcon: sipsScale,
  root: resolve(here, '..'),
  now: () => new Date()
}

const lines = (text) => text.split('\n').filter(Boolean)

/** The first branch name <base>, <base>-2, ... that the remote does not have */
function freeBranch(run, cwd, base) {
  for (let n = 1; n < 50; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`
    if (run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${name}`], { cwd }).trim() === '') return name
  }
  throw new Error(`the remote already has ${base} and 48 numbered variants`)
}

function pullRequestText({ options, source, changed }) {
  const title = options.title ?? `Update Agentshed's site screenshots and icon (agentshed ${source.slice(0, 7)})`
  const body = [
    ...(options.note ? [options.note, ''] : []),
    `Opened by \`pnpm site:assets\` in aloong-planet/agentshed, from its commit ${source}.`,
    '',
    `Changed files (${changed.length}), all of them app assets of the Agentshed site:`,
    ...changed.map((path) => `- ${path}`),
    '',
    `Nothing else is in this pull request: the screenshots under ${ASSET_DIR}/shots/ and the icons ${ASSET_DIR}/icon-64.png and icon-256.png are the only paths the command writes, and it refuses to go on when anything else is changed.`
  ].join('\n')
  return { title, body }
}

/** Runs the command; resolves to the exit code. `deps` replaces the system boundary in tests. */
export async function main(argv, deps = {}) {
  const { run, scaleIcon, root, now, log = console.log } = { ...defaults, ...deps }
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(error.message)
    return 1
  }

  const shotsDir = resolve(options.shots)
  const { shots, problems } = readShots(shotsDir)
  if (problems.length > 0) {
    log(`the screenshots in ${options.shots} cannot be used:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    return 1
  }

  const iconSource = join(root, 'build', 'icon.png')
  if (!existsSync(iconSource)) {
    log(`the app icon ${iconSource} does not exist`)
    return 1
  }
  if (run('git', ['status', '--porcelain', '--', 'build/icon.png'], { cwd: root }).trim() !== '') {
    log('build/icon.png has uncommitted changes: commit it first, so that the pull request names a commit that holds the icon it carries')
    return 1
  }
  const source = run('git', ['rev-parse', 'HEAD'], { cwd: root }).trim()

  const work = mkdtempSync(join(tmpdir(), 'site-assets-'))
  let keep = options.dryRun
  try {
    const home = join(work, 'home')
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', options.base, '--single-branch', options.remote, home])
    const stamp = now().toISOString().slice(0, 10).replaceAll('-', '')
    const branch = freeBranch(run, home, `assets/agentshed-${stamp}-${source.slice(0, 7)}`)
    run('git', ['switch', '--quiet', '-c', branch], { cwd: home })

    mkdirSync(join(home, ASSET_DIR, 'shots'), { recursive: true })
    for (const name of shots) copyFileSync(join(shotsDir, name), join(home, ASSET_DIR, 'shots', name))
    for (const size of ICON_SIZES) scaleIcon(iconSource, size, join(home, ASSET_DIR, `icon-${size}.png`))

    // Everything git sees as changed must be an asset before anything is staged; what is staged is then the assets alone,
    // since `git add` is given those paths and no others
    const status = lines(run('git', ['status', '--porcelain', '--untracked-files=all', '-z'], { cwd: home }).replaceAll('\0', '\n')).map((l) => l.slice(3))
    assertOnlyAssets(status)
    run('git', ['add', '--', ...ASSET_PATHS.filter((path) => existsSync(join(home, path)))], { cwd: home })
    const changed = lines(run('git', ['diff', '--cached', '--name-only'], { cwd: home }))
    if (changed.length === 0) {
      keep = false
      log(`the site's assets are already what ${options.shots} and build/icon.png give: nothing to send`)
      return 0
    }

    const { title, body } = pullRequestText({ options, source, changed })
    run('git', ['commit', '--quiet', '-m', title, '-m', body], { cwd: home })
    if (options.dryRun) {
      log(`dry run: committed ${changed.length} file(s) on ${branch} in ${home}, nothing pushed:\n${changed.map((p) => `  ${p}`).join('\n')}`)
      log(`title: ${title}\nbody:\n${body}`)
      return 0
    }
    // Several images are more than git's default 1 MiB HTTP buffer, and a push that does not fit it is answered with HTTP 400
    run('git', ['-c', 'http.postBuffer=524288000', 'push', '--quiet', 'origin', branch], { cwd: home })
    const url = run('gh', ['pr', 'create', '--repo', options.repo, '--base', options.base, '--head', branch, '--title', title, '--body', body], { cwd: home }).trim()
    log(`opened ${url}`)
    return 0
  } catch (error) {
    keep = true
    log(`failed: ${error.message}\n  (the clone is kept in ${work})`)
    return 1
  } finally {
    if (!keep) rmSync(work, { recursive: true, force: true })
  }
}

function isMain() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMain()) process.exitCode = await main(process.argv.slice(2))
