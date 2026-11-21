// The lint rules on the IPC boundary (#520, eslint.config.js): each way past handle() and the guards that a selector
// can see is reported, by the repository's own config, at the line that takes it, and handle() itself and the module
// that makes every Guard are not. A selector edited to look narrower (a method left out, a block's list missing one
// group, a block's files missing an extension) turns a row here red. The snippets are linted as files under src/ that
// need not exist; type information is off for them (no rule here reads it), so a snippet needs no tsconfig entry.
//
// Gap: the snippets are not the repository's code. That every file under src/ passes is `pnpm lint`'s own run; what no
// selector can see is listed above the rules in eslint.config.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)), overrideConfig: tseslint.configs.disableTypeChecked })

const IPC = 'An IPC channel registers only through handle() in src/main/index.ts, with its guard from src/main/ipc-guards.ts.'
const INDEX = 'src/main/index.ts holds no argument check or admission: each is a guard in src/main/ipc-guards.ts.'
const GUARD = 'A Guard is made only in src/main/ipc-guards.ts: nothing else casts to it or renames it.'
const TOKEN = 'Read the token cache through TokenEngine or rowsFromStoreSnapshot (src/main/providers/token-stats.ts), never its files.'

const PROBE = 'src/main/ipc-probe.ts'
const INDEX_TS = 'src/main/index.ts'
const GUARDS_TS = 'src/main/ipc-guards.ts'
const TEST_TS = 'src/main/ipc-probe.test.ts'

// handle() and its import as src/main/index.ts writes them
const WRAPPER = [
  "import { app, ipcMain, shell } from 'electron'",
  "import type { Register } from './ipc-guards'",
  'const handle: Register = (channel, guard, run) => {',
  '  ipcMain.handle(channel, (e, raw: unknown) => {',
  "    assertTrustedSender(e.senderFrame?.url, process.env['ELECTRON_RENDERER_URL'])",
  '    return run(guard(raw, guardState()))',
  '  })',
  '}'
]
const CONTENTS = ["import type { WebContents } from 'electron'", 'declare const contents: WebContents']

/** The lines a snippet's file gets `message` at, from `no-restricted-syntax` alone, after checking it is linted and parses */
async function reported(file, lines, message) {
  assert.equal(await eslint.isPathIgnored(file), false, `${file} is linted`)
  const [result] = await eslint.lintText(lines.join('\n'), { filePath: file })
  assert.deepEqual(result.messages.filter((m) => m.fatal), [], 'the snippet parses')
  return [...new Set(result.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && m.message === message).map((m) => m.line))]
}

/** The lines marked `// reported`, one-based */
const marked = (lines) => lines.flatMap((line, i) => (line.endsWith('// reported') ? [i + 1] : []))

const cases = [
  // Form 1, outside src/main/index.ts: every method of IpcMain that adds a handler or listener (Electron 43.2.0)
  ...['addListener', 'handle', 'handleOnce', 'on', 'once', 'prependListener', 'prependOnceListener'].map((method) => ({
    name: `ipcMain.${method} in application code`, file: PROBE, message: IPC,
    lines: ["import { ipcMain } from 'electron' // reported", `ipcMain.${method}('x', () => {}) // reported`]
  })),
  { name: 'a namespace import', file: PROBE, message: IPC,
    lines: ["import * as electron from 'electron'", "electron.ipcMain.handle('x', () => {}) // reported"] },
  { name: 'a default import', file: PROBE, message: IPC,
    lines: ["import electron from 'electron'", "electron.ipcMain.on('x', () => {}) // reported"] },
  { name: 'a dynamic import', file: PROBE, message: IPC,
    lines: ["void import('electron').then((e) => e.ipcMain.on('x', () => {})) // reported"] },
  { name: 'a destructured, renamed key', file: PROBE, message: IPC,
    lines: ["import * as electron from 'electron'", 'const { ipcMain: m } = electron // reported', "m.on('x', () => {})"] },
  { name: 'a destructured string key', file: PROBE, message: IPC,
    lines: ["import * as electron from 'electron'", "const { 'ipcMain': m } = electron // reported", "m.on('x', () => {})"] },
  { name: 'a computed member, as a string', file: PROBE, message: IPC,
    lines: ["import * as electron from 'electron'", "electron['ipcMain'].on('x', () => {}) // reported"] },
  { name: 'a computed member, as a template', file: PROBE, message: IPC,
    lines: ["import * as electron from 'electron'", "electron[`ipcMain`].handle('x', () => {}) // reported"] },
  { name: "a WebContents' ipc", file: PROBE, message: IPC, lines: [...CONTENTS, "contents.ipc.handle('x', () => {}) // reported"] },
  { name: "a WebContents' ipc, as a string key", file: PROBE, message: IPC, lines: [...CONTENTS, "contents['ipc'].on('x', () => {}) // reported"] },
  { name: "a WebContents' ipc, as a template key", file: PROBE, message: IPC, lines: [...CONTENTS, "contents[`ipc`].on('x', () => {}) // reported"] },
  { name: "a WebContents' ipc, destructured", file: PROBE, message: IPC, lines: [...CONTENTS, 'const { ipc } = contents // reported', "ipc.on('x', () => {})"] },
  ...['ipc-message', 'ipc-message-sync'].map((event) => ({
    name: `the WebContents ${event} event`, file: PROBE, message: IPC, lines: [...CONTENTS, `contents.on('${event}', () => {}) // reported`]
  })),
  { name: 'the WebContents ipc-message-sync event, as a template', file: PROBE, message: IPC,
    lines: [...CONTENTS, 'contents.on(`ipc-message-sync`, () => {}) // reported'] },
  { name: 'a MessageChannelMain, by name or as a key', file: PROBE, message: IPC,
    lines: ["import * as electron from 'electron'", "import { MessageChannelMain } from 'electron' // reported",
      'const { port1, port2 } = new MessageChannelMain() // reported', "new electron['MessageChannelMain']() // reported",
      'new electron[`MessageChannelMain`]() // reported'] },
  // Form 1, in each kind of file under src/, and in a file of each other extension a source file could take
  ...['src/renderer/src/ipc-probe.tsx', TEST_TS, 'src/main/testing/ipc-probe.ts', 'src/main/providers/token-stats.ts', GUARDS_TS,
    ...['mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'].map((ext) => `src/main/ipc-probe.${ext}`), 'src/main/ipc-probe.test.js', 'src/main/testing/ipc-probe.js'
  ].map((file) => ({
    name: `ipcMain in ${file}`, file, message: IPC, lines: ["import { ipcMain } from 'electron' // reported"]
  })),
  ...[TEST_TS, GUARDS_TS].map((file) => ({ name: `a WebContents' ipc in ${file}`, file, message: IPC, lines: [...CONTENTS, "contents.ipc.on('x', () => {}) // reported"] })),
  // Form 1, in src/main/index.ts: handle() alone, which each row starting with WRAPPER finds unreported
  { name: 'ipcMain.handle at the top of index.ts', file: INDEX_TS, message: IPC, lines: [...WRAPPER, "ipcMain.handle('x', () => {}) // reported"] },
  { name: 'ipcMain.on at the top of index.ts', file: INDEX_TS, message: IPC, lines: [...WRAPPER, "ipcMain.on('x', () => {}) // reported"] },
  { name: "another method inside handle()'s body", file: INDEX_TS, message: IPC,
    lines: [...WRAPPER.slice(0, 3), "  ipcMain.on(channel, () => run(guard)) // reported", ...WRAPPER.slice(3)] },
  { name: 'ipcMain imported under another name in index.ts', file: INDEX_TS, message: IPC,
    lines: ["import { ipcMain as m } from 'electron' // reported", "m.handle('x', () => {})"] },
  { name: 'ipcMain passed on in index.ts', file: INDEX_TS, message: IPC, lines: [...WRAPPER, 'const m = ipcMain // reported', "m.handle('x', () => {})"] },
  { name: 'a handle() inside a function in index.ts', file: INDEX_TS, message: IPC,
    lines: [WRAPPER[0], WRAPPER[1], 'export function later() {', '  const handle: Register = (channel, guard, run) => {',
      '    ipcMain.handle(channel, (_e, raw: unknown) => run(guard(raw, guardState()))) // reported', '  }', '  return handle', '}'] },
  { name: 'a handle() not typed Register in index.ts', file: INDEX_TS, message: IPC,
    lines: [WRAPPER[0], 'const handle = (channel: string, run: (raw: unknown) => unknown) => {',
      '  ipcMain.handle(channel, (_e, raw: unknown) => run(raw)) // reported', '}', "handle('x', (raw) => raw)"] },
  { name: "a WebContents' ipc in index.ts", file: INDEX_TS, message: IPC,
    lines: [...WRAPPER, "app.on('web-contents-created', (_e, contents) => contents.ipc.on('x', () => {})) // reported"] },
  // Form 2: src/main/index.ts holds no admission or bad-args check
  ...[
    "readRegistry.admission('memoryFiles', f) // reported",
    'const { admission } = readRegistry // reported',
    "readRegistry['admission']('memoryFiles', f) // reported",
    "readRegistry[`admission`]('memoryFiles', f) // reported",
    "throw appError(ERR.badArgs, { channel: 'x' }) // reported",
    "throw appError(ERR['badArgs'], { channel: 'x' }) // reported",
    'throw appError(ERR[`badArgs`], { channel: "x" }) // reported',
    "throw appError('bad-args', { channel: 'x' }) // reported",
    "throw appError(`bad-args`, { channel: 'x' }) // reported"
  ].map((line) => ({ name: `index.ts: ${line.replace(' // reported', '')}`, file: INDEX_TS, message: INDEX, lines: [...WRAPPER, line] })),
  { name: "index.ts calling the guards' rechecks is not reported", file: INDEX_TS, message: INDEX,
    lines: [...WRAPPER, 'if (!listedProject(guardState(), path)) throw appError(ERR.engineNotReady)'] },
  { name: 'the guards checking admission and bad args is not reported', file: GUARDS_TS, message: INDEX,
    lines: ["if (!at.registry.admission('memoryFiles', file)) throw appError(ERR.badArgs, { channel: 'x' })"] },
  // Form 3: a cast to Guard, outside src/main/ipc-guards.ts
  ...[
    "const g = check as Guard<string> // reported",
    'const g = <Guard<string>>check // reported',
    "const g = check as guards.Guard<string> // reported",
    'const g = check as Guard<string> | undefined // reported',
    'const table = { a: check } as Record<string, Guard<unknown>> // reported',
    "import type { Guard as G } from './ipc-guards' // reported"
  ].map((line) => ({ name: `a cast in application code: ${line.replace(' // reported', '')}`, file: PROBE, message: GUARD, lines: [line] })),
  ...[TEST_TS, INDEX_TS].map((file) => ({ name: `a cast in ${file}`, file, message: GUARD, lines: ['const g = check as Guard<string> // reported'] })),
  { name: "the guards' own maker is not reported", file: GUARDS_TS, message: GUARD,
    lines: ['function guard<A>(check: (raw: unknown, at: GuardState) => A): Guard<A> {', '  return check as Guard<A>', '}'] },
  // The token cache rule, which shares the rule's option list with these
  ...[PROBE, INDEX_TS, GUARDS_TS].map((file) => ({ name: `the token cache file in ${file}`, file, message: TOKEN, lines: ["const f = 'token-cache.json' // reported"] })),
  { name: 'the token cache file in a test is not reported', file: TEST_TS, message: TOKEN, lines: ["const f = 'token-cache.json'"] }
]

for (const { name, file, message, lines } of cases) {
  test(name, async () => {
    assert.deepEqual(await reported(file, lines, message), marked(lines))
  })
}
