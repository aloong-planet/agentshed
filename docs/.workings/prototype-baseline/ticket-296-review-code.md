# Ticket #296 — code review

Ticket: [#296](https://github.com/aloong-planet/agentshed/issues/296) (feature `prototype-baseline`; no spec, the
requirement source is the body's acceptance criteria 296::1–296::5). Date 2026-10-27; implementation 446bad8 on
e4c9589 (branch `fix/check-lang-copy-marker`); scope: `scripts/check-lang.mjs` (`SKILL_COPY_MARKER`, `isSkillCopy`,
`mockupOnly` and their comments), `scripts/check-lang.test.mjs`, and `docs/prototypes/sync-mmd.mjs` re-copied. The
fixes are in df9fdcf (comments only).

## Underlying premises

Premises the change rests on, each checked against the current tree:

- Every verbatim copy under `docs/prototypes/` carries the marker in its first comment: the five copies do, each
  byte-equal to its master at skillshed 3db94ce, and no other file there holds the phrase at all
  (`evidence/ticket-296/copy-check.txt`, with a control search). Going forward, the skill's rule requires it and
  skillshed's `check-prototype-copies.mjs` reports a template without it. That check runs by the skill's rule,
  before a commit to skillshed, not in CI: skillshed has none. A copy taken from a template that skipped it would be
  exempt here, as any copy was before the list named it.
- The new comment's causal claim, that a list of names missed every copy the skill added or renamed until someone
  updated it, is #296's own finding and how #223 happened (its body).

Findings, both fixed in df9fdcf:

- F1. `SKILL_COPY_MARKER`'s comment said the templates "it has filled in", making the skill the one that fills them
  in; each prototype does.
- F2. `isSkillCopy`'s comment said the marker is read "after a leading `#!` line and `<!doctype>` line", which reads
  as both lines being required; the code skips each only where the file has it.

After the fixes, Security and Consistency were rescanned on df9fdcf: the fixes touch comments only, and both
layers' conclusions below stand.

## Runnability

- **Measured, side by side:** e4c9589's gate and this branch's gate on the same clean tree print byte-identical
  output, exit 0, 2270 permitted lines, 38 files under the prototype rule (`old-vs-new.txt`). The change alters no
  result on main.
- **Measured, on the real copies:** a Chinese comment line planted at the end of `demo-harness.js` and
  `index.html` turns the gate red, each reported at its line by the prototype rule; both files restored byte for
  byte (`plant-real.txt`).
- **Paths traced through `isSkillCopy`:**
  - a `//` run, including `//` lines left blank, as the real copies have them;
  - a block comment closed on the line that opens it, or on a later line;
  - indented comment openers;
  - CRLF line ends;
  - a file opening with code, or empty, which is not a copy.
  - A byte-order mark in front of a doctype stops the skip, so such a file is not a copy. skillshed's check reads
    the first comment the same way and reports a template like that, so the skill cannot ship one.
- **Error paths:** none. The function is pure and reads the text already in memory, once per file the prototype
  rule sees.

No finding.

## Security

The gate guards against accidental Chinese (its header names blanket replaces and holes in a hand-picked scope),
not against someone hiding it. One way past it is new: a copy whose marker is removed is treated as a mockup. That
takes a hand edit to a file the skill's rule says must not be edited by hand, and re-copying restores the marker. The
list it replaces had the opposite blind spot: every copy it did not name. No input reaches the gate from outside the
repository; it reads the files Git lists.

No finding.

## Consistency

- **Invariants kept:**
  - The exemptions stay predicates, not counts.
  - The prototype rule still matches files, so the dead-rule report still covers it.
  - `RULES`, the reasons and the CLI's output are unchanged.
- **Class-level check, any list in this gate that stops seeing a new member:** the gate's other lists, enumerated
  from the whole file:
  - `BINARY`: a new binary type is read as text, so it can only add reports.
  - `LANGUAGE_NAMES`: closed by ADR-0035.
  - `SCRIPT_KIND`: an unknown type falls back to the quoting rule, which is stricter.
  - The file lists inside `RULES`: a new file citing Chinese goes red until it is added.

  Each fails loud. `SKILL_TOOLING` was the only list whose missing member passed in silence.
- **Smells:**
  - *Duplicated code*: `isSkillCopy` reads the first comment as skillshed's `check-prototype-copies.mjs` does. The
    two live in different repositories with no shared package. Both follow the skill's rule, which fixes where the
    marker sits; exempt.
  - The other entries of the baseline list: no hit in the code this change touched.

No finding. No refactor item.

## Self-check of the fix after the post-implementation check

Item 1 (product code the fix changes, against the criteria it implements): not applicable. The fix for the test
review's findings 1 and 2 adds cases to `scripts/check-lang.test.mjs` only; `scripts/check-lang.mjs` is unchanged
since df9fdcf.

Item 1 for the second fix (the incremental check's findings 3 and 4, with D15 and D16 from its self-check): not
applicable. It changes `scripts/check-lang.test.mjs` only; `scripts/check-lang.mjs` is unchanged since df9fdcf.
