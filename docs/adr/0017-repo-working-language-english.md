# ADR-0017: Repository working language is English

- Status: Accepted (2026-08-09)
- Relation: **partially supersedes ADR-0013**, specifically its clause "`docs/` stays Chinese-only". ADR-0013's language set and i18n scope boundary remain in force.

## Context

The product UI is now available in six languages, but **the repository itself is
entirely Chinese**: roughly 5100 lines — 2167 comment lines, 623 test case names, 49 markdown
files under `docs/`, and `CONTEXT.md`.

ADR-0013 decided that `docs/` would stay Chinese-only, reasoning that "1925 lines of engineering
artifacts × 6, cross-regression cost × 6, and a new failure mode where lagging translations make
the docs lie". **That reasoning targeted translating into six languages.** It does not hold for
switching to a single language: there is no ×6, and no drift between copies.

The actual problem is a different one: the product opened up to non-Chinese users while
**the repository stayed closed to non-Chinese contributors**. The comments carry a large amount of
hard-won causal knowledge ("measurement refuted this", "we hit this in practice") — precisely what
an outside contributor needs most and can least reconstruct from the code itself.

## Options

1. **Unify the repository working language as English**: comments, `docs/`, test case names and
   terminal output all in English. The six README translations and the i18n dictionaries are
   unaffected (the former is a public-facing front door; the latter's source language stays
   Chinese per ADR-0014)
2. Change terminal output only, leave the rest Chinese — rejected: this was actually implemented on
   2026-08-09 and immediately exposed the risk of a half-converted state ("English test names,
   Chinese comments"). A language boundary abandoned halfway is harder to maintain than either
   single language
3. Change `docs/` only, leave comments Chinese — rejected: comments carry **causes**, docs carry
   **conclusions**. A contributor who can read the conclusions but not the reasons will walk
   straight into the traps the comments warned about
4. Keep both languages side by side — rejected for exactly the reason ADR-0013 rejected six
   languages: two copies also drift, and "which one is the truth" immediately becomes a new dispute

## Decision

We choose **option 1**: the repository's working language is English. This covers source comments,
all engineering artifacts under `docs/` (specs / ADRs / features / postmortems / ops), `CONTEXT.md`,
test case names and descriptions, and everything a program prints to the terminal.

**Not covered**: the six README translations (public-facing, already settled by ADR-0013) and
`src/shared/i18n/` (its source language stays Simplified Chinese per ADR-0014 — it is the single
source of truth for product copy, which is a separate concern from the repository's working
language).

> **Extended (2026-10-08, ADR-0030)**: the working language also governs commit messages, pull-request
> titles and bodies, and issues — checked by a `commit-msg` hook and a pull-request workflow, issues by
> the writing rule alone.

## Consequences

- Positive: non-Chinese contributors can read **why**, not just **what** — the causal knowledge in
  the comments is this repository's least replaceable asset
- Positive: the language boundary becomes decidable ("everything in the repo except the READMEs and
  the i18n dictionaries is English") instead of the current rule, memorised case by case per file type
- Positive: the boundary is enforced by a gate rather than by vigilance — `scripts/check-lang.mjs` reads
  `git ls-files` and fails on any Chinese outside an allow-list whose every entry carries an exact line
  count. It was added after the conversion produced two defect classes no behavioural test could catch:
  blanket string replacement splattering into neighbouring context (the fixture and its assertion break
  together, so the tests stay green), and a hand-picked search scope silently excluding whole file types.

  > **Amended (2026-10-04)**: since 2026-08-10 the allow-list carries no line counts; each entry is a
  > shape predicate stating what form of Chinese is permitted and why (Chinese may be quoted in a
  > literal, never written as prose). A count fired on every legitimate change to a growing file,
  > training one reflex — raise the number — and was blind to substitution: delete a legitimate line,
  > add an illegal one, and the total holds. The rationale lives in the header of
  > `scripts/check-lang.mjs`.
- Negative: **the one-off cost is large** (~5100 lines), and translation quality cannot be verified
  by any automation — the same disease as the six-language product copy: a gate can prove
  "not empty", never "translated correctly"
- Negative: the author now reads and writes their own engineering docs in a second language, which
  costs precision — especially for the invariants and criteria whose wording was arrived at by
  repeated refinement
- Neutral: the repository will pass through a mixed-language state during the conversion.
  Batches **switch whole files at a time**; no file is left half-English — half a file in each
  language is harder to read than all Chinese

## Sources

Decided by the user on 2026-08-09. Scale measured with `grep -rn "[一-鿿]"` over `src/`,
`e2e/`, `scripts/`, `docs/` and `CONTEXT.md` (excluding `src/shared/i18n/`): 5100 lines.
ADR-0013's `docs/`-stays-Chinese clause lapses as of this ADR; its language set (six languages,
no Arabic, no RTL commitment) and i18n scope boundary continue to apply.
