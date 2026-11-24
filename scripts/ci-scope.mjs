// Product impact for CI. A pull request is routed by its paths: unknown paths select both products;
// documentation is an explicit exception, never a repository-wide Markdown exemption. A push selects both
// products without looking at its paths (ci-routing::REQ-001). Called with `--local-command <command>`, it also
// writes `local-scope=<scope>` for a command declared in LOCAL below, the scope of a test command CI does not
// run (ci-routing::REQ-005).
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SHARED = new Set(['package.json', 'pnpm-lock.yaml', 'eslint.config.js', 'capabilities.toml', '.gitignore', 'scripts/testing/workflow.mjs'])
const APP_CONFIG = new Set(['electron-builder.yml', 'electron.vite.config.ts', 'playwright.config.ts', 'vitest.config.ts', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json'])
const DOCUMENTS = new Set(['AGENTS.md', 'CLAUDE.md', 'LICENSE', 'site/README.md', 'build/README.md'])

export function classifyPaths(paths) {
  if (!Array.isArray(paths)) throw new Error('Changed paths must be an array')
  let app = false
  let site = false
  const reasons = []
  for (const path of paths) {
    if (typeof path !== 'string' || !path || path.includes('\0') || path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Invalid changed path')
    }
    let reason
    if (SHARED.has(path) || path.startsWith('.github/workflows/') || path.startsWith('scripts/ci-') || path === 'src/renderer/src/theme.css') {
      app = site = true
      reason = 'Shared input'
    } else if (DOCUMENTS.has(path) || /^README(?:\.[^/]+)?\.md$/.test(path) || path.startsWith('docs/prototypes/') || (path.startsWith('docs/') && path.endsWith('.md'))) {
      reason = 'Repository policy only'
    } else if (path.startsWith('site/')) {
      site = true
      reason = 'Website'
    } else if (APP_CONFIG.has(path) || ['src/', 'engine/', 'e2e/', 'build/', 'scripts/'].some((prefix) => path.startsWith(prefix))) {
      app = true
      reason = 'Application'
    } else {
      app = site = true
      reason = 'Unknown path: run both products'
    }
    reasons.push(`${reason}: ${JSON.stringify(path)}`)
  }
  return { app, site, reasons: reasons.length ? reasons : ['No changed paths; repository policy still runs'] }
}

export function comparisonForEvent(name, event) {
  // A push is not compared (ci-routing::REQ-001/AC-06): on the default branch a newer push cancels the
  // unfinished run, so every run has to check what the cancelled one would have.
  if (name === 'push') return null
  if (name !== 'pull_request') throw new Error(`Unsupported CI event: ${name}`)
  const base = event?.pull_request?.base?.sha
  const head = event?.pull_request?.head?.sha
  if (![base, head].every((sha) => typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha))) {
    throw new Error('CI event must supply valid commit SHAs')
  }
  return `${base}...${head}`
}

// The scopes the routing writes a line for, in the order it writes them.
const SCOPES = ['app', 'site']

// Each test command that runs only on a developer's machine, under the one scope whose selection means it
// needs a local run (ci-routing::REQ-005/AC-03). A Map, so a command such as "constructor" finds nothing.
const LOCAL = new Map([['pnpm smoke', 'app']])

// The extra output line of a local call, for a command equal to a declared one (ci-routing::REQ-005/AC-01).
export function localLine(command) {
  return LOCAL.has(command) ? `local-scope=${LOCAL.get(command)}\n` : ''
}

// One line for each way the declarations fail: a command declared under a name that is not a scope of the routing
// (ci-routing::REQ-005/AC-01), or one whose tracked files do not all select its scope (ci-routing::REQ-005/AC-04).
// `reads` maps each declared command to its entries: a tracked path, or a directory ending in "/" for every
// tracked path under it. `local` stands for LOCAL in the tests.
export function localReadFailures(reads, tracked, local = LOCAL) {
  const failures = []
  for (const [command, scope] of local) {
    if (!SCOPES.includes(scope)) failures.push(`${JSON.stringify(command)} is declared under ${JSON.stringify(scope)}, which is not a scope of the routing`)
    if (!Object.hasOwn(reads, command)) failures.push(`${JSON.stringify(command)} is declared but lists no files it reads`)
  }
  for (const [command, entries] of Object.entries(reads)) {
    if (!local.has(command)) {
      failures.push(`${JSON.stringify(command)} is not declared`)
      continue
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      failures.push(`${JSON.stringify(command)} lists no files it reads`)
      continue
    }
    const scope = local.get(command)
    for (const entry of entries) {
      const matched = tracked.filter((path) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))
      if (matched.length === 0) failures.push(`${JSON.stringify(entry)} matches no tracked path`)
      for (const path of matched) {
        if (classifyPaths([path])[scope] !== true) failures.push(`${JSON.stringify(path)} does not select ${scope}`)
      }
    }
  }
  return failures
}

// The CI calls the routing without arguments; a local call names one command (ci-routing::REQ-005/AC-02).
export function localCommand(argv) {
  if (argv.length === 0) return null
  if (argv.length !== 2 || argv[0] !== '--local-command' || !argv[1]) {
    throw new Error('Unexpected arguments; usage: node scripts/ci-scope.mjs [--local-command <command>]')
  }
  return argv[1]
}

export function collectChanges(name, event, cwd = process.cwd()) {
  const comparison = comparisonForEvent(name, event)
  if (comparison === null) return { app: true, site: true, reasons: ['Push: both products run, whatever it changed'] }
  // No API pagination limit; a failed command or exhausted buffer fails classification, never an empty diff.
  const output = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', comparison, '--'], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  })
  if (output && !output.endsWith('\0')) throw new Error('Incomplete Git path output')
  return classifyPaths(output ? output.slice(0, -1).split('\0') : [])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const command = localCommand(process.argv.slice(2))
    const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env
    if (!GITHUB_EVENT_PATH || !GITHUB_OUTPUT) throw new Error('CI event path and output file are required')
    const result = collectChanges(GITHUB_EVENT_NAME, JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8')))
    const report = [`Application checks: ${result.app}`, `Website checks: ${result.site}`, ...result.reasons].join('\n')
    console.log(report)
    if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${report}\n`)
    // Publish flags only after all required work succeeded.
    appendFileSync(GITHUB_OUTPUT, `${SCOPES.map((scope) => `${scope}=${result[scope]}\n`).join('')}${localLine(command)}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
