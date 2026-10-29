# CONTEXT.md → glossary only (2026-10-29)

Decisions (user, 2026-10-29):
- CONTEXT.md keeps only Language + Flagged ambiguities; tightened writing rules.
- Invariants leave CONTEXT.md: each surviving one becomes one line in the project AGENTS.md, pointing at
  where its reason lives (ADR / postmortem / gate / code comment).
- Engineering invariants: the cross-project mechanism moves up into the matching skill; the project-specific
  remnant becomes an AGENTS.md line.
- Global AGENTS.md:52 destination changes from "CONTEXT.md invariant" to "project AGENTS.md invariant".
- Scope: agentshed only; the other six repos with a CONTEXT.md are listed as a todo for the user.

Worktrees:
- agentshed: ../agentshed-context-glossary, branch docs/context-glossary-only
- skillshed: ../skillshed-wt-context-glossary, branch context-glossary-only
- agent-rules: ~/git/zhoulf/agent-rules-wt-context-glossary, branch context-glossary-only

## Tasks

- [x] A1 Classify the 25 invariants. 21 became AGENTS.md lines; light/dark declarations (already in the
      ui-design skill), the startTransition measurement and retried negative assertions (moved up into
      review-code's false-greens) left the project; `rail` became a glossary term.
- [x] A2 AGENTS.md Invariants section (six groups)
- [x] A3 Language entries: 52 entries, each at most two sentences; a second pass against the tightened
      CONTEXT-FORMAT removed UI details, procedures and identifiers after confirming each in its spec or ADR
      (stale default, borrowing copy, shared-directory install behaviour, Activity's reason, Codex memory
      visibility, time-window selection, trend-span charts). Added: Question (from Session), Rail.
- [x] A4 Flagged ambiguities: six entries, the two six-language entries merged; "Dual view" no longer appears in
      any document, the entry now names cross-project artifact aggregation, which the project-detail spec uses
- [x] A5 Contents at the top
- [x] A6 57 live references retargeted from CONTEXT invariants to AGENTS.md (code comments, scripts, e2e,
      specs, ops); ADRs and postmortems left as they are, AGENTS.md's Invariants intro resolves their
      citations. References to glossary terms checked and still resolve.
- [x] A7 pnpm verify (typecheck, lint, test, test:scripts, test:site, check:ui, check:lang, check:i18n,
      check:nul, e2e 168, smoke) exit 0 after installing site/'s own dependencies in the worktree; after the
      second CONTEXT.md pass, check:lang, check:nul and check:ui rerun, exit 0
- [x] S1–S8 skills (skillshed branch context-glossary-only); record in skillshed
      docs/.workings/context-glossary-only/skill-policy-check.md
- [x] S9 skill-policy self-check, both phases, converged
- [x] R1 agent-rules AGENTS.md: §52 destination and the invariant line format; §16; §18 wording
- [x] M1 memory reuse-parsers-over-regex.md pointer
- [x] P1 PRs opened: aloong-planet/agentshed#337, aloong-planet/skillshed#28, zhoulf1006/agent-rules#1
- [ ] T1 Todo for the other six repos (user decides where it goes)

## Found, not changed here

- docs/specs/skills-view.md:607 cites CONTEXT for the retired `differs` signal; CONTEXT.md dropped that entry in
  #107 (7a3d262), so the citation already pointed at nothing before this change.
- agent-rules: the shared checkout's main carries an unpushed commit (02d5f19) and uncommitted edits to
  AGENTS.md lines 35, 38 and 58; this branch touches lines 16, 18 and 52.
- skillshed: the shared checkout carries uncommitted edits in features-catalog/SKILL.md (line 18),
  github-ops/SKILL.md (lines 3–67) and github-ops/checks-gate.md (line 36); this branch touches other lines of
  the same files, so a pull there waits until those edits are committed or stashed.

## Round 2 (2026-10-29, same day)

User decisions: apply the fourth admission test (a term needs a confusable concept named in the entry, or a meaning
its words do not give away) and the second-sentence rule; then make every reader take the contents first and a
single entry only when its detail is needed.

- Removed six entries: Plugin-bundled components, Resume command, Data day, Past day, Structured error, Release
  channel; each is defined where it is used (ADR-0010 and skills-view, session-view line 35, ADR-0009, ADR-0026,
  ADR-0015, app-update spec line 25 and ADR-0032). Usage boundary stays: the rule admits a coined term.
- Second sentences removed where they stated a property or behaviour (Effective view, Effective enabled plugins,
  Project install, Usage boundary, Usage row, Accounting stamp, Observed value, Theme variable classes, Update
  check; half of Transfusion and Cold rollout), each found in its spec, ADR or code comment first. Compacted window
  keeps its second sentence: no spec or ADR states that a thread repeats its whole summarised history.
- Title "Filtering and searching" now matches its contents entry, so a single entry can be taken by name.
- 52 entries become 46; 349 lines become 310; 18,558 bytes become 16,330.
- docs/specs/app-update.md line 6 still cited "the invariant on outbound requests" under CONTEXT. The first round
  searched the lines that contain "CONTEXT", and this citation continues on the next line; a search over each
  CONTEXT line and the two after it found no other such case.
- Reading: the global instructions gain a section on reading CONTEXT.md (the contents through awk by section,
  single entries by paragraph); implement, tdd and the docs-layout seed point at it. The three commands were checked on this file and
  are silent under the truncation hook.
