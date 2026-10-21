# UI language — Coverage and acceptance checklist

Spec: [i18n](../../specs/i18n.md)
Other namespaces referenced: [app-update](../../specs/app-update.md),
[mac-distribution](../../specs/mac-distribution.md), [global-search](../../specs/global-search.md),
[landing-page](../../specs/landing-page.md)
Source commit: 9b7bb13 plus uncommitted changes (the 2026-10-21 rewrite of the specs for the two-language set,
on branch `feat/two-languages`, not yet committed)
Scope: incremental, the language set becoming Chinese and English (ADR-0035) and what it touches:
i18n::REQ-001, i18n::REQ-002, i18n::REQ-003, i18n::QR-001, i18n::CON-001; app-update::QR-001/AC-01 and
app-update::QR-001/AC-02 (their language count); mac-distribution::US-003/AC-01 (two READMEs instead of six);
global-search::CON-004 (its language count). landing-page::CON-002 changes its rationale only; its obligation
(Chinese and English only) is unchanged.

Not affected this round: the rest of the i18n spec — user stories 2–4 and 6–15, the dynamics of "follow
system", switching languages, the dropdown's behaviour other than its item count, number and time formats,
structured errors, the main process emitting no natural language, preference persistence and the application
menu. Basis: each of these obligations holds whichever languages exist; this round changes only which
languages their tests run in, not what they require. The i18n spec's old user stories carry no IDs, as in the
other partially migrated specs; the obligations this round changes are the ID'd ones above.

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| #277 body, "Decisions (owner, 2026-10-19)": "The UI languages become Chinese and English." Also the owner's answer of 2026-10-19 in the #239 requirements step (translated from the owner's Chinese): do not keep French and Japanese; open an issue; i18n supports Chinese and English only, the other languages removed | Confirmed and in force | i18n::REQ-001/AC-01, i18n::REQ-001/AC-03; ADR-0035 | The set is exactly two; "the other languages removed" kept as AC-03's negative condition (nothing in or naming a removed language remains) |
| #277 body: "Done before the first release: this issue blocks #239. No installation exists yet, so nobody loses their language on an update." Owner's answer of 2026-10-19: "before the release (Recommended)" | Confirmed and in force | ADR-0035 Decision; i18n spec Implementation Decisions ("Removing a language removes it from the value domain…") | Timing is a process fact (the blocking edge), not a product unit; its product consequence, no migration because no installation exists, is stated in Implementation Decisions. Release list empty on 2026-10-21 |
| #277 body: "The READMEs follow the app. The French, Spanish, Russian and Japanese READMEs are removed, and the language switcher lists Chinese and English. mac-distribution::US-003/AC-01's 'six READMEs' becomes two." Owner's answer of 2026-10-19: "READMEs reduced to Chinese and English as well (Recommended)" | Confirmed and in force | i18n::CON-001; mac-distribution::US-003/AC-01 | The switcher lists both; the existing gate rule (exactly one bold entry) kept. US-003/AC-01 keeps its identity, its README count becomes two |
| Owner's answer of 2026-10-21 (this requirements step): the selector "keeps the dropdown (Recommended)" over a segmented control | Confirmed and in force | i18n::REQ-001/AC-01; i18n spec Implementation Decisions, UI | Three items, follow system first, a divider, each language in its own script with its English name; the dropdown's behaviour unchanged |
| Owner's answer of 2026-10-21: "New ADR-0035 (Recommended)", ADR-0013 marked superseded in its language set | Confirmed and in force | None in the spec: ADR-0035, ADR-0013's status line and note, the ADR index | Not a product obligation; the spec cites ADR-0035 in its header |
| #277 draft acceptance criterion: "The language selector offers Chinese and English only, and the app shows nothing in the removed languages." | Confirmed and in force (drafted with the issue from the owner's decision) | i18n::REQ-001/AC-01, i18n::REQ-001/AC-03 | Same meaning |
| #277 draft acceptance criterion: "A system whose preferred languages include no supported one, and a stored preference naming a removed language, both land on a supported language without an error." | Confirmed and in force (drafted with the issue; the English fallback is ADR-0013's rule, unchanged) | i18n::REQ-002/AC-02, i18n::REQ-003 | REQ-003 adds "the other preferences keep their values, no notice": both are the existing invalid-value behaviour (the failure-modes row on an invalid language field), not new scope |
| #277 draft acceptance criterion: "No dictionary entry or code path for a removed language remains." | Confirmed and in force | i18n::REQ-001/AC-03 | Same meaning; AC-03 adds "no selector option", implied by AC-01 |
| #277 draft acceptance criterion: "The README set is Chinese and English, each linking the other." | Confirmed and in force | i18n::CON-001 | Same meaning |
| #277 draft acceptance criterion: "ADR-0013, the specs, the feature entries and CONTEXT state the two-language set, with no trace of the six." | Confirmed and in force, refined | None in the spec: a documentation obligation, checked in step 8 | ADRs are append-only, so ADR-0013's body keeps the six as its record of 2026-08-08, under a status line and note naming ADR-0035; other ADRs that mention six (0014, 0015, 0017, 0031, 0032) are records of their own dates and are not rewritten. Specs, feature entries and CONTEXT describe the current set |
| ADR-0013 (Accepted 2026-08-08): the i18n scope boundary (UI copy, failure information across processes, the application menu, the README), no RTL commitment, English fallback when no system language matches | Background | i18n::REQ-002/AC-02 (the fallback); the rest unchanged | In force; ADR-0035 restates that these stand |
| The ready-line measurement of 2026-10-19 (the version row at the settings page's width, Chinese and English on one line in all four version combinations measured) | Background | app-update::QR-001/AC-02 | The quality requirement keeps its criterion; only its language count changes |
| The existing i18n spec row "A fixed-width container in a verbose language: no truncation, no overflow and no wrapping onto a second line" | Confirmed and in force (existing requirement) | i18n::QR-001/AC-01 | Promoted to an ID'd unit with its scope ("Applies to") written out; the criterion is unchanged, measured in both languages |
| global-search::CON-004 "Each exists in all six supported languages" | Superseded by a later decision (ADR-0035) | global-search::CON-004 | Now "both supported languages"; identity kept |

## Spec → tickets → verification

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| i18n::REQ-001/AC-01 | The selector offers three options: "follow system" first, a divider, then Simplified Chinese and English, each named in its own script with its English name beside it | #277: implementation and user-path acceptance | Test (e2e): on the settings page, open the language trigger; the overlay holds three options in that order, one divider after the first, each language's native and English names |
| i18n::REQ-001/AC-02 | Every piece of UI copy exists in both languages | #277: implementation | Gate: `pnpm typecheck` (the English dictionary is typed entry by entry against Chinese); Test (e2e): switching to each language fills the settings title, section titles and rail tooltips |
| i18n::REQ-001/AC-03 | Nothing in the app is in, or names, a removed language | #277: implementation | Gate: `pnpm typecheck` (the language type has two members, so a removed code fails wherever a language is required); Test (unit): `isLanguage` and `setLanguage` reject `fr`, `es`, `ru`, `ja`; Evidence: a repository search for the four dictionaries, the four codes as language values and their native names, command and output recorded |
| i18n::REQ-002/AC-01 | The first entry whose primary subtag is Chinese or English decides, wherever it sits in the list | #277: implementation and user-path acceptance | Test (unit): `resolveLanguage` on `[ja-JP, zh-Hans-CN, en-US]` and `[fr-FR, en-GB]`; Test (e2e): launched with the system list `ko-KR, ja-JP, zh-Hans-CN, en-US`, the UI is Chinese on the first frame |
| i18n::REQ-002/AC-02 | No Chinese or English entry, an empty list or a failing query gives English, without an error | #277: implementation and user-path acceptance | Test (unit): `resolveLanguage` on `[fr-FR]`, `[ko-KR, ja-JP]`, `[]`, `null`; Test (e2e): launched with `fr-FR, ja-JP`, the UI is English; Test (unit): `systemPreferredLanguages()` with the platform query failing gives `[]`, and so English (added after the post-implementation check found no test reaching that branch) |
| i18n::REQ-003 | A stored preference naming a removed language reads as "follow system", the other preferences kept, no notice | #277: implementation and user-path acceptance | Test (unit): the preference store reads a file whose language is each of `fr`, `es`, `ru`, `ja` as "follow system" with the theme and mode kept; Test (e2e): a seeded preference file with `fr`, launched on a Chinese system, shows the Chinese UI with the trigger on "follow system" and no error notice |
| i18n::QR-001/AC-01 | Measured in both languages, no label or line in a fixed-width container truncates, overflows or wraps | #277: verification in both languages | Test (e2e): the sidebar's filter row, the settings page's boxes, the project tab row and skills pills, and the trend span controls, each measured in Chinese and in English |
| i18n::CON-001 | The READMEs are `README.md` and `README.en.md`, no other localisation, each switcher row linking both with one bold entry | #277: implementation | Gate: `pnpm check:ui`'s README rule over the two files, shown red by a mutation (a link removed); Evidence: the four files deleted in the diff |
| app-update::QR-001/AC-01 | Every string exists in both UI languages and passes the dictionary gates | #277: the language count | Gate: `pnpm typecheck`, `pnpm check:i18n` |
| app-update::QR-001/AC-02 | Measured in both languages, the labels and the result line stay on one line for every state of the line | #277: the language count | Test (e2e): the settings-updates case QR-001/AC-02, run in Chinese and in English |
| mac-distribution::US-003/AC-01 | Both READMEs gain download and install instructions with the first release | #239: implementation (this ticket changes the count only) | Verified by #239; not in this ticket's verification |
| global-search::CON-004 | Each new string exists in both supported languages | #277: the language count | Gate: `pnpm typecheck` |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-21; spec c39db9d (with ac2a2e6's Testing Decisions note); implementation 833a6e3, the full gateway `pnpm verify` exit 0 ([gateway-833a6e3.txt](evidence/ticket-277/gateway-833a6e3.txt)) | i18n::REQ-001/AC-01; #277; settings page → language trigger | e2e "the language selector: three items including follow-system and the divider…": passed | Passed |
| as above | i18n::REQ-001/AC-02; #277 | `pnpm typecheck` exit 0; e2e "i18n: both languages load…": passed | Passed |
| as above | i18n::REQ-001/AC-03; #277 | `pnpm typecheck` exit 0; unit `isLanguage` and `setLanguage` reject the four codes (852 unit passed); the search with its controls at the base commit ([removed-languages-search.txt](evidence/ticket-277/removed-languages-search.txt)) | Passed |
| as above | i18n::REQ-002/AC-01; #277; first launch | unit `resolveLanguage` cases (red before the change, green after); e2e "UI language: following the system resolves against the whole list…": passed | Passed |
| as above | i18n::REQ-002/AC-02; #277; first launch, and a failing system query | unit fallback cases (red before, green after); unit `systemPreferredLanguages()` with the query failing gives `[]`, so English (red with the try/catch removed); e2e "UI language: falls back to English when the system language is unsupported" on `fr-FR, ja-JP`: passed | Passed |
| as above | i18n::REQ-003; #277; launch with a stored `fr` | unit: the preference store reads each removed code as "follow system", other fields kept; e2e "UI language: a stored preference naming a removed language…": passed | Passed |
| as above | i18n::QR-001/AC-01; #277 | e2e side filter row, settings boxes, tab row and pills (sets asserted non-empty), trend span controls, each in both languages: passed | Passed |
| as above | i18n::CON-001; #277 | `pnpm check:ui` exit 0; red under two planted breaks (a missing link, two bold entries), restored identical; the four READMEs deleted in the diff | Passed |
| as above | app-update::QR-001/AC-01; #277 | `pnpm typecheck` exit 0, `pnpm check:i18n` exit 0 | Passed |
| as above | app-update::QR-001/AC-02; #277 | e2e "the labels and the result line stay on one line… › zh" and "› en", each asserting its seeded language first: passed | Passed |
| as above | global-search::CON-004; #277 | `pnpm typecheck` exit 0 | Passed |
| — | mac-distribution::US-003/AC-01; #239 | Not this ticket's verification | Unverified here; #239 verifies it |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source above with disposition "Confirmed and in force" reaches a spec unit or is stated as a non-product obligation | All rows of "Source → spec" | Done 2026-10-21; no source without a unit or a stated home |
| Reverse: each normative unit this round traces to a confirmed source | i18n::REQ-001/AC-01..AC-03, i18n::REQ-002/AC-01..AC-02, i18n::REQ-003, i18n::QR-001/AC-01, i18n::CON-001, app-update::QR-001/AC-01..AC-02, mac-distribution::US-003/AC-01, global-search::CON-004 | Each traced in the table. REQ-001/AC-02 (copy exists in both languages) restates user story 16 and ADR-0014 for the new set. REQ-002's examples are new; the rule (first supported entry in list order, English otherwise) is the existing one |
| No unauthorised expansion | i18n::REQ-003 "no notice is shown" | Existing behaviour for an invalid language value, which degrades silently; kept, not added |
| Decisions in conflict | i18n spec vs ADR-0013 | ADR-0013's language set is superseded by ADR-0035, which keeps its scope boundary; the spec cites both, so no conflict remains |
| Prototype gate, interface point by point | The language selector's overlay (three items) | Covered by the settings prototype, revised and confirmed by the owner on 2026-10-21 (answer "Confirm"). The rest of the settings page is unchanged. The READMEs are documents, not app interface (the same exception mac-distribution states). The prototype gallery's language dimension is prototype tooling |
| Failure modes by the user's operation sequence | First launch on a Japanese or French system; a list with Chinese after an unsupported entry; a development machine whose stored preference is French, then opening the selector; keyboard cycling; following the system while it changes | Each has a row or a unit: REQ-002/AC-01..AC-02, REQ-003 (the selector then shows "follow system" selected, since the preference reads as it), the dropdown table's cycling row, and the unchanged dynamics table |
| Spec → ticket, forward | Every unit in this round's scope | Each has an owning ticket: #277 for all but mac-distribution::US-003/AC-01, which #239 implements and verifies (this ticket only changes its count). landing-page::CON-002 changes its rationale only and has no verification here |
| Ticket → spec, reverse | #277's acceptance criteria (draft, in the issue body) | Each maps to a unit above, except the documentation criterion ("state the two-language set, with no trace of the six"), which is process: step 8's report |
