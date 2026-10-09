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
      'no-empty-pattern': 'off'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']]
  }
)
