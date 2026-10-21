# Test review — ticket #277

Ticket: [#277 Reduce the app's interface languages to Chinese and English](https://github.com/aloong-planet/agentshed/issues/277)
· feature `i18n` · spec [i18n](../../specs/i18n.md), with [app-update](../../specs/app-update.md)::QR-001

## Design review

- Date: 2026-10-21
- Implementation version: branch `feat/two-languages` at c39db9d (the specs and prototypes; no code changed yet)
- Scope: every test this ticket writes or changes — the i18n layer's unit tests, the preference store and
  handlers, the menu template, the toasts, the e2e cases that name a language, and the README gate

Mutation testing: by the project's capability declaration, `mutation-testing` is not enabled, so it is skipped.
For each test, when it goes red is answered below against the code under test and the expected value's source.
The gate's ability to go red is shown by a planted break, which is a gate check, not mutation testing.

### Test design table

Seams: the copy layer and language resolution (pure functions), the preference store (an injected directory),
the menu template (a pure function), the toast builder (a pure function), the built app through Playwright (e2e),
and the gate scripts. Expensive resource: the built app, built once per `pnpm e2e` by `electron-vite build`; each
e2e case launches its own app with its own user data directory, as every existing case does.

| # | Test (file) | Spec unit | Input that reaches the branch | Assertion and expected-value source | Fixture shape source | Red before the change? |
|---|---|---|---|---|---|---|
| U1 | `resolveLanguage` takes the first supported entry anywhere in the list (index.test) | i18n::REQ-002/AC-01 | `['ko', 'ja', 'zh-Hans-CN', 'en']`; `['ja-US', 'zh-Hans-US', 'en-US']`; `['fr-FR', 'en-GB']` | `'zh'`, `'zh'`, `'en'`: literals from the spec | The second list copies this Mac's real `AppleLanguages` shape (a script subtag with a foreign region) | Yes: the first gives `'ja'`, the third `'fr'` |
| U2 | No supported entry falls back to English (index.test) | i18n::REQ-002/AC-02 | `['fr-FR']`, `['ko-KR', 'ja-JP']`, `['es-419', 'ru']`, `[]`, `null`, `undefined`, `['pt-BR']` | `'en'`: spec literal | Tags as macOS reports them | Yes: `['fr-FR']` gives `'fr'` |
| U3 | Region and script variants match on the primary subtag (index.test, changed) | i18n::REQ-002/AC-01 | `zh-Hans-CN`, `EN-GB`, `fr-CA` | `'zh'`, `'en'`, `'en'` | As above | Yes for `fr-CA` |
| U4 | A non-string entry is skipped (index.test, changed) | i18n::REQ-002 | `[null, 'zh']`, `[123]` | `'zh'`, `'en'` | Invented: a malformed platform value | No: input changed only |
| U5 | A specific preference locks; "follow system" resolves (index.test, changed) | i18n::REQ-002 | `effectiveLanguage('zh', ['en-US'])`, `('zh', [])`, `('system', ['ko-KR', 'ja-JP', 'zh-Hans-CN'])` | `'zh'`, `'zh'`, `'zh'` | As above | Yes for the third (gives `'ja'`) |
| U6 | The language set is Chinese and English, with distinct native names (index.test, changed) | i18n::REQ-001/AC-01, AC-02 | `LANGUAGES`, `dictOf(l).languageName` | `['zh', 'en']`, and the Chinese native name followed by `English`: literals, not the constant compared with itself | — | Yes: six languages |
| U7 | `isLanguage` accepts only `zh` and `en` (index.test, changed) | i18n::REQ-001/AC-03 | `'zh'`, `'en'`; `'fr'`, `'es'`, `'ru'`, `'ja'`, `'ko'`, `'EN'`, `''`, `null` | true for the first two, false for the rest | — | Yes: `'fr'` is accepted |
| U8 | A dictionary loads on its own, evaluates its plurals, and is the one the layer then serves (plural.test, changed; revised in slice 1) | i18n Implementation Decisions (the plural leaf module) | `./en` as the module graph's first import; `en.projects.staleFiltered(1)` and `(2)`; then a dynamic import of `./index` inside the test and `dictOf('en')` | `'1 stale project filtered out'`, `'2 stale projects filtered out'`: literals; `dictOf('en')` is the `en` already loaded | — | Measured in slice 1: with the cycle planted (`en.ts` importing `plural` from `./index`) the first two assertions stay green — since `plural()` takes the bare code it no longer reads a dictionary, so the old guard had stopped catching the cycle. The `dictOf('en')` assertion is what goes red under the plant |
| U9 | `plural` for English and Chinese (plural.test, changed) | i18n failure modes: quantities, 0 | `plural('en', 0/1/2)`, `plural('zh', 1/5)`, a missing form | `'sessions'`, `'session'`, `'sessions'`; `other`; `other` | — | No: input changed only |
| U10 | English counted nouns (counted-nouns.test, the other three languages' blocks removed) | i18n failure modes: quantities | unchanged | unchanged | unchanged | No |
| U11 | Distinctions, and no stale accepted collapse (distinctions.test, entries removed) | i18n (copy distinctions) | the two dictionaries | the "no stale entry" case names the entries that describe only removed languages | — | Yes: it goes red on the French-only entries once French is gone, then they are deleted |
| U12 | Formats (format.test, changed): relative days differ between `zh` and `en`; date labels stable within a language; no Chinese in English output | i18n failure modes: number and time formats | `relativeDays('zh'/'en', 5)`, `dayLabel('en', D)` | distinct; equal; no Han | Measured outputs (2026-10-21): the Chinese "5 days ago" / `5 days ago`, the Chinese "Tuesday, 4 August" / `Tue, August 4` | No |
| U12a | Removed: "the grouping separator changes with the language" and "the month/day order changes with the language" | — | — | — | Measured 2026-10-21: `1,234,567` and `8/4` in both languages | Not applicable: the property is unobservable with these two languages. Recorded as a gap in the file header, to return when a language with another grouping or order is added |
| U13 | Error text renders by language (error-text.test, changed) | ADR-0015, i18n structured errors | `engineNotReady` in `zh` and `en` | the two literals from the dictionaries' text | — | No |
| U14 | Menu template by language (app-menu.test, changed) | i18n (the application menu), app-update::REQ-005, global-search::US-004/AC-02 | `labels('zh')` vs `labels('en')`; `appItems('zh')[1]`, `editItems('zh').at(-1)` | differ; the Chinese literals of "Check for Updates…" and "Search Sessions…" | — | No |
| U15 | A stored removed language reads as "follow system", the other fields kept (prefs-store.test, new) | i18n::REQ-003 | a file `{ theme: 'blue', language: <fr/es/ru/ja>, mode: 'dark', trendSpan: 90, autoCheckUpdates: false }` | `get()` equals the same object with `language: 'system'` | Copies the real five-field shape of this Mac's preference file | Yes: `fr` is kept |
| U16 | `setLanguage` rejects a removed language (prefs-handlers.test, changed) | i18n::REQ-001/AC-03 | `setLanguage('fr')` | throws, as for any invalid value | — | Yes: `fr` is accepted |
| U18 | The stale note's `{sides}` slot survives every language (stale-note-copy.test, changed; added to this table during slice 1, when typecheck listed it) | project-detail S | the dictionaries it imports, now `zh` and `en` | unchanged: one slot per sentence, the path embedded | — | No: its subject is unchanged |
| U17 | Preference tests that use a removed code as a valid value (prefs-store, prefs-handlers, prefs, prefs-backfill, appearance-mode, update-toasts) | none new: their own subjects | the removed code replaced by `zh` or `en`; where two distinct languages are needed, `zh` and `en` | unchanged in meaning | — | No: their subjects are unchanged |
| E1 | Following the system resolves against the whole list (app.spec, changed) | i18n::REQ-002/AC-01 | system `ko-KR,ja-JP,zh-Hans-CN,en-US` | the rail's Settings title in Chinese and `<html lang>` `zh-CN` on the first window | — | Yes: Japanese today |
| E2 | Unsupported system languages fall back to English (app.spec, changed) | i18n::REQ-002/AC-02 | system `fr-FR,ja-JP` | rail title `Settings` | — | Yes: French today |
| E3 | The selector: three items and the divider, a switch applying at once (app.spec, changed) | i18n::REQ-001/AC-01 | launched in Chinese, the trigger clicked | 3 options, 1 divider; the first is follow system with the Chinese native name, then the Chinese native name with `Chinese (Simplified)`, and `English` with `English`; overlay hit tests unchanged; switching to English gives `Settings` and `<html lang>` `en` | — | Yes: 7 options |
| E4 | The selector by keyboard (app.spec, changed) | i18n failure modes: the dropdown | switch to `en` (index 2), reopen with ↓, ↑, Enter, Esc | the highlight starts on `en`, ↑ reaches `zh`, Enter gives the Chinese Settings title, Esc keeps it | — | No: regression |
| E5 | Both languages load with the key nodes non-empty (app.spec, changed) | i18n::REQ-001/AC-02 | switch to `en`, then `zh` | non-empty title, rail title, section titles, `<html lang>` | — | No |
| E6 | A switch changes several areas at once (app.spec, changed) | i18n | from Chinese to `en` | title, rail title and first section title all change | — | No |
| E7 | Settings boxes do not overflow (app.spec, changed) | i18n::QR-001/AC-01 | `zh` and `en` | no horizontal overflow of the page or its boxes | — | No |
| E8 | No tab or skills pill wraps (app.spec, changed) | i18n::QR-001/AC-01 | `zh` and `en` | no element with more than one line box | — | No |
| E9 | The sidebar filter row stays inside its column (app.spec, changed) | i18n::QR-001/AC-01, projects-list C5 | `zh` and `en` | unchanged measurements | — | No |
| E10 | The trend span controls fit (app.spec, changed) | i18n::QR-001/AC-01, token-stats | `zh` with its group name, `[en, Trend days]` | unchanged geometry; screenshots for `zh` and `en` in purple | — | No |
| E11 | The version row's labels and line stay on one line (settings-updates.spec, changed) | app-update::QR-001/AC-02 | `zh` and `en` | unchanged line-box counts | — | No |
| E12 | The result line follows a language switch (settings-updates.spec, changed) | app-update::REQ-004 | switch to `zh` | the Chinese section title, up-to-date line and button labels (dictionary text) | — | No |
| E13 | An open tooltip follows a language switch (app-update.spec, changed) | app-update Failure G2 | the keyboard picks `zh` | the Chinese downloading tooltip at 35% | — | No |
| E14 | The menu item follows the in-app language (global-search.spec, changed) | global-search::US-004/AC-02 | switch to `zh` | the Edit menu's Chinese "Search Sessions…" label; the page title in Chinese | — | No |
| E15 | The menu item follows a switch; toasts keep their language (menu-check-updates.spec, changed) | app-update G2, G6 | switch to `zh` | the Chinese "Check for Updates…" label | — | No |
| E16 | Line counts group digits (app.spec, the `fr-FR` case removed) | i18n failure modes: number formats | `en-US` only | `12,345` | — | Not applicable: the French case would now resolve to English and repeat the first |
| E17 | A stored removed language on a Chinese system (app.spec, new) | i18n::REQ-003 | a seeded preference file with `language: 'fr'`, system `zh-Hans-CN` | the rail's Settings title in Chinese; the trigger shows the Chinese "follow system" and the Chinese native name; no toast; no main-process error | The real five-field preference shape | Yes: French today |
| G1 | The README rule over two files (check-shared-ui) | i18n::CON-001 | `README.md`, `README.en.md` | exit 1 with a planted missing link, exit 0 restored | — | Shown by the planted break |

Seeding a preference file needs an optional argument on the app spec's `launchWithLangs` helper, which writes
the file into the user data directory it creates before launching; no other helper changes.

### Coverage

Checked against the spec's failure modes and this round's units, row by row:

- i18n::REQ-001/AC-01 → E3; AC-02 → U6, E5, plus typecheck; AC-03 → U7, U16, plus typecheck and the search
  evidence.
- i18n::REQ-002/AC-01 → U1, U3, U5, E1; AC-02 → U2, E2. The failing system query is existing coverage, unchanged.
- i18n::REQ-003 → U15, E17. The selector showing "follow system" for such a file → E17's trigger assertion.
- i18n::QR-001/AC-01 → E7–E10; app-update::QR-001/AC-02 → E11.
- i18n::CON-001 → G1, plus the deletion in the diff.
- The dropdown's cycling among three items → E4 covers ↓ from the current item and ↑. Wrapping past the last item
  back to the first is not asserted by any e2e today; it is in the component's modulo arithmetic, unchanged by this
  ticket (the item count comes from the option list). Recorded as existing behaviour, not a new gap.
- Gaps (honest, in the file headers): the number-grouping and month/day-order properties (U12a); the e2e locking
  case that never injects the system languages it loops over (below).

Real-sample fixtures: the preference file (U15, E17) and the system list (U1) copy this Mac's real files.

Conclusion: no uncovered unit.

### Case design

- Implementation-coupling flags, searched over the files this ticket changes
  (`rg -n "vi\.mock|vi\.spyOn"` on them): none.
- No case builds a state the public path cannot reach. E17's seeded file is the shape a development machine's
  file has after an earlier build wrote `fr`; a seeded file is how every preference e2e starts.
- U6 asserts literals rather than the constant against itself.

Conclusion: no finding.

### False greens (design-time checks)

- Always-true assertions: the loops over `LANGUAGES` run over a non-empty set, pinned by U6.
- Tautologies: every expected value is a literal from the spec or the dictionary text, never recomputed by the
  code under test.
- Dead paths: the removed dictionaries cannot be referenced by a test any more without a typecheck error
  (`dictOf('fr')` no longer compiles), and the JSON strings in the preference tests change meaning visibly (a
  removed code now degrades, so a test still expecting it goes red).

Conclusion: no finding.

### Resource reuse

The one expensive resource is the built app: built once per `pnpm e2e` before Playwright starts, and launched once
per case, which is the existing shape of every e2e case here and what each case tests. The new loop iterations
(E5, E7–E10) run inside one launch, as before. Unit tests use no expensive resource.

Conclusion: no finding.

### Finding outside this ticket's change

- The e2e case "the language-locking mechanism itself is reliable, unaffected by the development machine's system
  language" loops over two system lists but never passes them to the app (`void sys`), so it runs the same launch
  twice. Impact: the case proves the pinned language once and claims a second, independent proof it does not make;
  nothing else is affected. Recommended: a separate small fix (pass `sys` through and assert English under both).
  Home: not decided — it is raised to the owner with this ticket's delivery.
