# Ticket #316 — Document sync checklist

Ticket: [#316 check:ui's hand-kept lists leave new themes, sides, languages and colours unchecked](https://github.com/aloong-planet/agentshed/issues/316)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-316-tasks.md) · [test review](ticket-316-review-tests.md) · [code review](ticket-316-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The coverage checklist: a fifth round for #316 — its units `316::1`–`316::10` from the body's acceptance criteria, and their current verification once run | [checklist.md](checklist.md) | Done — the units 316::1–316::10 with the post-implementation check's cases, their current verification at 6b5aecc and on the delivery head a904c05's gateway, the audit row |
| Statements of what the changed rules check and where their lists come from, once they derive them (the gate's comments; any document that lists the brand or accent colours, the themes, the sides, the languages, the READMEs, the rail items or the ticket-number rule's scope) | `scripts/check-shared-ui.mjs`, `scripts/check-shared-ui.test.mjs`, `CONTEXT.md`, and whatever a search finds | Done — the gate's and the test's comments changed with the code (step 8, stage 1); the search found no document listing the colours, themes, sides, languages, READMEs, rail items or the ticket-number scope, and every statement about the gate stays true; CONTEXT's side-enumeration sentence fixed (step 8, stage 2, `evidence/ticket-316/step8-searches.txt`) |
| #314's records that left the gate's other hand-kept lists to the owner: the owner decided on 2026-10-26 (no check for `ALLOWED` and `EXEMPT`; the lists that mirror a growing set went to #316) | [ticket-314-review-code.md](ticket-314-review-code.md) ④, [ticket-314-doc-sync.md](ticket-314-doc-sync.md) (pre-delivery re-check) | Done — both name the owner's decision and #316 |
| Wording the owner asked for on 2026-10-27, outside the body's criteria: the avoided term "brand colour" for the `--p-*` values, and `package.json`'s description listing every side | `theme.css`, `docs/prototypes/_shared/trend-chart.css`, `docs/features/appearance.md`, `docs/specs/appearance.md`, the agents prototype, `e2e/app.spec.ts`, `scripts/check-shared-ui.test.mjs`, `package.json` | Done — commit 5074243; step 8's follow-up section names two findings left for the owner ("CC/CX" where every side badge is meant; `projects-list.md` listing every side); full gateway at 5074243 |
| Step 8 report: the two questions (no user-visible behaviour changes: the gate and its test) and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Done — the #316 section, three stages (2026-10-27); `docs/features/` unchanged |
| #316's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#316](https://github.com/aloong-planet/agentshed/issues/316) | Done — with the merge of this ticket's PR; after it, the tracker only: the items ticked, and a comment naming the merge commit, how its tree compares with the PR head, and the CI runs on that head |

Pre-delivery scope re-check (2026-10-27, on the branch at 6b5aecc with step 7's and step 8's edits): what the change does
and what its runs produced — the gate's mirrored lists and the rule reporting their sources, the widened scopes, the
test's 70 cases on three trees with their red runs and twelve changed copies of the gate, two full gateways (b03fc6e,
723db11) — against #316's body, the coverage checklist's fifth round (units, audit row), the task list (D1–D9, the source
check), both reviews with every finding's handling, #314's records and step 8. Added in this check: none. The
coverage checklist's row was closed with the delivery head a904c05's gateway (`VERIFY_EXIT=0`), and again with
5074243's after the owner's wording fixes. No item is Pending; the one Done with the merge is the tracker write-back
after it.
