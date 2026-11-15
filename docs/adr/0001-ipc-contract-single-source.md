# ADR-0001: The IPC contract has one type source in `src/shared/`, is validated on both sides, and carries structured signals only

- Status: Accepted (2026-08-09)

## Context

Structured clone hands each side of IPC an `unknown`, so when the main process and the renderer each keep a copy of
a message shape, drift shows up as silently undefined rendering. A sentence composed in the main process is fixed
outside the renderer's language, so the interface cannot be translated in full. Code that branches on such a
sentence breaks silently when its wording changes.

## Options

1. **One shared source in `src/shared/` (channel names, domain types, hand-written structural validators, the
   error-code enum), checked on both sides of the boundary, with nothing but structured signals crossing it**
2. A schema library such as zod — rejected when the validated surface was one snapshot and a handful of parameters
   (see Sources): not worth a runtime dependency and a second schema definition beside the types.
3. TypeScript types alone, with no runtime validation — rejected: IPC crosses the type boundary, so drift passes
   silently.
4. Error codes for the failures users commonly see, leaving diagnostics such as the validators' reasons as
   sentences — rejected: every failure reaches the interface through the same path, so the diagnostics would show
   untranslated in exactly the failures where reading them matters most.
5. Error text standardised on English and kept out of i18n — rejected: it downgrades Chinese users in exactly those
   failures, and code would still branch on the wording.
6. A renderer map from main-process sentences to their wording — rejected: a whole sentence as a key breaks on any
   rewording, and it cannot carry parameters such as a turn index.
7. The main process reading the dictionaries for the copy it sends over IPC — rejected: it would have to hold the
   interface language, which is renderer state, and follow every switch.
8. Structuring the failure-shaped data fields only — rejected: placeholders and the truncation marker are the most
   frequent copy on screen.

## Decision

We adopt **option 1**.

- **One source**: channel names, domain types, structural validators, and the error-code enum with its parameter
  types live in `src/shared/`, and both ends import them only from there. The main process asserts a payload before
  sending it and the preload checks it on receipt; a failure throws, naming the path of the field.
- **Structured signals only**: no payload crossing IPC carries user-facing natural language. It carries error codes
  with parameters, `null` for "no value here", booleans such as "was this truncated", counts and field values, and
  the renderer composes every sentence they stand for in the effective language: failure wording, placeholders,
  quantifiers, truncation markers and advisory copy.
- **Wording lives in the dictionaries**: outside them, neither the main process nor the shared layer holds wording
  that varies by language. The native surfaces the main process draws itself, the application menu and the launch
  dialog, take their copy from the dictionaries ([i18n spec](../specs/i18n.md)).
- **Branch on codes**: error semantics are decided by the code, never by matching wording.
- Developer logs never reach the interface and are outside this rule.

## Consequences

- Positive: a broken contract fails at the boundary at the first opportunity, and says where; there is one copy of
  the types, so drift has nowhere to hide.
- Positive: every word a payload stands for is translated in the renderer, and the main process needs the interface
  language only for the surfaces it draws itself.
- Positive: error codes are a stable contract, so a branch on them does not drift with the wording. The enum makes
  "should the user see this, and what is it called" a question every new failure path has to answer.
- Negative: every payload extension needs a matching validator change, and every new failure needs a code and its
  wording in each interface language, which costs more than throwing a string.
- Negative: data fields take richer shapes (text with a truncation flag, a structured error, a nullable value), and
  "no value here" must stay distinct from a legitimate empty string, or a placeholder overwrites a real empty value.
- Negative: no gate checks the rule. With the working language English (ADR-0017), a search for Chinese cannot tell a
  user-facing sentence in the main process from a log or an identifier, so the rule holds through review.
- Neutral: validation checks structure (fields and types), not semantics (value ranges).
- Neutral: an error code carries no stack; details travel as its parameters.

## Sources

Transfer's ADR on converging its message domain model onto a single source of truth. What crosses IPC in place of a
sentence, and the carrier format the codes take, are in the [i18n spec](../specs/i18n.md), Implementation Decisions.
The requirements sessions of 2026-08-08 and 2026-08-09. The validated surface at commit `64d12a4`: 36 channels and a
593-line validator module.
