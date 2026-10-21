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
| U8 | A dictionary loads on its own, evaluates its plurals, and is the one the layer then serves (plural.test, changed; revised in slice 1) | i18n Implementation Decisions (the plural leaf module) | `./en` as the module graph's first import; `en.projects.staleFiltered(1)` and `(2)`; then a dynamic import of `./index` inside the test and `dictOf('en')` | `'1 stale project filtered out'`, `'2 stale projects filtered out'`: literals; `dictOf('en')` is the `en` already loaded | — | Measured in slice 1: with the cycle planted (`en.ts` importing `plural` from `./index`) the first two assertions stay green — since `plural()` takes the bare code it reads no dictionary, so the old guard never caught the cycle — the same plant at 5ca6477, where the guard was added, stays green too. The `dictOf('en')` assertion is what goes red under the plant |
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
| U19 | The system language read: the override's forms, and a failing platform query giving `[]` (system-language.test, new; added after the post-implementation check, F2) | i18n::REQ-002/AC-02 | `AGENTSHED_SYSTEM_LANGUAGES` set to `'zh-Hans-CN, en-US'`, to `' , '` and to `''`; then deleted, so the probe runs — under vitest `electron` is the empty stub, `app` is undefined and the probe throws inside the try | `['zh-Hans-CN', 'en-US']`, `[]`, `[]`; with the variable deleted `[]`, and `effectiveLanguage('system', …)` `'en'`: literals from the spec | The stub is the project's own unit-test electron (its header documents the undefined imports); the throw it causes stands in for a platform query that fails | Yes, measured: with the try/catch removed the failing-query case throws |
| E18 | The language-locking mechanism (app.spec, rewritten after the post-implementation check, F1) | i18n Testing Decisions (the pinned language) | `launch()` as every case uses it; then `launch()` with `AGENTSHED_SYSTEM_LANGUAGES: 'zh-Hans-CN'` in its extra environment | the rail's Settings title in English, then in Chinese | — | Not required (not a bug reproduction); if the main process ignored the injected list, the two launches would show the same platform language, so one of the two assertions fails on any machine |
| E3, E7, E8, E11 (revised after the post-implementation check) | E3: the title no longer claims persistence (F4); E7: the page-level overflow half removed, the box half kept (F5); E8: the pill and tab sets asserted non-empty before measuring (F6); E11: each language's run asserts `<html lang>` is the seeded language before measuring (F3) | as before | as before | as before, plus E8's non-empty counts and E11's `zh-CN` / `en` | — | No: guards tightened |
| G1 | The README rule over two files (check-shared-ui) | i18n::CON-001 | `README.md`, `README.en.md` | exit 1 with a planted missing link, exit 0 restored | — | Shown by the planted break |

Seeding a preference file needs an optional argument on the app spec's `launchWithLangs` helper, which writes
the file into the user data directory it creates before launching; no other helper changes.

### Coverage

Checked against the spec's failure modes and this round's units, row by row:

- i18n::REQ-001/AC-01 → E3; AC-02 → U6, E5, plus typecheck; AC-03 → U7, U16, plus typecheck and the search
  evidence.
- i18n::REQ-002/AC-01 → U1, U3, U5, E1; AC-02 → U2, E2, and U19 for the failing system query. (The first version of
  this line called the failing query existing coverage; the post-implementation check found no test reached it, F2.)
- i18n::REQ-003 → U15, E17. The selector showing "follow system" for such a file → E17's trigger assertion.
- i18n::QR-001/AC-01 → E7–E10; app-update::QR-001/AC-02 → E11.
- i18n::CON-001 → G1, plus the deletion in the diff.
- The dropdown's cycling among three items → E4 covers ↓ from the current item and ↑. Wrapping past the last item
  back to the first is not asserted by any e2e today; it is in the component's modulo arithmetic, unchanged by this
  ticket (the item count comes from the option list). Recorded as existing behaviour, not a new gap.
- Gaps (honest, in the file headers): the number-grouping and month/day-order properties (U12a). (The first version
  of this line also listed the e2e locking case as a header gap; it was not in the header — F1 — and the case is
  rewritten instead, E18.)

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
  nothing else is affected. The fix first recommended here (pass `sys` through and assert English under both) would
  not discriminate after ADR-0035, since both lists resolve to English, the pinned language (post-implementation
  check, F1). Resolved in this ticket instead: E18.

## Post-implementation check

- Date: 2026-10-21
- Ticket: [#277](https://github.com/aloong-planet/agentshed/issues/277), feature `i18n`
- Implementation version: branch `feat/two-languages` at ac2a2e6; the tests as committed in 7c1b7d8 and bd7d697.
  bd7d697..ac2a2e6 changes documents and records only (`git show --stat ac2a2e6`: `docs/` alone)
- Scope: the range 9b7bb13..ac2a2e6 — every test and gate it writes or changes (the rows of the test design table
  above, plus the changed verifications the table does not list), against the spec [i18n](../../specs/i18n.md) and
  app-update::QR-001
- Gateway: `pnpm verify` on bd7d697, `VERIFY_EXIT=0` ([gateway-bd7d697.txt](evidence/ticket-277/gateway-bd7d697.txt)).
  This check read that run's full log, which is kept outside the repository; the lines it relies on are quoted below
- Performed by an independent sub-agent that took no part in the design or the implementation

Mutation testing: `capabilities.toml`, read with a TOML parser, declares `[mutation-testing] enabled = false`, a valid
shape in the capability registry. By the project's capability declaration, `mutation-testing` is not enabled, so it is
skipped. Each test's "when does it go red" is answered below from the code under test and the expected value's source.
One measurement was taken for finding F5: an overflow made to happen on purpose in the built app, to see which metric
moves — a probe run from outside the repository, changing no code, test or data file.

### Test design table, row by row

| Rows | Written as | Check |
|---|---|---|
| U1–U5 | `src/shared/i18n/index.test.ts`, the `resolveLanguage` and `effectiveLanguage` blocks | Seam, inputs and literals as designed. Additions only: `['ko']` in U2, `effectiveLanguage('zh', null)` in U5 |
| U6, U7 | the same file, `dictionary` block | As designed; U7 also rejects `undefined` |
| U8, U9 | `src/shared/i18n/plural.test.ts` | As designed (revised in slice 1): `./en` is the first import, the file imports `./index` only dynamically inside the third case, which asserts `dictOf('en')` `toBe(en)`; `./plural` imports nothing but a type from `./index` |
| U10 | `counted-nouns.test.ts` | The English block unchanged (one comment line); the other three blocks removed |
| U11 | `distinctions.test.ts` | As designed; ten accepted collapses left, each still matched in English (the gateway's sweep is green) |
| U12, U12a | `format.test.ts` | As designed; the header gap note for U12a is present |
| U13, U14, U18 | `error-text.test.ts`, `app-menu.test.ts`, `stale-note-copy.test.ts` | As designed |
| U15 | `prefs-store.test.ts`, `it.each(['fr', 'es', 'ru', 'ja'])` | As designed. The fixture's keys match this Mac's preference file, read 2026-10-21 (`theme`, `language`, `mode`, `trendSpan`, `autoCheckUpdates`; pretty-printed on disk, compact in the test — whitespace only). Every non-language value differs from its default, so a whole-file reset is caught |
| U16 | `prefs-handlers.test.ts` | A superset: all four removed codes are rejected, not only `fr` |
| U17 | `prefs-store`, `prefs-handlers`, `prefs`, `prefs-backfill`, `appearance-mode`, `update-toasts` tests | As designed. Each replacement (`zh` or `en`) differs from the default `system`, so "kept" and "defaulted" stay distinguishable; the contract cases in `prefs.test.ts` now refuse for the field they name |
| E1–E10, E16, E17 | `e2e/app.spec.ts` | As designed. E17 also asserts the seeded theme (`data-theme` blue) |
| E11, E12 | `e2e/settings-updates.spec.ts` | As designed (see F3) |
| E13, E14, E15 | `app-update`, `global-search`, `menu-check-updates` specs | As designed |
| G1 | `check-shared-ui.mjs`, the README rule | As designed |

Changed verifications the table does not list, reviewed here as design rows:

| Change | Review |
|---|---|
| `check-lang.mjs`: six files added by exact name to the "literals only" rule (the four e2e specs that now switch to Chinese, `app-menu.test.ts`, `update-toasts.test.ts`) | A widened exemption (the review-code false-greens list, form 7). It is a predicate, not a count: `citedOrLiteral` still reports Chinese written as a comment or prose in those files. Every name in the match is live: the gateway counted 16 files under the rule, the number of names it lists |
| `check-lang.mjs`: `ja.ts`, `README.ja.md` and the Japanese language name removed | Narrowing only. The Chinese README rule and the language-name rule still match their files (1 and 2 in the gateway's summary), so neither became a dead rule |
| `check-shared-ui.mjs`: the two dictionary loops and the side-count pattern reduced to Chinese and English | The loops cover every dictionary that exists; the removed alternatives could only match removed dictionaries. Red conditions unchanged |
| `RichText.test.ts`, `usage.test.ts` | Comment wording only; no assertion changed |
| Unchanged, but its input changed meaning: `token-span.spec.ts` "global span defaults an older or invalid preference…" (system `fr-FR`, stored `en`) | Since ADR-0035 the system list resolves to English, like the stored value, so the UI no longer separates "kept" from "reset". The case still does through its preference-file readback: a reset language would be written back as `system`, not `en`. No finding |
| Unchanged, but its input changed meaning: the e2e case on the language-locking mechanism | F1 |

The last two rows come from a full search for every removed-language tag left in `e2e/`, `src/`, `scripts/` and `site/`
(`rg` for `fr`, `es`, `ru` or `ja` followed by a subtag): 11 hits — the two cases above, E1, E2 and seven unit inputs of
U1–U5, all intended.

Conclusion: every row of the table is written as designed; the table misses the gate changes above, which are reviewed
here with no finding.

### Coverage

Header gap notes the design review promised, checked in the files:

- U12a, digit grouping and month/day order: present in `format.test.ts`'s header.
- The menu's native rendering: present in `app-menu.test.ts`'s header and in `app-menu.ts`.
- E16 reduced to one case: stated at the case.
- The locking case: absent (F1).

The spec units, re-checked against the written tests: each reaches its branch through the input the table names, except
the failing system query of i18n::REQ-002/AC-02 (F2) and the Chinese half of app-update::QR-001/AC-02 (F3).

Real-sample fixtures, re-checked 2026-10-21 on this Mac: the preference file (above, U15); `defaults read -g
AppleLanguages` gives `en-US, zh-Hans-US, ja-US`, the shape U1's second list reorders so that its first entry misses.

The dropdown's wrap-around (the spec row "past the first or last item"): the cursor arithmetic is `% OPTIONS.length`
over `['system', ...LANGUAGES]` in `LanguageSelect.tsx`, unchanged and independent of the count, so the design review's
"existing behaviour, not a new gap" stands.

- **F1. The locking case cannot go red, and its gap is not in the file header.** The case "the language-locking
  mechanism itself is reliable…" loops over `ko-KR,fr-FR` and `ja-JP,en-US` without passing them (`void sys`), as the
  design review found. Two things are new since then. First, after ADR-0035 both lists resolve to English, the pinned
  language, so the design review's recommended fix ("pass `sys` through and assert English under both") would not
  discriminate either: it would only re-assert E2's property, and with both lists giving the pinned language it could
  not tell a working pin from a broken one. Second, this Mac's platform
  list resolves to English too, so here the case cannot fail for a pin fault at all. The design review's Coverage
  section says this gap is noted in the file headers; `e2e/app.spec.ts`'s header lists two other gaps only, and the
  case's comment still says it "runs under two injected system languages that differ from each other and from the
  pinned one".
- **F2. The failing system query of i18n::REQ-002/AC-02 has no test.** What makes "a system language query that fails
  gives English, without an error" true is the try/catch in `systemPreferredLanguages()` (`src/main/system-language.ts`).
  No test reaches it: no test file imports that module (full search for `systemPreferredLanguages` and
  `system-language`), every e2e launcher sets `AGENTSHED_SYSTEM_LANGUAGES` (checked at all 14 `electron.launch` calls
  in the seven spec files), which returns before the probe, and `smoke` runs the real probe, which succeeds. Deleting
  the try/catch would leave every test green. The design review's Coverage section and `checklist.md`'s REQ-002/AC-02
  row call it "existing coverage, unchanged"; only the consequence (an empty list gives English) is covered.
- **F3. E11 never checks the language it seeds.** The QR-001/AC-02 case writes `{ language }` into `prefs.json` with
  the system pinned to `en-US`, and nothing in it asserts the UI then renders that language. Had the seed stopped
  taking effect, the `zh` run would measure English and stay green. Since the set shrank, that run is the only
  non-English measurement behind app-update::QR-001/AC-02. Mitigated, not closed: the store's partial-file unit cases and
  token-span's seeded-file case would go red on a general seeding failure.
- **F4. E3's title claims persistence it does not assert.** "…with a switch applying immediately and persisting" has no
  restart and no readback. The claim predates this ticket (the English conversion, #90); this ticket edited the title.
  Persistence of the language choice is held by the store's unit case "setLanguage persists…", not by any e2e.

Conclusion: four findings, F1–F4.

### Case design

- Implementation-coupling flags over the written tests (`rg` for `vi.mock`, `vi.spyOn`, `vi.doMock`, `vi.stubGlobal`,
  `jest.mock` over `src/`, `e2e/` and `site/src`): only `parse-pool.test.ts`'s spies on `console.warn`, which is not a
  project module and is unchanged. None in this ticket's files.
- No private member is reached; `null as unknown as string` in U4 is an input to a public function.
- Setup through files: U15 and E17 write `prefs.json` and read back through `PrefsStore.get()` or the UI — the store's
  public read path, seeded the way settings-updates and token-span already seed it. `launchWithLangs` gained one
  optional argument for that; no other helper changed.

Conclusion: no finding.

### False greens

When each row goes red:

| Rows | Goes red when |
|---|---|
| U1 | resolution stops at the first entry (both Chinese lists would give English), a script or region subtag is not stripped (`zh-Hans-US` misses), or a removed language is still in the set (`ja`, `fr`) |
| U2, U3 | a removed language still matches, matching is case-sensitive (`EN-GB`), the fallback is not English, or `null` / `undefined` throws |
| U4 | a non-string entry throws or is matched |
| U5 | the lock branch is missing (each of `['en-US']`, `[]`, `null` would resolve to English), or follow-system stops before `zh-Hans-CN` |
| U6, U7 | the set or a native name changes (literals, not the constant against itself); a removed code, `EN` or an empty value is accepted |
| U8 | `en.ts` imports a value from `./index`: under vitest the cycle leaves `DICTS.en` undefined, the module cache serves that `index` to the third case, and `toBe(en)` fails (measured red by the implementer, code review finding 1); or an English plural form is wrong |
| U9 | English is not pluralised by Intl (0 taking the singular), Chinese does not take `other`, or a missing form does not fall back |
| U10 | an English counted noun takes the wrong form |
| U11 | English collapses a pair that is not accepted, or an accepted entry no longer collapses; the loops run over `en` (non-empty, pinned by U6) and ten entries |
| U12 | the locale is hard-coded (relative days or day labels equal between `zh` and `en`), Han appears in English output, or a day label changes within the day |
| U13, U14, U18 | the wording ignores the language (literals from the dictionaries' text), the menu items move, or a `{sides}` slot or the path is lost |
| U15 | a stored removed code is kept, maps to a language instead of `system`, or its degradation resets another field (every other value is non-default) |
| U16 | `setLanguage` accepts a removed code (`codeOf` returns `null` when nothing throws) |
| U17 | as before this ticket: the replacements are valid and non-default |
| E1, E2 | resolution stops at the first entry, or a removed language still matches (the rail title and `<html lang>`) |
| E3, E4 | the item count, order or names change, the overlay is clipped (five hit tests), a switch does not apply, the highlight moves on open, ↑ does not step, Enter does not select, or Esc changes the language |
| E5, E6 | a dictionary fails at runtime (a blank title), or an area stays in the old language. One weak sub-assertion, no action needed: `not.toHaveAttribute('title', '')` also passes when the attribute is absent, which is what an undefined lookup renders; the title and section checks beside it still go red |
| E7 | a settings box overflows horizontally — the box half only (F5) |
| E8 | a tab or pill shows more than one line box — for pills, only while the selector matches (F6) |
| E9, E10, E11 | the measured geometry or line counts break in the language actually rendered (for E11 see F3) |
| E12–E15 | a switch leaves the result line, the tooltip or the menu item in the old language (the Chinese dictionary text as literals) |
| E16 | digit grouping is lost (`12,345`); not whether it follows the language, as the case says |
| E17 | the stored `fr` is kept (French), or read as English instead of follow system (English title, no "follow system" on the trigger), the theme is reset, a toast is on screen, or the main process logs an error |
| G1 | a README is missing, lacks its link to the other, or its switcher row has other than one bold entry. Shown by the implementer's two planted breaks (`checklist.md`: exit 1 each, restored identical). The failing message was not kept, but no other `check:ui` rule reads a README's links or bold entries, so those exits are this rule's |
| The locking case | never, on this Mac (F1) |

By form: always-true — F5; tautology — none (literals throughout; `app-menu.test.ts`'s comparisons with `dictOf` sit
beside literal ones); dead path — none (a removed dictionary no longer compiles, and removed codes appear only as
rejected inputs); conditional skip — none in the changed files; an assertion that may not run — F6, while U8's async
case is awaited and every loop over `LANGUAGES` runs over two entries.

Browser and gate contexts (the review-code false-greens list): E17's "no toast" asserts that something does not happen;
`.toast` is the class E15 counts two of after a switch, so the selector does reach toasts. The widened gate exemption is
reviewed with the table above (form 7: a predicate).

- **F5. E7's page half cannot go red.** Measured 2026-10-21 on a fresh `pnpm build` of ac2a2e6 (its renderer bundles
  are the gateway's, `index-D5NY8TZU.css` and `index-Bjc6DBTt.js`), launched with the e2e launchers' environment (the
  system pinned to `en-US`, an empty project home, its own userData), settings open; E7's two metrics read as written.
  Baseline: `documentElement` 1100 / 1100, no box overflows. With the first row label made several times wider than
  its card: still 1100 / 1100, while `.settings` and `.field` report overflow. With a 3000px block inside
  `.settings`: still 1100 / 1100. `body` is `overflow: hidden` and `.settings` is `overflow: auto`, so nothing inside the
  page reaches the document — as the spec's Further Notes already record. The box half is what catches; the case as a
  whole is not a false green. The line predates this ticket, in a case it changed.
- **F6. E8's pill half has no non-empty guard.** `wraps([])` is `[]`, so if `.pane-body .sk-head .pill` matched nothing
  the pill assertion would pass with nothing measured. Tabs are guarded (`toBeVisible` on the first), pills are not.
  Today the selector is live (`SkillExpandBlock.tsx` renders `.sk-head`, and the case builds a project-level and a
  linked global skill). Predates this ticket.

Conclusion: two findings, F5 and F6; neither hides a failure of this ticket's behaviour.

### Resource reuse

Counted from the gateway's full run on bd7d697:

- The built app: `electron-vite build` ran once (`> electron-vite build && playwright test`), building each of its three
  bundles once (main and preload "building SSR bundle for production", the renderer "building for production", three
  "built in" lines), before "Running 144 tests using 1 worker". As the table says: one build per `pnpm e2e`.
- The quiet Electron copy: prepared once per run by Playwright's `globalSetup`, unchanged.
- Launches are not logged one by one (the list reporter prints a line per case), so they are counted from the code: one
  per changed case; two in E12, whose subject is the restart; two identical ones in the locking case (F1); one per
  language parameter in E11; the loops of E5 and E7–E10 inside one launch (E10: every language, mode and theme
  combination). Each launch gets its own empty userData from `mkdtemp`; nothing is rebuilt.
- Unit tests: no expensive resource; this ticket's unit files ran in 2–57 ms each in that run (prefs-store 57 ms, plural
  21 ms, index 6 ms).

Conclusion: no finding; the counts match the table.

### Findings handed back

No test, code or data file was changed by this check. Each finding is a to-do with no persistent home beyond this record:
the ticket owner decides whether it is fixed in #277's pull request, opened as an issue, or dropped.

| # | Impact | Recommended |
|---|---|---|
| F1 | The case named for the pin proves it at most once, and on an English platform not at all; the record states a header note that does not exist, and the recommended fix of record would not work | In this PR (a file it already changes): two launches through `launch()`, one as is and one with `AGENTSHED_SYSTEM_LANGUAGES: 'zh-Hans-CN'` in `extraEnv`, asserting the English and the Chinese Settings title. If the main process ignored the override, both would show the platform's own language, so one fails on any machine (a launcher losing its own pin is still caught only where the platform does not resolve to English). The minimal alternative: drop the loop, rewrite the comment to what the case proves, and add the gap to the header. Either way, correct the recommended fix in both review records |
| F2 | The degradation the AC names has no guard; the records count it as covered | In this PR: a unit test of `systemPreferredLanguages()`. Under vitest `electron` is the empty stub, so with the variable deleted `app` is undefined, the probe throws inside the try, and the result must be `[]`; add the override forms (a list, an empty string). Say in the test that the stub is what makes the probe throw. If not done, state the gap in `index.test.ts`'s header. Either way, correct `checklist.md`'s REQ-002/AC-02 row and the design review's line |
| F3 | The Chinese measurement of app-update::QR-001/AC-02 could silently become English | In this PR: one assertion per run that the seeded language rendered (`<html lang>` is `zh-CN` or `en`) |
| F4 | A title claims a property no e2e checks | In this PR: drop "and persisting" from the title, or relaunch on the same userData and assert the language held |
| F5 | A half-assertion that cannot fail sits in the case for QR-001/AC-01's settings page | Low; this PR or later: drop the page half, since `.settings` in the box list already catches |
| F6 | A future class rename would empty the pill measurement silently | Low; this PR or later: assert the pill count is above zero before measuring |

Records these findings affect, for the ticket's document sync checklist when they are resolved: the design review's
Coverage lines on the locking case (F1) and on the failing query (F2); its "Finding outside this ticket's change" and
the code review's second outside finding, whose recommended fix would not discriminate (F1); `checklist.md`'s
REQ-002/AC-02 planned verification (F2); `final-regression.md` Stage 1's "every failure-mode row it changed has a test or
a stated gap" (F2); and task 10 in `ticket-277-tasks.md`.

### Disposition (main agent, 2026-10-21)

All six findings are handled in this ticket's pull request, in files it already changes or, for F2, one new unit test
file. The rows they add or revise are in the test design table above (U19, E18, and the revised E3, E7, E8, E11), each
reviewed there before the tests were changed:

- Coverage: U19 reaches the failing-query branch through the project's own electron stub, the only way a unit test can
  make the platform query fail without mocking project code; E18 reaches both the pinned path and the injected path.
- Case design: no project module is mocked; the environment variable is set and restored around each U19 case.
- False greens: U19 is measured red with the try/catch removed (the failing-query case throws the stub's `TypeError`;
  restored identical); E18 fails on any machine if the injected list is ignored — measured on this English machine
  with the module made to ignore the variable and the app rebuilt: the injected launch read `Settings` instead of the
  Chinese title (exit 1), the module restored identical and rebuilt; E8's non-empty assertions close the empty-set pass; E11's language assertion closes the silent fallback.
- Resource reuse: E18 launches twice, as before; U19 uses no expensive resource.

| # | Disposition |
|---|---|
| F1 | E18: the locking case rewritten as two launches (pinned English, then an injected Chinese list); the outside-finding lines in this record and in the code review corrected |
| F2 | U19: a unit test of the system language read; `checklist.md`'s REQ-002/AC-02 row and `final-regression.md` corrected |
| F3 | E11: `<html lang>` asserted per run |
| F4 | E3: "and persisting" dropped from the title; persistence stays with the store's unit case |
| F5 | E7: the page half removed |
| F6 | E8: non-empty assertions before measuring |
