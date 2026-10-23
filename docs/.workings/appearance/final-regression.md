# Step 8 reports — appearance

## Ticket #281 — Slim scrollbars without a track, in light and dark

- Date: 2026-10-23
- Scope: this ticket's change only, `git diff fc3fbeb` on branch `fix/thin-scrollbars` (not a closeout: the feature
  has no tickets cut from a plan)
- Version: 29353e3 plus the step 7 and step 8 document changes

The two questions for the feature catalogue: **what became a lie** — nothing in the appearance entry was false, but it
said nothing of scrollbars; **what was missing** — a capability (slim scrollbars everywhere, no track, suited to light
and dark, the same with a mouse or a trackpad) and a boundary (no fading when idle): both written. The index row ("light/dark
× theme, the two independent") stays true: scrollbars are part of the appearance, not a third dimension.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `docs/specs/appearance.md`: appearance::REQ-001, sequence F, C2, UI decisions, Implementation and Testing Decisions, Out of Scope, Further Notes | The implementation (`theme.css`'s rule and tokens, read in the spec final check); the tests (the scrollbar cases, the macOS styles case, the six-state case, the memory case); the measurements in `evidence/ticket-281/` | True. The final check found no departure. C1, read again with the section C2 sits in, listed 10 theme-varying variables where 11 are measured: `--accent-soft-deep` added (stale before this round) |
| `docs/features/appearance.md`: the scrollbar capability and boundary | appearance::REQ-001/AC-01..AC-05 and F1–F8's user-visible layer; Out of Scope's "no fading" | True; no statement beyond the spec; nothing a user sees left out |
| `CONTEXT.md`: theme variable classes (the counts, "the scrollbar thumb" among the appearance-varying) | `theme-vars` over the theme stylesheet (`evidence/ticket-281/theme-vars.txt`): 11 / 28 / 4 | True after the update. The counts were stale before (9 and 20 written; 11 and 26 measured without this round's two) |
| The prototypes' shared stylesheets (the app window's scrollbar rule, the two thumb tokens) | The app's rule and tokens | The same values and the same shape; the prototypes scope the rule to the app window, the app applies it everywhere, which for the app's own surfaces is the same |
| ADRs | — | Row set empty: no ADR this round (the decision is a styling rule, easily reversed, below the ADR threshold) |

### Stage 2: related declarations

| Relation | Rows and how they were derived | Conclusion |
|---|---|---|
| File ↔ its index row | `docs/features/README.md`'s Appearance row; `docs/specs/README.md`'s appearance row | Both still true |
| One fact ↔ its other statements: what scrollbars look like | Searched in both languages the scope uses (44 files hold Han, 139 Latin): `rg -n -i "scroll ?bars?\|scrollbar"` and `rg -n "\u6eda\u52a8\u6761\|\u6eda\u52a8\u8f74\|\u6ed1\u5757\|\u6372\u8ef8"` over `docs/specs docs/features docs/adr docs/ops docs/prototypes CONTEXT.md README.md README.en.md AGENTS.md src/shared/i18n site/src/i18n` (all 11 paths listed first as existing). English: 54 lines, every one in this change's files; Chinese: none, with a control (`\u7684` found in `src/shared/i18n/zh.ts`) | No statement outside this change; the UI dictionaries carry none in either language |
| One fact ↔ its other statements: the theme variable classes | `rg -n -i "appearance-varying\|theme-varying\|Currently [0-9]+"` over `docs` and `CONTEXT.md`: ADR-0024 and token-stats use the class names without counts | True; no other count to update |
| Rule ↔ the gate that holds it: the thumb tokens follow the appearance only | The six-combination e2e case (since the test check's T4) | Holds the tokens in every run; shown red under a theme-declared thumb |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: appearance-varying variables, +2 | Statements that list or count them: CONTEXT's class counts; the spec's C2 list | Both updated; the C1 omission found beside it, fixed |
| `Pending:` notes in scope | `rg -n "Pending" docs/specs/appearance.md docs/features/appearance.md`: no output (exit 1) | Row set empty |
| New general rules this round | Every scrolling area draws the app's scrollbar, from one rule; no element sets a standard scrollbar property (it would bypass the rule) | The first is appearance::REQ-001; the second written into the spec's Implementation Decisions this round (it lived only in the code review record before) |
| Work state changed | #281's issue (its decision, artifacts and items); the coverage checklist; the document sync checklist; the task list | Updated here; the issue's items are ticked on the merge, the tracker only |

Queue empty; the pre-delivery scope re-check is recorded in the document sync checklist.
