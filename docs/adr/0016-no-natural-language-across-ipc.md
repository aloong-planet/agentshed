# ADR-0016: The main process emits no user-facing natural language (not just failure text)

- Status: Accepted (2026-08-09)

## Context

ADR-0015 converted **failures crossing IPC** into a code plus parameters, leaving the wording to the
renderer. After tickets 05 and 06 landed, `throw new Error` in `src/` outside tests is down to zero,
and contract fields no longer carry whole-sentence messages.

But a whole-repository search (`grep -a`, to avoid the false negative caused by NUL bytes in
`token-stats.ts`) shows the main process still has **22 sites** where Chinese flows to the UI —
and they are **not errors**, so they fall outside ADR-0015's literal coverage:

- `error` **data fields** from failed probing or parsing (the registry, subagent definitions), sent
  down with the snapshot rather than thrown;
- placeholder and degraded text ("(this line can no longer be read)", "(unknown tool)", "not set",
  "(Codex global memory)");
- the truncation marker ("…(truncated)"), which the main process **splices into the body text**;
- advisory copy (the skill reference depth suggestion), sent over IPC as a constant;
- configuration summary templates ("projects: N entries / mcp_servers: N sections"), where the
  quantifier is composed in the main process;
- the two entries in the shared layer's display-name table that vary by language ("Other" / "Total").

To a non-Chinese user these are just as unreadable as the error wording was. ADR-0015's **literal
scope** does not reach them; and quietly widening that ADR's applicability from "failures" to "all
copy" would mean a later reader of 0015 never gets this stronger constraint.

## Options

1. **Raise the constraint to: the main process and the shared layer must not emit any user-facing
   natural language; only structured signals cross IPC, and all sentence composition happens in the
   renderer**
2. Expand ADR-0015's Decision section — rejected: that changes the applicability of an **accepted**
   decision rather than adding to its consequences; a reader would have no way to see when or why the
   boundary widened, and the fact that it originally covered failures only would be lost
3. Move this copy into the i18n dictionaries entry by entry and still have the main process read it —
   rejected: the main process would then have to hold the current UI language and re-read it on every
   switch, and language is renderer state; this moves a renderer concern into the main process
4. Handle only the `error` data fields (the class most like 0015) and leave the rest — rejected: the
   placeholders and the truncation marker are precisely the **most frequent** things on screen, so
   leaving them means the line was never drawn

## Decision

We choose **option 1**: we rule that **the main process and the shared layer must not emit any
user-facing natural language**. Payloads crossing IPC carry structured signals only: error codes and
parameters, `null` (meaning "no value here"), booleans (such as "was this truncated"), counts and
field values. All sentence composition — including placeholders, quantifiers, truncation markers and
advisory copy — happens in the renderer, in the currently effective language.

The criterion is executable: run a whole-repository Chinese literal search over `src/main`,
`src/shared` and `src/preload` (**with `grep -a`**), and what remains should be only developer logs
that never reach the UI.

## Consequences

- Positive: i18n closes completely on the renderer side, with no "half the UI translates, half does
  not" hole
- Positive: the constraint is searchable and re-checkable rather than something a human has to watch
  for at review; ticket 14's copy gate turns it directly into a CI assertion
- Positive: the main process is fully decoupled from "the current UI language" — it does not need to
  know which language the user is looking at
- Negative: a number of data fields get more complex shapes (`string` → `CappedText` / `AppError` /
  `T | null`), so consumers need one more step to read a value
- Negative: "no value here" and "the value is legitimately an empty string" must be distinguished in
  the types, or `?? placeholder` will clobber a legitimate empty value
- Neutral: developer logs (`console.*`) were originally outside the constraint — they do not reach
  the UI, and forcing them into English would only make local debugging harder.
  **This clause was superseded on 2026-08-09 by ADR-0017**: the repository's working language is now
  English, so terminal output including `console.*` is in English too. The reasoning above weighed
  local debugging convenience for a solo Chinese-speaking developer; ADR-0017 weighs it against
  non-Chinese contributors being able to read the repository at all, and rules the other way.

## Sources

Implementing ticket 07 on 2026-08-09. The whole-repository enumeration before conversion:
`index.ts` (placeholders, truncation), `search-sessions.ts`, `token-stats.ts` (title fallback ×2),
`skill-package.ts` (advisory + truncation), `read-utils.ts` (truncation), `claude.ts` ×2, `codex.ts`,
`memory.ts`, `global.ts` ×2, `subagents.ts` ×3, `plugins.ts`, `turn-content.ts`, `shared/trend.ts`,
`shared/provider.ts`. One `console.error` remained after conversion, covered by the neutral clause
above. This ADR is a **scope extension** of ADR-0015 and does not rewrite it — 0015 records the
decision and reasoning for failure information as they stood then, and those still hold.
