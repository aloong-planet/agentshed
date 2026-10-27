# Ticket #296 — Document sync checklist

Ticket: [#296 The language gate names the prototype skill's copies in a list that cannot see a new or renamed template](https://github.com/aloong-planet/agentshed/issues/296)
· work directory `prototype-baseline` (no spec; the requirement source is the issue's body) · records:
[task list](ticket-296-tasks.md) · [test review](ticket-296-review-tests.md) · [code review](ticket-296-review-code.md) ·
coverage checklist: [checklist.md](checklist.md) · final regression: [final-regression.md](final-regression.md). The
gate's previous change, #223, has its records in the feature `i18n` (`../i18n/ticket-223-*.md`).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| #296's body gains the artifact declaration, the owner's decisions and acceptance criteria 296::1–296::5, before the work (the ticket predates these records) | [#296](https://github.com/aloong-planet/agentshed/issues/296) | Done — body edited on 2026-10-27; the original text kept verbatim |
| The coverage checklist: a sixth round for #296 — its units from the body's acceptance criteria, and their current verification once run | [checklist.md](checklist.md) | Pending — units, audit row, and the current verification at 446bad8 and for each fix's added cases (a32cd16, 70f1f3d, 9137bc6) written; the full gateway's rows on the delivery head follow |
| Statements of how the gate recognises the prototype skill's copies, once it reads the marker instead of the list (the gate's and its test's comments; any document naming `SKILL_TOOLING` or the copies as a list) | `scripts/check-lang.mjs`, `scripts/check-lang.test.mjs`, and whatever step 8's search finds | Done — the gate's and the test's comments changed with the code (446bad8, df9fdcf, and the test's later cases through 9137bc6); step 8's search over the documents in English and Chinese found no other statement naming the list or how the copies are recognised, and every statement about the gate stays true ([final-regression.md](final-regression.md), #296, stage 2; `evidence/ticket-296/step8-searches.txt`) |
| Step 8 report: the two questions and the cross-regression of what this change touched | [final-regression.md](final-regression.md) | Done — the #296 section, three stages (2026-10-27); `docs/features/` unchanged; #316's inflated count of files holding Chinese corrected in place |
| #296's acceptance items ticked and a comment naming the merge commit; done with the merge of this ticket's PR, then the tracker only | [#296](https://github.com/aloong-planet/agentshed/issues/296) | Done — with the merge of this ticket's PR; after it, the tracker only: the items ticked, and a comment naming the merge commit, how its tree compares with the PR head, and the CI runs on that head |
