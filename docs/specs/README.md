# Spec directory

This directory describes **each feature's full requirements and boundaries in the current version**,
written for whoever is about to change that code.

- **Invariants**: one document per feature, with **slugs corresponding one-to-one to
  `docs/features/`**; it describes the present and is **rewritten in place** (no change history —
  that lives in git); removing a feature deletes the file (in the same batch as its features entry).
- **Why it persists**: "Failure modes and boundaries" is the only place in the whole documentation set
  that records *which boundaries this feature enumerated and which things are explicitly not done* —
  ADRs record decisions and trade-offs, features records current behaviour, and neither covers this
  layer. Lose it and the next person changing this code has no way to judge whether they have thought
  of everything.
- **Division of labour with features**: features is written for users and covers visible behaviour
  (zero implementation detail); a spec is written for developers and covers the full requirements
  (user stories, boundary enumeration, testing decisions, explicit non-goals, abstraction-level
  implementation decisions).
- **Division of labour with ADRs**: decisions and trade-offs belong in ADRs; a spec cites the number
  and does not restate them.
- **Consistency**: step 8 of every development round runs a single cross-regression
  (spec ↔ implementation ↔ features ↔ ADR ↔ CONTEXT ↔ prototypes).
- Tickets are the disposable working documents (`.scratch/`); a spec is not.

| Spec | Corresponding feature |
|---|---|
| [agents-overview](agents-overview.md) | [Agents overview](../features/agents-overview.md) |
| [projects-list](projects-list.md) | [Project list](../features/projects-list.md) |
| [project-detail](project-detail.md) | [Project detail](../features/project-detail.md) |
| [subagents-view](subagents-view.md) | [Subagents view](../features/subagents-view.md) |
| [memory-view](memory-view.md) | [Memory view](../features/memory-view.md) |
| [plugins-view](plugins-view.md) | [Plugins view](../features/plugins-view.md) |
| [token-stats](token-stats.md) | [Token statistics](../features/token-stats.md) |
| [session-view](session-view.md) | [Session view](../features/session-view.md) |
| [i18n](i18n.md) | [UI language](../features/i18n.md) |
| [skill-install](skill-install.md) | [Skills install](../features/skill-install.md) |
| [skills-view](skills-view.md) | [Skills view](../features/skills-view.md) |
| [appearance](appearance.md) | [Appearance](../features/appearance.md) |

> Note on reconstruction: this directory was created on 2026-08-01 (when specs became persistent
> artifacts). Specs for features predating that were discarded along with `.scratch/` and have been
> **reconstructed backwards** from features + the existing test cases + the code's behaviour (each
> document says so in its header) — the boundary entries all have corresponding tests and are
> trustworthy, but the original requirements reasoning cannot be recovered; where one conflicts with
> the implementation, the implementation wins and the document is rewritten in place.
