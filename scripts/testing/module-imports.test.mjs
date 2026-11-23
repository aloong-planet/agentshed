// The walk that finds a module's imports (module-imports.mjs), on a sample with every form a module can import by
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imports } from './module-imports.mjs'

test('the walk finds every static import and every load at run time, and nothing a module only exports', () => {
  const sample = [
    "import a from 'node:url'", "import './b.mjs'", "import defer * as c from './c.mjs'", "export * from './d.mjs'",
    "export * as e from 'node:path'", "export { f } from './f.mjs'", 'export { a }', "const g = await import('node:fs')",
    "const h = await import.source('./h.wasm')", "const i = await import.defer('./i.mjs')", "const j = require('node:os')",
    'const k = await import(name)',
  ].join('\n')
  assert.deepEqual(imports(sample),
    ['node:url', './b.mjs', './c.mjs', './d.mjs', 'node:path', './f.mjs', 'node:fs', './h.wasm', './i.mjs', 'node:os', 'name'])
})
