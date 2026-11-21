// ESLint: the official recommended sets only, no rules of our own.
//
// - `@eslint/js` recommended, plus typescript-eslint `recommendedTypeChecked` — the type-aware set, because
//   the bugs worth a linter here (a floating Promise across IPC, a value typed `any` flowing on) are only
//   visible with type information. `projectService` finds the right tsconfig for each file, including
//   `src/shared/`, which both tsconfigs include.
// - `eslint-plugin-react-hooks` `recommended-latest`, renderer only: the hook contract (call order, effect
//   dependencies, refs during render) is invisible to the type checker.
// - Plain JS (`scripts/*.mjs`, `build/*.cjs`) belongs to no tsconfig, so the type-aware rules are off there.
//
// The `lint` script runs with `--max-warnings 0`: a warning that does not fail the run is a rule that is
// on in name only, and react-hooks ships `exhaustive-deps` as a warning.
//
// Exemptions come in two kinds, and neither uses `warn` as a middle ground (under `--max-warnings 0` it
// would fail the run anyway; without it, it would be off while looking on):
// - **Framework constraints** — the rule disagrees with something the code cannot change. Turned off
//   below, scoped to the files the constraint applies to, each saying what retires it.
// - **Deferred findings** — existing violations whose fix changes behaviour or a type signature, so each
//   needs a judgement and a test rather than a mechanical edit. These are **not** turned off here: each
//   existing site carries an inline `eslint-disable-next-line <rule> -- see #N`, so the rule stays on
//   for new code. A rule-level off would hide new violations too, until the issue is fixed. An inline
//   directive that no longer matches a violation is reported as unused and fails the run, so fixing a
//   site forces its comment out.
import { fileURLToPath } from 'node:url'
import { defineConfig, includeIgnoreFile } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// `no-restricted-syntax` under src/. A config object that sets a rule replaces the options an earlier one gave it rather
// than adding to them, so the four objects that set it below match disjoint files, and each lists every selector that
// holds for its files. They match each extension a source file could take, not .ts and .tsx alone: a .js file added
// beside the TypeScript would otherwise be linted with none of them, and a .jsx file not linted at all.
const sourceExts = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}'

// One way to a token cache entry (CacheEntries in src/main/providers/token-stats.ts): the type check keeps a
// reader off the store's rows, and this keeps application code from opening the token store, or the JSON cache
// the upgrade imports, for itself, where an entry read as the file holds it fails on a corrupt one. A test, and
// the helpers under src/main/testing/, seed and corrupt them on purpose.
const tokenCache = [{
  selector:
    'Literal[value=/token-cache\\.json|token-store\\.sqlite/], TemplateElement[value.raw=/token-cache\\.json|token-store\\.sqlite/]',
  message: 'Read the token cache through TokenEngine or rowsFromStoreSnapshot (src/main/providers/token-stats.ts), never its files.'
}]

// The IPC boundary (#405, #520): a channel registers only through handle() in src/main/index.ts, with its guard from
// src/main/ipc-guards.ts, and index.ts holds no argument check or admission of its own. The reason is in that module's
// header, the comment on handle() and item 17 of docs/ops/electron-security.md. Typecheck refuses a registration with
// no guard or with an inline check; these refuse the forms it lets through, and scripts/eslint-ipc-rules.test.mjs runs
// each one. What they cannot see: a name built at run time (`electron[name]`, `'ipc-' + kind`); a cast to a type that
// names Guard only through another name (an alias, `typeof noArgs`, `Parameters<Register>[1]`) or to `never`, or a
// `@ts-expect-error` over a registration; and a check in index.ts that names neither `admission` nor the bad-args error.
const IPC = 'An IPC channel registers only through handle() in src/main/index.ts, with its guard from src/main/ipc-guards.ts.'
// Any use of the name: a call of any of its methods, an alias, the value passed on, a destructured key, the member of a
// namespace, default or dynamic import
const ipcMainName = 'Identifier[name="ipcMain"]'
const ipcMainAnywhere = [{ selector: ipcMainName, message: IPC }]
// index.ts imports it from 'electron' and calls `ipcMain.handle` once, inside handle(): the top-level
// `const handle: Register` arrow, as its body's statement
const ipcMainBesidesHandle = [{
  selector: `${ipcMainName}:not(${[
    'ImportDeclaration[source.value="electron"] > ImportSpecifier[imported.name="ipcMain"][local.name="ipcMain"] > Identifier',
    'Program > VariableDeclaration[kind="const"] > VariableDeclarator[id.name="handle"][id.typeAnnotation.typeAnnotation.typeName.name="Register"]' +
      ' > ArrowFunctionExpression.init > BlockStatement.body > ExpressionStatement > CallExpression.expression' +
      ' > MemberExpression.callee[computed=false][property.name="handle"] > Identifier.object'
  ].join(', ')})`,
  message: IPC
}]
// The other doors a page's messages come in by: `ipcMain` as a computed key, the `ipc` of a WebContents or WebFrameMain
// (an IpcMain scoped to it) or of a ServiceWorkerMain, the `ipc-message` events a WebContents receives them by, and a
// MessageChannelMain, a channel of its own whose one port the main process would listen on after handing the page the
// other by `postMessage`. In Electron 43.2.0 a MessagePortMain reaches the main process only from a
// `new MessageChannelMain()` or in the `ports` of an IPC event these refuse, so any use of that name is refused.
const ipcOtherWays = [{
  selector: [
    'Literal[value="ipcMain"]', 'TemplateElement[value.raw="ipcMain"]',
    'MemberExpression > Identifier.property[name="ipc"]', 'ObjectPattern > Property > Identifier.key[name="ipc"]',
    'Literal[value="ipc"]', 'TemplateElement[value.raw="ipc"]',
    'Literal[value=/^ipc-message(-sync)?$/]', 'TemplateElement[value.raw=/^ipc-message(-sync)?$/]',
    'Identifier[name="MessageChannelMain"]', 'Literal[value="MessageChannelMain"]', 'TemplateElement[value.raw="MessageChannelMain"]'
  ].join(', '),
  message: IPC
}]
// The read registry's `admission` and the bad-args error, by name, key or code
const indexHoldsNone = [{
  selector: [
    'Identifier[name=/^(admission|badArgs)$/]',
    'Literal[value=/^(admission|badArgs|bad-args)$/]', 'TemplateElement[value.raw=/^(admission|badArgs|bad-args)$/]'
  ].join(', '),
  message: 'src/main/index.ts holds no argument check or admission: each is a guard in src/main/ipc-guards.ts.'
}]
// A cast whose type names Guard (alone, qualified, in a union or a type argument), and an import that renames it
const guardCast = [{
  selector: [
    ':matches(TSAsExpression, TSTypeAssertion) > .typeAnnotation Identifier[name="Guard"]',
    'ImportSpecifier[imported.name="Guard"][local.name!="Guard"]'
  ].join(', '),
  message: 'A Guard is made only in src/main/ipc-guards.ts: nothing else casts to it or renames it.'
}]

export default defineConfig(
  // Whatever git ignores is not linted: build output, test reports, local scratch files. ESLint does not
  // read .gitignore on its own, and a directory missing from a hand-kept list is linted in a working
  // checkout while a clean one (CI, a fresh worktree) never has it. `gitignoreResolution` resolves the
  // patterns against .gitignore's own location, as git does.
  includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url)), { gitignoreResolution: true }),
  {
    // Tracked but not linted: prototypes are throwaway pages with vendored libraries
    ignores: ['docs/']
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      // Same convention as tsc's noUnusedParameters: a leading underscore marks a parameter that is
      // unused on purpose (a dictionary entry whose signature is shared across six languages, say)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node }
  },
  {
    // Framework constraint: the package is `"type": "module"`, so an electron-builder hook that uses
    // require() has to be a `.cjs` file (see the hook's own header). Retires if the hook is rewritten as
    // an ES module.
    files: ['build/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      // Framework constraint: a Playwright fixture that needs no fixtures must still destructure its
      // first argument (`async ({}, testInfo) => …`). Retires if Playwright drops that requirement.
      'no-empty-pattern': 'off',
      // One way to start the app (test-layers::US-004): its pinned environment and error watch are not copied
      'no-restricted-imports': ['error', { paths: [{
        name: '@playwright/test',
        importNames: ['_electron'],
        message: 'Start the app through startApp in e2e/support/launch.ts.'
      }] }]
    }
  },
  {
    files: ['e2e/support/launch.ts'],
    rules: { 'no-restricted-imports': 'off' }
  },
  {
    files: [`src/**/*.${sourceExts}`],
    ignores: [
      `src/**/*.test.${sourceExts}`, 'src/main/testing/**', 'src/main/providers/token-stats.ts', 'src/main/ipc-guards.ts', 'src/main/index.ts'
    ],
    rules: { 'no-restricted-syntax': ['error', ...ipcMainAnywhere, ...ipcOtherWays, ...guardCast, ...tokenCache] }
  },
  {
    // The token cache is theirs to open (above); a test needs no cast to Guard, so none is exempt
    files: [`src/**/*.test.${sourceExts}`, `src/main/testing/**/*.${sourceExts}`, 'src/main/providers/token-stats.ts'],
    rules: { 'no-restricted-syntax': ['error', ...ipcMainAnywhere, ...ipcOtherWays, ...guardCast] }
  },
  {
    // Where every Guard is made
    files: ['src/main/ipc-guards.ts'],
    rules: { 'no-restricted-syntax': ['error', ...ipcMainAnywhere, ...ipcOtherWays, ...tokenCache] }
  },
  {
    files: ['src/main/index.ts'],
    rules: { 'no-restricted-syntax': ['error', ...ipcMainBesidesHandle, ...ipcOtherWays, ...indexHoldsNone, ...guardCast, ...tokenCache] }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']]
  }
)
