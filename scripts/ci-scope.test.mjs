// CI routing rules. Paths come from the repository's tracked tree; expected scopes come from
// ci-routing::REQ-001. GitHub scheduling itself is covered by the PR run, not these local tests.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPaths, comparisonForEvent } from './ci-scope.mjs'

test('changes select the affected products and retain a reason for every path', () => {
  const cases = [
    [[], false, false],
    [['README.md', 'README.en.md', 'AGENTS.md', 'CLAUDE.md', 'LICENSE'], false, false],
    [['docs/specs/landing-page.md', 'docs/ops/mac-signing.md'], false, false],
    [['docs/prototypes/landing-page/prototype-landing.html', 'docs/prototypes/_shared/copy.js'], false, false],
    [['site/README.md', 'build/README.md'], false, false],
    [['site/src/pages/index.astro'], false, true],
    [['site/public/shots/hero-en.png'], false, true],
    [['site/package.json', 'site/pnpm-lock.yaml', 'site/test/build-site.ts'], false, true],
    [['site/src/content/intro.md'], false, true],
    [['src/main/index.ts', 'src/main/fixture.md'], true, false],
    [['e2e/support/launch.ts', 'playwright.config.ts'], true, false],
    [['build/mac-packaging.cjs', 'scripts/release-tag.mjs'], true, false],
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

test('event comparisons use the complete PR branch or the push endpoints and reject missing inputs', () => {
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  assert.equal(comparisonForEvent('pull_request', { pull_request: { base: { sha: a }, head: { sha: b } } }), `${a}...${b}`)
  assert.equal(comparisonForEvent('push', { before: a, after: b }), `${a}..${b}`)
  assert.equal(comparisonForEvent('push', { before: '0'.repeat(40), after: b }), null)
  for (const [name, event] of [
    ['workflow_dispatch', {}], ['push', {}], ['pull_request', { before: a, after: b }],
    ['push', { before: '--bad-option', after: b }], ['push', { before: a, after: '0'.repeat(40) }],
    ['pull_request', { pull_request: { base: { sha: '0'.repeat(40) }, head: { sha: b } } }]
  ]) assert.throws(() => comparisonForEvent(name, event), /event|SHA/)
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

test('the CLI carries real PR and push diffs, moves, deletions and large path sets into workflow outputs', () => {
  const script = fileURLToPath(new URL('./ci-scope.mjs', import.meta.url))
  const cases = [
    ['pull_request', { pull_request: { base: { sha: advancedBase }, head: { sha: head } } }, 'app=true\nsite=true\n'],
    ['push', { before: products, after: head }, 'app=false\nsite=false\n'],
    ['push', { before: base, after: large }, 'app=true\nsite=false\n'],
    ['push', { before: head, after: head }, 'app=false\nsite=false\n'],
    ['push', { before: '0'.repeat(40), after: head }, 'app=true\nsite=true\n'],
    ['push', { before: 'f'.repeat(40), after: head }, null]
  ]
  for (const [i, [name, event, expected]] of cases.entries()) {
    const eventPath = join(dir, `event-${i}.json`)
    const outputPath = join(dir, `output-${i}`)
    const summaryPath = join(dir, `summary-${i}`)
    writeFileSync(eventPath, JSON.stringify(event))
    const run = spawnSync(process.execPath, [script], {
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
