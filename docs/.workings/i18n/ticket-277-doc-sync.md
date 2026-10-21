# Ticket #277 — Document sync checklist

Ticket: [#277 Reduce the app's interface languages to Chinese and English](https://github.com/aloong-planet/agentshed/issues/277)
· feature `i18n`. Created 2026-10-21 (the ticket was opened by hand, without these records).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The language set's decision, recorded when the owner decided it (requirements step) | [ADR-0035](../../adr/0035-ui-languages-chinese-and-english.md), [ADR-0013](../../adr/0013-ui-language-set-and-i18n-scope.md) status line and note, [ADR index](../../adr/README.md) | Done: c39db9d |
| The glossary's language terms, when the set changed (requirements step) | [CONTEXT.md](../../../CONTEXT.md): "Supported language", "Source language", the agent-sides invariant's wording, the retired "six languages" | Done: c39db9d |
| The specs' requirements for two languages (spec step); re-checked at the spec final check against the implementation | [i18n](../../specs/i18n.md), [app-update](../../specs/app-update.md), [mac-distribution](../../specs/mac-distribution.md), [global-search](../../specs/global-search.md), [landing-page](../../specs/landing-page.md), [skills-view](../../specs/skills-view.md), [projects-list](../../specs/projects-list.md), [agents-overview](../../specs/agents-overview.md), [appearance](../../specs/appearance.md) | Done: c39db9d; the spec final check of 2026-10-21 against 7c1b7d8 found every unit implemented, and step 7 added the i18n spec's Testing Decisions gap note |
| The prototypes' language set, before implementation (prototype gate) | `docs/prototypes/`: the settings page, the language dimension, the project list, the stale-note detail page, the heading ladder, the shared rail, project column and startup status | Done: c39db9d; the settings page confirmed by the owner on 2026-10-21 |
| The READMEs: the four other localisations removed, the language switcher rows of the two kept, with the implementation | `README.md`, `README.en.md`; `README.fr.md`, `README.es.md`, `README.ru.md`, `README.ja.md` removed | Done: 7c1b7d8; `check:ui` green, red under two planted breaks |
| The landing page's maintainer notes naming the app's dictionaries, with the implementation | [site/README.md](../../../site/README.md), the site dictionary's header comment | Done: 7c1b7d8 |
| The feature entry and its index row (step 8) | [features/i18n.md](../../features/i18n.md), [features/README.md](../../features/README.md) | Done: 7c1b7d8; the step 8 regression is in [final-regression.md](final-regression.md) |
| The defect found in step 4 (the plural cycle guard never failed), recorded at step 7 | [postmortem 2026-10-21](../../postmortems/2026-10-21-a-cycle-guard-measured-against-the-code-it-fixed.md), [postmortem index](../../postmortems/README.md) | Done: step 7 |
| The records the post-implementation check corrected (its findings F1 and F2), when they were resolved | [ticket-277-review-tests.md](ticket-277-review-tests.md) design review's coverage lines and outside finding, [ticket-277-review-code.md](ticket-277-review-code.md) outside finding 2, [checklist.md](checklist.md) REQ-002/AC-02 row, [final-regression.md](final-regression.md) stage 1, [ticket-277-tasks.md](ticket-277-tasks.md) task 10 | Done: corrected with the fixes |
| #239 realigns to the two-language main when it resumes: its branch is rebased, its tasks file's "Resuming after #277" section followed | #239's branch `feat/launch-beta` and its records under `docs/.workings/macos-release-line/` | Waiting: this ticket's merge, then #239's own work |
| #277's acceptance items ticked on the tracker with the merge commit | [#277](https://github.com/aloong-planet/agentshed/issues/277) | Done: completed with this PR's merge; the tracker write-back follows the merge |

**Pre-delivery scope re-check (2026-10-21, at 833a6e3):** the current state of every document this change touches
was compared with what the change did — the specs (the i18n spec's units against the final tests, including the
failing-query unit test added after the post-implementation check), the feature entry and index, ADR-0013/0035,
CONTEXT, the prototypes, the READMEs, the site's notes, the postmortem, and the records (checklist current
verification at 833a6e3, both review records, the tasks file). One difference found and fixed: the step 8 report did
not list the e2e launch helpers' pin comment, corrected after step 8; it does now. No other missing or outdated
item; nothing pending. The two waiting items name what they wait for.
