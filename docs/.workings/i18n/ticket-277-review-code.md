# Code review — ticket #277

Ticket: [#277 Reduce the app's interface languages to Chinese and English](https://github.com/aloong-planet/agentshed/issues/277)
· feature `i18n` · spec [i18n](../../specs/i18n.md)

- Date: 2026-10-21
- Version: branch `feat/two-languages`, c39db9d (ADR-0035, CONTEXT, the specs, the prototypes) and 7c1b7d8 (the
  implementation), plus one comment correction found here (below)
- Scope: the language set and its resolution, the four dictionaries and READMEs removed, the two gate scripts
  and their exemptions, every test that named a removed language, the source comments that counted languages, the
  feature entry and the site's notes

## Underlying premises

| Premise | How established |
|---|---|
| A stored preference naming a removed language degrades to "follow system" without new code | measured: the preference store's unit cases for each of `fr`, `es`, `ru`, `ja`, and the e2e launch with a seeded `fr` on a Chinese system, both green; the store validates the field with the same language guard the type now narrows |
| Nothing but the language guard decides whether a value is a language | the language type has two members, so typecheck lists every typed use of a removed code (it listed only tests); untyped uses searched in the whole tree, recorded in `evidence/ticket-277/removed-languages-search.txt` with controls at the base commit |
| Every place that lists languages was updated | class-level check below: every literal language list and every quoted removed code in the tracked tree, enumerated |
| Chinese and English fit the ready line in every measured version combination (ADR-0035) | the 2026-10-19 measurement; re-asserted by the e2e QR-001/AC-02 cases in both languages (green) |
| Chinese and English group digits and order month/day alike | measured on 2026-10-21 through the formatters themselves (`1,234,567`, `8/4` in both) |
| No installation exists, so no user loses a language | the repository's release list, empty on 2026-10-21 |
| The comments written in this change state only what was established | checked one by one; one carried-over comment was not (finding 1) |

Findings:

1. **The plural module's cycle guard never caught the cycle it names (found while rewriting the test).** With the
   cycle planted (`en.ts` importing `plural` from `./index`), the old assertions stayed green: since `plural()`
   takes the bare language code it reads no dictionary, so under vitest the undefined entry the cycle leaves is
   never touched. The same plant at 5ca6477, the commit that added the guard together with the leaf module, also
   stays green: the red it was written against came from `plural()` reading the dictionary, which that commit
   removed (postmortem 2026-10-21). Fixed in the rewritten test by asking the layer for the dictionary after `./en` has loaded;
   measured red under the plant ("expected undefined"), green restored. A carried-over comment then still said
   "the cycle bites at call time as well as load time", which the same plant disproves (the plural calls passed);
   the causal clause is removed. Class-level check: this is the only test guarding a module-graph property
   (`rg` for circular / cycle / before initialization over the test files: no other).
2. **Tests whose "valid" fixture value would have turned invalid.** The contract tests in `prefs.test.ts` pair a
   valid language with one invalid field to show that field refuses the whole object; with `fr` invalid they
   would have passed for the wrong reason. Every removed code used as a valid value was replaced with `zh` or `en`
   (the class enumerated by search, typecheck catching the typed ones); the removed codes now left in tests are
   only the lists asserting rejection.

Conclusion: two findings, both corrected; premises established.

## Runnability

- Entry and exit of the one state involved, the language preference: written by the selector (validated by the
  handler, which now rejects the four codes), read at launch by the store (an invalid value degrades to "follow
  system"), read by the renderer through the contract (it only ever receives a valid value). No path carries a
  raw stored value past the store.
- The selector with three items: positioning, hit tests and keyboard cycling measured by e2e (green); the
  component's option list comes from the language list, so no count is hard-coded in it.
- The menu rebuilds per language as before (unit and e2e green in Chinese and English).
- Error and degradation paths: none added. The removed-language degradation is the existing invalid-value path:
  it only hurts the one field (the other preferences keep their values, asserted).
- Measured during the targeted run: one failure in a case this change does not touch, "an open message follows
  the progress of the download…", which passed three of three alone. It is a timing race in the test (outside
  this change, below).

Conclusion: no finding in the change.

## Security

No new input, path or network surface. The change removes accepted values: `setLanguage` rejects four more codes,
and the system language list can resolve to fewer languages.

Conclusion: no finding.

## Consistency

- Class-level, every place that lists languages, enumerated by searching the whole tracked tree for literal lists
  and quoted removed codes: the language list (two), the two dictionary loops in `check-shared-ui` (two), the
  README rule's files (two), `check-lang`'s language names and file exemptions (Chinese only), the prototypes'
  dimension and settings list (two), the e2e loops (two), the site's own locales (unchanged, two). The quoted
  removed codes left are deliberate: the rejection lists in three unit tests, the seeded `fr` in the e2e case for
  i18n::REQ-003, the spec's text, and `check-message-lang`'s `ja`, which names a working language, not an
  interface language. The removed-language system tags left (`ja-JP`, `fr-FR` and so on) are inputs that must
  now resolve to Chinese or English. One case, `token-span` launching on a French system with English stored,
  still distinguishes "kept" from "reset" through its preference-file assertion, so it needs no change.
- Invariants: the agent-sides wording rule still scans every dictionary (its pattern now covers Chinese and
  English only, which is every dictionary there is); "degradation may only hurt itself" holds for the stored
  language (above).
- Smells, on the changed code: `launchWithLangs` gained an optional seeded file, used by one case — exempt: the
  other launch helper in the file already seeds files the same way.

Conclusion: no finding beyond the two above.

## Refactoring list

1. **The gate scripts list the languages again** (`check-shared-ui`'s two dictionary loops and README rule,
   `check-lang`'s names): content — they could derive the list from the dictionaries on disk; reason — duplicated
   code, a language added in one place would go unscanned in another; impact — a gate's coverage, not the app
   (self-contained: a dictionary missed by the scan is only unchecked, nothing else breaks); recommended — not now:
   this existed before the change, and adding a language is a deliberate round of work (ADR-0035) that revisits
   the gates anyway. For the owner to confirm.

## Findings outside this ticket's change

1. **The e2e case "an open message follows the progress of the download…" races its own script.** It waits for
   the slot to read 0%, then hovers and expects the tooltip at 0%; the scripted download steps every 700 ms, so on
   a slow cold launch the tooltip has already moved (seen once at 40% and 60%, then three of three green alone).
   Impact: an occasional false red in the gateway, nowhere else. Recommended: a small separate fix (assert the
   tooltip matches the slot's current value, or hold the first step). Home: not decided — raised to the owner with
   this delivery.
2. The e2e case on the language-locking mechanism never injects the system languages it loops over. The fix first
   suggested (inject them and assert English) would not discriminate after this change, since both lists now
   resolve to the pinned English (the post-implementation check, F1); the case is rewritten in this ticket instead
   (row E18 of [ticket-277-review-tests.md](ticket-277-review-tests.md)).
