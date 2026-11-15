# ADR-0035: The UI languages are Simplified Chinese and English, and the READMEs follow them

- Status: Accepted (2026-10-21)

## Context

Every UI language multiplies the copy to write and the fixed-width rows to check, and a row that fits in one
language can wrap in another. In the settings page's version row, the "ready to install" line wrapped onto a second
line in French and Japanese at the first release's version, which app-update's quality requirement forbids, and at
longer versions in Spanish and Russian too. Dropping a language once installations exist moves their users to
English on update.

## Options

1. **Chinese and English, in the app and in the READMEs, with French, Spanish, Russian and Japanese dropped before
   the first release**
2. Keep the six languages and shorten the French and Japanese wording of the ready line — not chosen by the owner,
   who preferred dropping the languages. Shorter candidates fit at the release's version, but at longer versions
   Spanish and Russian wrap as well, so the fit would reopen.
3. Keep the six languages and give the version row's line more room — not chosen by the owner, for the same
   preference.
4. Drop the four after the first release — rejected by the owner: installations would exist by then, and an update
   would move their users to English.
5. Keep the four READMEs while the app drops the languages — rejected by the owner: the README is inside the same
   i18n scope as the app's copy (ADR-0013), so its languages follow the app's.

## Decision

We adopt **option 1**: the app's UI languages are Simplified Chinese and English, and the repository's READMEs are
in the same two.

## Consequences

- Positive: every fixed-width row is checked in two languages instead of six; both fit the ready line on one line in
  all four measured version pairs, the longest included.
- Positive: a new string is written twice rather than six times, and what each dropped language needed of its own
  (Russian's plural forms, French and Japanese quotation marks) left with it.
- Positive: the app and the landing page speak the same two languages.
- Negative: users whose system prefers French, Spanish, Russian or Japanese see the app in English.
- Negative: adding a language back means translating every string again and rechecking every fixed-width row in it.
  The typed layer (ADR-0014) checks that one dictionary entry by entry against Chinese, but it is a round of work,
  not a switch.
- Neutral: a stored preference naming a dropped language degrades like any invalid value (i18n::REQ-003); only a
  development machine can hold one, since no release had shipped with those languages.
- Neutral: `plural()` stays, because English distinguishes one from many.

## Sources

The owner's decisions of 2026-10-19 (drop the four, before the first release, with the READMEs following the app)
and the requirements session of 2026-10-21. The GitHub release list of the repository, empty on 2026-10-21. How far
the ready line exceeded its room in the built app on 2026-10-19 (0 = it fits on one line):

| Running version | Found version | zh | en | fr | es | ru | ja |
|---|---|---|---|---|---|---|---|
| 0.1.0-beta | 0.1.0-beta.2 | 0 | 0 | 3 px | 0 | 0 | 4 px |
| 0.1.0-beta | 10.10.10-beta.12 | 0 | 0 | 24 px | 0 | 0 | 25 px |
| 0.10.0-beta.12 | 0.10.0-beta.13 | 0 | 0 | 44 px | 0 | 7 px | 45 px |
| 0.10.0-beta.12 | 10.10.10-beta.12 | 0 | 0 | 53 px | 8 px | 16 px | 54 px |
