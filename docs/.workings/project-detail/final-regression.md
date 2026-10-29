# Project detail — step 8 final regression

## 2026-10-29: CONTEXT.md read from docs/ and the glossary moved there (aloong-planet/agentshed#337)

Scope: the branch `docs/context-glossary-only` against main 53fad81 — the glossary slimmed to vocabulary, its
invariants moved to AGENTS.md (the general ones to skills), CONTEXT.md moved to `docs/`, and
project-detail::REQ-003 (the app reads `docs/CONTEXT.md` only). No tickets; not a closeout ticket, so the
feature-wide closeout does not apply. Version: 67ae3d8 (full run `gate-full.log`, overall 0) plus this step's
feature-catalogue edit. Languages in the search scope, counted by script: 49 files with Han characters and 187
with Latin letters among README.md, README.en.md, AGENTS.md, `docs/` (working records excluded), `site/src` and
`src/shared/i18n`; every search below has an English and a Chinese form where the fact has words, and
`CONTEXT` itself is written the same in both.

### Stage 1: changed declarations

| Declaration surface (changed on the branch) | Pair checked | Conclusion |
|---|---|---|
| docs/specs/project-detail.md | spec ↔ implementation: REQ-003/AC-01, AC-02 and each failure mode against `artifacts.ts`, the allow-list handlers and md-links (the spec final check in checklist.md) | true; every failure mode has a test (U1, U2, U4, E1, E4; checklist.md) |
| docs/features/project-detail.md | spec ↔ features: the new boundary line distils REQ-003's user-visible layer (root CONTEXT.md not listed, a link to it gets the notice); nothing beyond the spec | true |
| docs/features/project-detail.md, Artifacts tab line | the chip order "CONTEXT.md → ADR → …" against the implementation's chip labels | true, unchanged |
| docs/CONTEXT.md | CONTEXT ↔ all: no new term this round; header line 5 says the invariants are in `AGENTS.md`; no relative link to break by the move (0 link openers; control: 11 in project-detail.md) | true |
| AGENTS.md | line 3 names `docs/CONTEXT.md`; the invariants note names the three that moved to skills (step 7) | true |
| README.md:80, README.en.md:100 | both link `docs/CONTEXT.md` and describe it as the shared vocabulary, in their own language | true, consistent |
| docs/specs/{agents-overview, app-update, appearance, i18n, memory-view, plugins-view, projects-list, session-view, skills-view, subagents-view, token-stats}.md, docs/ops/mac-signing.md | each changed citation (word diff against 53fad81) against the AGENTS.md invariant or CONTEXT entry it now names: sampling, saved-page restore, outbound requests, link interception, floating layer, one markdown carrier, degraded judgements, a failure affecting one entry, the allow-list trace, page switch, main-process measurement, the archive, the cross-side buckets, the workflow pin; session ID in CONTEXT; ADR-0037 | every citation resolves |
| Code comments changed on the branch (src, scripts, site, e2e) | each CONTEXT or AGENTS.md citation against its target (step 7 sweep in tasks.md) | true after step 7 removed the one dangling citation in site/src/styles/global.css |
| ADR ↔ spec/features | no ADR written or changed this round; no ADR is in the proposed state | not applicable |
| Prototype ↔ implementation | no interface change (REQ-003's prototype gate exemption, declared in the spec) | not applicable |

### Stage 2: related declarations

| Relation | Rows (derived from) | Conclusion |
|---|---|---|
| File ↔ index row | docs/features/README.md row "Project detail" ("…configuration and artifacts"); docs/specs/README.md:30 | both still true; no file added or renamed |
| Rule ↔ template and generated docs | domain-modeling's CONTEXT-FORMAT (Contents first, one paragraph per entry titled `**name**:`, `docs/` location) ↔ docs/CONTEXT.md; repo-scaffold's docs-layout seed ↔ `docs/agents/` | docs/CONTEXT.md follows the format (its first `##` is Contents; the table-of-contents command reads it); `docs/agents/` holds only issue-tracker.md, nothing generated from the docs-layout seed |
| A fact ↔ its statements elsewhere: the glossary's location | `rg -uu` for path-like CONTEXT.md references; zh `\x{672F}\x{8BED}\x{8868}` (glossary), `\x{8BCD}\x{6C47}\x{8868}` (vocabulary); en `glossary`, `vocabulary` | every current statement names `docs/CONTEXT.md` or names the file without a location; the one root path left is sample content inside a prototype's mock CLAUDE.md (docs/prototypes/project-detail/prototype-detail.html:1009), which imitates another project, not this one |
| A fact ↔ its statements elsewhere: where the invariants live | every `CONTEXT` citation outside working records (23 lines, step 7); zh `\x{4E0D}\x{53D8}\x{91CF}` (invariant); en `invariants? (live\|are kept\|belong)` | true after step 7 (site CSS citation removed, AGENTS.md note qualified); `docs/specs/skills-view.md:607` cites a retired `differs` signal "see CONTEXT" that main's CONTEXT.md never held: predates the branch, raised to the owner |
| A fact ↔ its statements elsewhere: a root CONTEXT.md is not listed | the feature line, the spec's failure modes, checklist.md | consistent |
| Rule ↔ the gate guarding it | REQ-003 (`docs/CONTEXT.md` only) ↔ providers unit cases: docs only (U3), both (U1), root beside a populated `docs/` (U4), root without `docs/` (U2); the saved page's allow-list side ↔ E4 | every form of the rule is driven; no rule of this round is guarded by a scanning gate |

### Stage 3: events

| Event | Search or source | Conclusion |
|---|---|---|
| A dimension's member count changed: the glossary's terms (now 46) and the moved invariants (21 in AGENTS.md) | `rg` for counted wording (en `<n> terms\|entries\|invariants`, zh `\x{672F}\x{8BED} ?[0-9]+ ?\x{6761}` and `[0-9]+ ?\x{6761}(\x{672F}\x{8BED}\|\x{4E0D}\x{53D8}\x{91CF})` (n terms, n invariants)) | only a prototype's sample row naming CONTEXT.md with 14 terms (prototype-detail.html:726) and an unrelated i18n test comment; nothing states the real counts |
| A dimension's member count changed: artifact types or agent sides | — | unchanged (six types, four sides); the enumeration-wording gate's dimension is untouched |
| `Pending:` notes in scope | `rg -c 'Pending:'` over every touched spec, the feature file and mac-signing.md (control: `REQ-003` found 8 times in project-detail.md) | one, token-stats.md:573 (an observed multi-folder agy conversation): this round does not touch its condition, so it stays |
| New general rules this round, and where each canonical copy lives | the conversation's rulings | CONTEXT admission and writing rules, the `docs/` location: domain-modeling CONTEXT-FORMAT and repo-scaffold (aloong-planet/skillshed#28); reading the glossary table of contents first: the global AGENTS.md (zhoulf1006/agent-rules#1); invariants in the project AGENTS.md: the global AGENTS.md; the general invariants: ui-design, review-code false-greens, electron-scaffold, github-ops (skillshed#28); REQ-003: the spec. None lives only in a comment, a prototype or a review record |
| Work state changed | checklist.md, tasks.md, the PR | checklist.md current verification filled (step 7); PR #337's body to describe the docs/ move and REQ-003 before push |
| User-visible effect on projects not yet moved | the seven local repositories with a root CONTEXT.md (beadmaster, media-creator, Transfer, Transfer-rs, vlm-snapper, codex-weixin, fuse-bead-pattern-generator) | after this ships their CONTEXT.md is not listed until each moves it to `docs/`: the owner ruled every project follows the new location; the moves have no durable home in this repository and are raised to the owner |

Queue: every row above was judged; the step's only text change (the feature boundary line) was re-queued against
the spec's failure modes and the feature README row, both still true. The pre-closeout scope review found no
further event. Step 8 is complete for this round.
