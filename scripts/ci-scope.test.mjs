// CI routing rules. Paths come from the repository's tracked tree; expected scopes come from
// ci-routing::REQ-001, and the local commands' declarations from ci-routing::REQ-005. GitHub scheduling itself
// is covered by the PR run, not these local tests.
// Gap: what a real push to main selects on the hosted runner. A pull request's own run is a pull_request
// event, so that shows only in the default-branch run after a merge, as does a newer push cancelling it.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPaths, collectChanges, comparisonForEvent, localCommand, localLine, localReadFailures } from './ci-scope.mjs'

const pr = (from, to) => ({ pull_request: { base: { sha: from }, head: { sha: to } } })

test('changes select the affected products and retain a reason for every path', () => {
  const cases = [
    [[], false, false],
    [['README.md', 'README.en.md', 'AGENTS.md', 'CLAUDE.md', 'LICENSE'], false, false],
    [['docs/specs/landing-page.md', 'docs/ops/mac-signing.md'], false, false],
    [['docs/prototypes/landing-page/prototype-landing.html', 'docs/prototypes/_shared/copy.js'], false, false],
    [['site/README.md', 'build/README.md'], false, false],
    [['site/src/pages/index.astro'], false, true],
    [['site/public/shots/overview-en.png'], false, true],
    [['site/package.json', 'site/pnpm-lock.yaml', 'site/test/build-site.ts'], false, true],
    [['site/src/content/intro.md'], false, true],
    [['src/main/index.ts', 'src/main/fixture.md'], true, false],
    [['e2e/support/launch.ts', 'playwright.config.ts'], true, false],
    [['build/mac-packaging.cjs', 'scripts/release-tag.mjs'], true, false],
    [['engine/src/lib.rs', 'engine/Cargo.lock', 'engine/rust-toolchain.toml'], true, false],
    [['electron-builder.yml', 'electron.vite.config.ts', 'tsconfig.node.json', 'vitest.config.ts'], true, false],
    [['src/renderer/src/theme.css'], true, true],
    [['src/main/index.ts', 'site/src/download.ts', 'README.md'], true, true],
    [['package.json'], true, true],
    [['pnpm-lock.yaml'], true, true],
    [['eslint.config.js'], true, true],
    [['scripts/testing/workflow.mjs'], true, true],
    [['capabilities.toml'], true, true],
    [['.github/workflows/ci.yml'], true, true],
    [['scripts/ci-scope.mjs', 'scripts/ci-gate.test.mjs'], true, true],
    [['new-package/index.js'], true, true],
    [['docs/new-tool.js'], true, true],
    [['site/a file\nwith newline.ts'], false, true]
  ]
  for (const [paths, app, site] of cases) {
    const actual = classifyPaths(paths)
    assert.equal(actual.app, app, JSON.stringify(paths))
    assert.equal(actual.site, site, JSON.stringify(paths))
    assert.ok(actual.reasons.length > 0)
    for (const path of paths) assert.ok(actual.reasons.some((reason) => reason.includes(JSON.stringify(path))))
  }
  assert.match(classifyPaths(['new-package/index.js']).reasons.join('\n'), /Unknown/)
})

test('invalid path lists fail rather than becoming documentation-only changes', () => {
  for (const paths of [null, {}, 'src/main/index.ts', [''], [null], ['/src/main.ts'], ['../site/a.ts'], ['site/./a.ts'], ['site/a\0.ts']]) {
    assert.throws(() => classifyPaths(paths), /path/i)
  }
})

test('event comparisons use the complete PR branch and reject unsupported events and malformed commits', () => {
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  assert.equal(comparisonForEvent('pull_request', pr(a, b)), `${a}...${b}`)
  // The unsupported event carries commits a pull request would be accepted with, so only its name can reject it
  for (const [name, event] of [
    ['pull_request_target', pr(a, b)], ['pull_request', { before: a, after: b }],
    ['pull_request', pr('0'.repeat(40), b)], ['pull_request', pr(a, '0'.repeat(40))],
    ['pull_request', pr('--bad-option', b)]
  ]) assert.throws(() => comparisonForEvent(name, event), /event|SHA/)
})

// ci-routing::REQ-001/AC-06. Commits no repository holds, no commits named, and equal endpoints: a push is
// neither compared nor checked, so none of them can fail or narrow the selection.
test('a push selects both products whatever its event names, without reading a comparison', () => {
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  for (const event of [{ before: a, after: b }, {}, { before: a, after: a }]) {
    const actual = collectChanges('push', event)
    assert.equal(actual.app, true, JSON.stringify(event))
    assert.equal(actual.site, true, JSON.stringify(event))
    assert.ok(actual.reasons.length > 0)
  }
})

// ci-routing::REQ-005/AC-02
test('the routing accepts no arguments, or one --local-command with a command, and refuses any other list', () => {
  assert.equal(localCommand([]), null)
  assert.equal(localCommand(['--local-command', 'pnpm smoke']), 'pnpm smoke')
  for (const argv of [['--bogus'], ['pnpm smoke'], ['--local-command'], ['--local-command', ''], ['--local-command', 'pnpm smoke', 'pnpm e2e']]) {
    assert.throws(() => localCommand(argv), /argument/, JSON.stringify(argv))
  }
})

// ci-routing::REQ-005/AC-01 and ci-routing::REQ-005/AC-03: the CI's call (null), an undeclared command and one
// that differs from the declared command by a trailing space add nothing.
test('a local call adds the scope of the command it names only where that command is declared exactly', () => {
  for (const [command, line] of [[null, ''], ['pnpm smoke', 'local-scope=app\n'], ['pnpm e2e', ''], ['pnpm smoke ', '']]) {
    assert.equal(localLine(command), line, JSON.stringify(command))
  }
})

// ci-routing::REQ-005/AC-04, and ci-routing::REQ-005/AC-01 for the scope a command is declared under. The theme
// stylesheet selects both scopes, so the passing list shows that a file of every scope is accepted; the site/ and
// docs/ entries hold a file of the other scope and a file of none. Where a row gives its own declarations, a
// command under site passes on a site file, and "reasons", a field of the routing's result but not a scope, fails.
test('the check fails a command declared under no scope of the routing, and any file it reads that does not select its scope', () => {
  const tracked = ['src/main/index.ts', 'src/renderer/src/theme.css', 'site/src/pages/index.astro', 'docs/specs/ci-routing.md', 'package.json', 'scripts/smoke.sh']
  for (const [reads, failures, local] of [
    [{ 'pnpm smoke': ['src/', 'package.json', 'scripts/smoke.sh'] }, []],
    [{}, ['"pnpm smoke" is declared but lists no files it reads']],
    [{ 'pnpm smoke': ['src/'], 'pnpm e2e': ['src/'] }, ['"pnpm e2e" is not declared']],
    [{ 'pnpm smoke': [] }, ['"pnpm smoke" lists no files it reads']],
    [{ 'pnpm smoke': 'src/' }, ['"pnpm smoke" lists no files it reads']],
    [{ 'pnpm smoke': ['src/', 'scripts/missing.sh'] }, ['"scripts/missing.sh" matches no tracked path']],
    [{ 'pnpm smoke': ['src'] }, ['"src" matches no tracked path']],
    [{ 'pnpm smoke': ['site/'] }, ['"site/src/pages/index.astro" does not select app']],
    [{ 'pnpm smoke': ['docs/'] }, ['"docs/specs/ci-routing.md" does not select app']],
    [{ 'pnpm site': ['site/'] }, [], new Map([['pnpm site', 'site']])],
    [{ 'pnpm smoke': ['src/main/index.ts'] }, [
      '"pnpm smoke" is declared under "reasons", which is not a scope of the routing',
      '"src/main/index.ts" does not select reasons'
    ], new Map([['pnpm smoke', 'reasons']])]
  ]) assert.deepEqual(localReadFailures(reads, tracked, local), failures, JSON.stringify(reads))
})

// What `pnpm smoke` reads, judged for every top-level entry of `git ls-files`. package.json runs
// `bash scripts/smoke.sh`, and pnpm reads pnpm-lock.yaml with it. smoke.sh runs scripts/quiet-electron.sh, which
// copies only the untracked Electron binary, and `pnpm dev`, which is `node scripts/build-engine.mjs --quiet &&
// electron-vite dev`. build-engine.mjs imports nothing but scripts/lib/engine-build.mjs and Node's own modules,
// and cargo builds every tracked file under engine/ (Cargo.toml, Cargo.lock, build.rs, rust-toolchain.toml and
// src/). electron-vite reads electron.vite.config.ts, which imports scripts/lib/engine-build.mjs, and the three
// tsconfig files, and builds src/. In development the main process reads build/icon-dev.png.
// Not read: .github/, .gitignore, .husky/, AGENTS.md, CLAUDE.md, LICENSE, README.md, README.en.md,
// capabilities.toml, docs/, e2e/, electron-builder.yml, eslint.config.js, playwright.config.ts,
// vitest.config.ts, site/, and the rest of build/ and scripts/. A scan of the import, url, src and href
// specifiers in the tracked files under src/ found one that leaves src/, from a test file, which smoke does not
// run; the main process's other reads of the repository are its own build output, which is not tracked.
// Gap: the list is as complete as this enumeration. A file smoke starts to read outside these entries fails
// nothing here until the list names it.
const SMOKE_READS = {
  'pnpm smoke': [
    'package.json', 'pnpm-lock.yaml', 'scripts/smoke.sh', 'scripts/quiet-electron.sh', 'scripts/build-engine.mjs',
    'scripts/lib/engine-build.mjs', 'engine/', 'electron.vite.config.ts', 'tsconfig.json', 'tsconfig.node.json',
    'tsconfig.web.json', 'src/', 'build/icon-dev.png'
  ]
}

// ci-routing::REQ-005/AC-04
test('every tracked file pnpm smoke reads selects the application scope', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', '--full-name', '--', ':/'], {
    cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  }).split('\0').filter(Boolean)
  assert.ok(tracked.includes('scripts/ci-scope.mjs'), 'the tracked paths are the repository root\'s')
  assert.deepEqual(localReadFailures(SMOKE_READS, tracked), [])
})

// One immutable Git history for the CLI wiring cases; no application build or network is involved.
const dir = mkdtempSync(join(tmpdir(), 'agentshed-ci-scope-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const put = (path, text = 'fixture\n') => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
git('init', '-q')
git('config', 'user.name', 'CI routing test')
git('config', 'user.email', 'ci-test@example.invalid')
git('config', 'commit.gpgsign', 'false')
git('config', 'core.hooksPath', join(dir, 'no-hooks'))
put('src/main/deleted.ts')
put('src/main/moved.ts')
git('add', '.')
git('commit', '-qm', 'base')
const base = git('rev-parse', 'HEAD')
rmSync(join(dir, 'src/main/deleted.ts'))
mkdirSync(join(dir, 'docs/prototypes'), { recursive: true })
renameSync(join(dir, 'src/main/moved.ts'), join(dir, 'docs/prototypes/moved.ts'))
put('site/space and\nnewline.ts')
git('add', '-A')
git('commit', '-qm', 'product changes')
const products = git('rev-parse', 'HEAD')
put('README.md')
git('add', '.')
git('commit', '-qm', 'documentation afterwards')
const head = git('rev-parse', 'HEAD')
git('checkout', '-q', '--detach', base)
put('new-main-only.js')
git('add', '.')
git('commit', '-qm', 'base advances independently')
const advancedBase = git('rev-parse', 'HEAD')
git('checkout', '-q', '--detach', base)
for (let i = 0; i < 3001; i++) put(`docs/large/${i}.md`)
put('src/main/last.ts')
git('add', '.')
git('commit', '-qm', 'large change set')
const large = git('rev-parse', 'HEAD')

test('the CLI carries real PR diffs, moves, deletions and large path sets into workflow outputs, both products for a push, and a local call\'s declared scope', () => {
  const script = fileURLToPath(new URL('./ci-scope.mjs', import.meta.url))
  const cases = [
    ['pull_request', pr(advancedBase, head), 'app=true\nsite=true\n'],
    // The pushed commit adds README.md alone: both products cannot come from its paths (ci-routing::REQ-001/AC-06)
    ['push', { before: products, after: head }, 'app=true\nsite=true\n'],
    ['pull_request', pr(base, large), 'app=true\nsite=false\n'],
    ['pull_request', pr(head, head), 'app=false\nsite=false\n'],
    ['pull_request', pr('f'.repeat(40), head), null],
    // ci-routing::REQ-005/AC-01: the declared command's line follows the scope lines, here where its scope is not
    // selected; an undeclared command adds none. ci-routing::REQ-005/AC-02: an unknown argument writes nothing.
    ['pull_request', pr(head, head), 'app=false\nsite=false\nlocal-scope=app\n', ['--local-command', 'pnpm smoke']],
    ['pull_request', pr(head, head), 'app=false\nsite=false\n', ['--local-command', 'pnpm e2e']],
    ['pull_request', pr(head, head), null, ['--bogus']]
  ]
  for (const [i, [name, event, expected, args = []]] of cases.entries()) {
    const eventPath = join(dir, `event-${i}.json`)
    const outputPath = join(dir, `output-${i}`)
    const summaryPath = join(dir, `summary-${i}`)
    writeFileSync(eventPath, JSON.stringify(event))
    const run = spawnSync(process.execPath, [script, ...args], {
      cwd: dir, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath, GITHUB_STEP_SUMMARY: summaryPath }
    })
    if (expected === null) {
      assert.equal(run.status, 1, run.stderr)
      assert.equal(existsSync(outputPath), false)
    } else {
      assert.equal(run.status, 0, run.stderr)
      assert.equal(readFileSync(outputPath, 'utf8'), expected)
      assert.match(readFileSync(summaryPath, 'utf8'), /Application checks:/)
    }
    if (i === 0) {
      assert.match(run.stdout, /src\/main\/deleted\.ts/)
      assert.match(run.stdout, /src\/main\/moved\.ts/)
      assert.match(run.stdout, /docs\/prototypes\/moved\.ts/)
      assert.ok(run.stdout.includes('site/space and\\nnewline.ts'))
      assert.ok(!run.stdout.includes('new-main-only.js'))
    }
  }
})
