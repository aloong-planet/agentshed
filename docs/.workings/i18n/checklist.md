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

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source above with disposition "Confirmed and in force" reaches a spec unit or is stated as a non-product obligation | All rows of "Source → spec" | Done 2026-10-21; no source without a unit or a stated home |
| Reverse: each normative unit this round traces to a confirmed source | i18n::REQ-001/AC-01..AC-03, i18n::REQ-002/AC-01..AC-02, i18n::REQ-003, i18n::QR-001/AC-01, i18n::CON-001, app-update::QR-001/AC-01..AC-02, mac-distribution::US-003/AC-01, global-search::CON-004 | Each traced in the table. REQ-001/AC-02 (copy exists in both languages) restates user story 16 and ADR-0014 for the new set. REQ-002's examples are new; the rule (first supported entry in list order, English otherwise) is the existing one |
| No unauthorised expansion | i18n::REQ-003 "no notice is shown" | Existing behaviour for an invalid language value, which degrades silently; kept, not added |
| Decisions in conflict | i18n spec vs ADR-0013 | ADR-0013's language set is superseded by ADR-0035, which keeps its scope boundary; the spec cites both, so no conflict remains |
| Prototype gate, interface point by point | The language selector's overlay (three items) | Covered by the settings prototype, revised and confirmed by the owner on 2026-10-21 (answer "Confirm"). The rest of the settings page is unchanged. The READMEs are documents, not app interface (the same exception mac-distribution states). The prototype gallery's language dimension is prototype tooling |
| Failure modes by the user's operation sequence | First launch on a Japanese or French system; a list with Chinese after an unsupported entry; a development machine whose stored preference is French, then opening the selector; keyboard cycling; following the system while it changes | Each has a row or a unit: REQ-002/AC-01..AC-02, REQ-003 (the selector then shows "follow system" selected, since the preference reads as it), the dropdown table's cycling row, and the unchanged dynamics table |
