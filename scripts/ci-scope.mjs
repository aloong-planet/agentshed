// Product impact for CI. A pull request is routed by its paths: unknown paths select both products;
// documentation is an explicit exception, never a repository-wide Markdown exemption. A push selects both
// products without looking at its paths (ci-routing::REQ-001).
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
    } else if (APP_CONFIG.has(path) || ['src/', 'e2e/', 'build/', 'scripts/'].some((prefix) => path.startsWith(prefix))) {
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
    const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env
    if (!GITHUB_EVENT_PATH || !GITHUB_OUTPUT) throw new Error('CI event path and output file are required')
    const result = collectChanges(GITHUB_EVENT_NAME, JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8')))
    const report = [`Application checks: ${result.app}`, `Website checks: ${result.site}`, ...result.reasons].join('\n')
    console.log(report)
    if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${report}\n`)
    // Publish flags only after all required work succeeded.
    appendFileSync(GITHUB_OUTPUT, `app=${result.app}\nsite=${result.site}\n`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
