# ADR-0015: Failures cross IPC as an error code plus parameters; wording is left to the renderer

- Status: Accepted (2026-08-08)

## Context

The main process and the preload currently throw fully formed Chinese sentences (21 `throw`s in
`src/main/index.ts`, 8 `SkillOpResult.message` values in `providers/install.ts`, 6 in
`preload/index.ts`, and the entire validation reason layer at `shared/validate.ts:19-74`), and the
renderer takes `e.message` and renders it verbatim (e.g. `SessionPane.tsx:286`, "cannot open session:
{err}"). That freezes part of the UI copy outside the process boundary, so i18n cannot be completed
on the renderer side alone. Worse, the copy is already being used as a program value:
`errLabel` in `SubagentsView.tsx` decides which branch to display via `includes('不可读')` — change
the wording and that branch fails silently, with no test going red.

## Options

1. **Cross IPC carries only an error code and parameters, with no natural language; the wording is
   produced in the renderer in the current language; the validation layer is included**
2. Structure only the errors users commonly see, and leave developer-facing diagnostics like
   `validate.ts` in their original wording — rejected: diagnostics also bubble to the UI through
   `e.message` (the render path at `SessionPane.tsx:286` does not distinguish error sources), so
   keeping them means exposing Chinese to non-Chinese users in exactly the failure scenarios where
   being able to read it matters most
3. Standardise error copy on English and keep it out of i18n — rejected: it downgrades Chinese users
   precisely in failure scenarios, and it preserves the `includes` hazard unchanged, merely swapping
   a Chinese string for an English one
4. Build a "Chinese sentence → per-language wording" map on the renderer side — rejected: that makes
   whole sentences the keys, so changing the source wording breaks the mapping, and it cannot carry
   parameters such as "turn index out of range: {i} (of {n} turns)"

## Decision

We choose **option 1**: failures crossing the IPC boundary always travel as an error code plus
parameters, containing no natural-language wording at all, and the renderer renders them in the
current language on receipt. The "three shared pieces" established by ADR-0001 (domain types /
channels / structural validation) grow to four accordingly, with the error code enum and its
parameter types likewise living in `src/shared/` and imported from there by both ends. Branching on
error semantics is done on the error code, never by matching a substring of the copy.

## Consequences

- Positive: error wording becomes translatable, so i18n closes on the renderer side with no
  "half the UI translates, half does not" hole
- Positive: error codes become a stable contract, so semantic branches no longer drift with the
  wording; hazards like `errLabel` are eliminated as part of the conversion
- Positive: the error code set is an explicit enum, so adding a failure path makes "should the user
  see this, and what is it called" a mandatory question rather than an ad-hoc thrown sentence
- Negative: every new kind of failure now requires a new error code and six translations, which is
  more expensive than throwing a string; ad-hoc diagnostics during development get more friction
- Negative: the one-off conversion touches about 40 throw sites across main / preload / shared, which
  is not something incremental work can finish
- Neutral: an error code carries structural semantics only, with no stack; details ride on the
  parameters
- Neutral: the shape of contract fields such as `SkillOpResult.message` changes accordingly, and
  their existing tests need adjusting

## Sources

The requirements alignment session of 2026-08-08. The throw sites enumerated during research:
`src/main/index.ts` lines 188/203/204/217/238/244/246/247/251/261/263/264/265/273/275/278/288/302/
305/308/318/323/335/348/349/353/359/360, `src/main/providers/install.ts:33,35,38,42,57,69,72,77`,
`src/preload/index.ts:29,35,50,57,67,74`, `src/shared/validate.ts:19-74,81`, `src/main/security.ts:87`,
`src/renderer/src/md-links.ts:32,36`. The instance of copy used as a program value: `errLabel` in
`src/renderer/src/SubagentsView.tsx`. This ADR extends ADR-0001 (single type source for the IPC
contract, with runtime validation on both sides).

**Two corrections (found while implementing on 2026-08-09)**:
1. The instance above was originally recorded as `MemoryView.tsx:91` — **the filename was wrong**
   (the line number happened to be the same). During implementation, per "negative conclusions
   require a different method", a whole-repository search was run (`includes` / `startsWith` / `===`
   followed by a Chinese literal), confirming there is **exactly one** such site in the whole
   repository, in `SubagentsView.tsx`.
2. This ADR did not settle the carrier format; implementation measured it: when an Error crosses IPC
   in Electron, **its custom properties are all lost** (only `message` and `stack` survive), and the
   message is wrapped in an `Error invoking remote method '…': Error: …` prefix. So the code and
   parameters can only be serialised into the message, and decoding has to locate a marker inside the
   wrapped string — both natural approaches, `e.code = …` and `JSON.parse(message)` directly, are
   unworkable.
