# ADR-0035: The UI languages are Chinese and English

- Status: Accepted (2026-10-21). Supersedes ADR-0013's language set; the rest of ADR-0013's scope
  boundary stands.

## Context

ADR-0013 set six UI languages: Simplified Chinese, English, French, Spanish, Russian and Japanese.
Preparing the first release, `v0.1.0-beta`, turned up a cost of the four that grows with every release:
the settings page's version row holds the label "Current version <running version>", the update line
and a button on one row, so a longer version string leaves the line less room. With the package version
`0.1.0-beta`, the "ready to install" line wrapped onto a second line in French and Japanese, which
app-update's quality requirement forbids. Measured in the built app on 2026-10-19, how far the line
exceeds its room (0 = it fits on one line):

| Running version | Found version | zh | en | fr | es | ru | ja |
|---|---|---|---|---|---|---|---|
| 0.1.0-beta | 0.1.0-beta.2 | 0 | 0 | 3 px | 0 | 0 | 4 px |
| 0.1.0-beta | 10.10.10-beta.12 | 0 | 0 | 24 px | 0 | 0 | 25 px |
| 0.10.0-beta.12 | 0.10.0-beta.13 | 0 | 0 | 44 px | 0 | 7 px | 45 px |
| 0.10.0-beta.12 | 10.10.10-beta.12 | 0 | 0 | 53 px | 8 px | 16 px | 54 px |

No release and no installation existed yet, so the language set could still change without anyone losing
the language they use.

## Options

1. **Drop French, Spanish, Russian and Japanese from the app and from the READMEs, before the first
   release: the UI languages become Chinese and English**
2. Shorten the French and Japanese wording of the ready line — not chosen by the owner, who preferred
   dropping the languages. Measured: shorter candidates fit at the release's version, but at the running
   version `0.10.0-beta.12` Spanish and Russian wrap as well, so the fit had to be reopened for longer
   versions
3. Change the version row's layout so the line gets more room — not chosen by the owner, for the same
   preference
4. Drop the four languages after `v0.1.0-beta` — rejected by the owner: installations would exist by then,
   and an update would move their users to English. Before the first release nobody has one
5. Keep the four READMEs while the app drops the languages — rejected by the owner: the README is inside
   the same i18n scope as the app's copy (ADR-0013), so its languages follow the app's

## Decision

We choose **option 1**: the app's UI languages are Simplified Chinese and English, both left-to-right,
and the repository's READMEs are Chinese and English. The change lands before `v0.1.0-beta`. The rest of
ADR-0013 stands: the i18n scope is the app's user-visible copy (failure information arriving across
processes included), the application menu and the README; this product makes no RTL commitment; when the
user has not chosen a language, the system's preferred languages resolve to a supported one, falling back
to English. ADR-0014's typed layer is unchanged: Chinese is the source language, and English aligns to it
entry by entry.

## Consequences

- Positive: every fixed-width row is checked in two languages instead of six. Chinese and English fit the
  ready line on one line in all four measured combinations, including the longest
- Positive: a new string is written twice rather than six times, and the four dictionaries (about 1,700
  lines) leave the codebase, with what each of them needed of its own (Russian's plural forms, French
  and Japanese quotation marks)
- Positive: the app and the landing page now speak the same two languages, which removes ADR-0031's
  consequence "the landing page speaks two languages while the app speaks six"
- Negative: users whose system prefers French, Spanish, Russian or Japanese see the app in English
- Negative: adding a language back means translating every string again and rechecking every
  fixed-width row in it. The typed layer keeps that incremental (one dictionary, checked entry by entry
  against Chinese), but it is a round of work, not a switch
- Neutral: a stored preference naming a removed language is an invalid value, so it falls back to
  "follow system" as any invalid value does; only development machines can hold one, since no release
  existed
- Neutral: `plural()` stays, because English distinguishes one from many

## Sources

The owner's decisions of 2026-10-19, made while preparing `v0.1.0-beta`: drop the four languages, before
the first release, with the READMEs following the app. The requirements session of 2026-10-21: the
language selector keeps its dropdown form, and this entry. The measurement of 2026-10-19: the built app
driven to the ready state with each pair of versions, the line's line boxes counted with a `Range` and its
natural one-line width compared with the width it was given. The GitHub release list of the repository,
empty on 2026-10-21.
