// Session titles: strip harness noise out of human messages and take the first real question (a seam 1
// pure function).
//
// **The noise shapes come from real sampling, not from imagining a list** (2026-08-02, 297 real Claude
// sessions):
//   Warmup 188 · [cron:…] 92 · local-command-* 20 · slash commands 2.
// Of these, `<local-command-stdout>` is a second layer of noise that only surfaces after the earlier
// layers are stripped —
// sampling "the first message" cannot see it, and it was only found by running the real function over
// the stripped results.
// The "Conversation info" the research-phase spec listed **did not appear** in the sample, and we write
// no rule for a shape we have not
// seen — a rule we cannot verify against a real sample only freezes imagination into code.
//
// Two places intuition gets wrong, both corrected by real data:
//   - what follows `[cron:…]` is **the actual instruction**, so discarding the whole message discards a
//     real question; only the bracket may be stripped;
//   - a slash command's user input is inside `<command-args>`, not outside the tag.

/** The title cap (counted in code points, so a wide character is never cut in half) */
export const TITLE_MAX = 60

const CARGS = /<command-args>([\s\S]*?)<\/command-args>/
const CRON = /^\[cron:[^\]]*\]\s*/

function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * One human message → the real question inside it; null when the whole thing is noise.
 * The caller uses null to judge "this does not count as a question" (which affects both the title and
 * whether the session is listed).
 */
export function realUserText(raw: string): string | null {
  const t = normalize(raw)
  if (!t) return null

  // A warmup session: the whole message is that one word. It only counts as noise on **exact
  // equality** —
  // a real question containing the word ("where does the word Warmup come from?") must not be caught.
  if (t === 'Warmup') return null

  // `<local-command-*>` is the trace the harness leaves when wrapping a `!` command from the input box,
  // and no member of the family is human-written:
  // measured, we have seen caveat (13/297, the disclaimer before a command runs) and stdout (7/144, the
  // command output),
  // and we match by family rather than enumerating — the same mechanism will produce more sibling tags.
  if (t.startsWith('<local-command-')) return null
  // A skill body injected by a slash command, which appears as the user but was not written by one
  if (t.startsWith('Base directory for this skill:')) return null
  // Codex's harness speaking as the user, in the paginated format's user-message items (measured
  // 2026-09-11 over every rollout: 330 of 8285 items, all three shapes pure, none mixed with a human
  // sentence): the guardian's transcript preamble (328), a task notification (1), a delegation block (1).
  // Matched by prefix, since each is a family the same mechanism keeps producing.
  if (t.startsWith('The following is the Codex agent history')) return null
  if (t.startsWith('<task-notification>')) return null
  if (t.startsWith('<codex_delegation>')) return null

  // A slash command: the real input is only inside command-args; no such tag, or empty content, means it
  // is just the command invocation
  if (t.includes('<command-name>')) {
    const inner = CARGS.exec(t)?.[1]
    const v = inner === undefined ? '' : normalize(inner)
    return v || null
  }

  // cron: the bracket is a prefix the harness added, and what follows is the instruction the user wrote
  if (CRON.test(t)) {
    const rest = normalize(t.replace(CRON, ''))
    return rest || null
  }

  return t
}

/**
 * A noise-stripped question → a title (truncated by code point, so a wide character is never cut in half).
 *
 * Keeping this separate from `realUserText` is **necessary**, not cosmetic: stripping is not idempotent
 * over the same text
 * — `[cron:x] Warmup` strips once to `Warmup` and a second time to null. If what the caller holds is
 * already
 * stripped text, it must come through here and must not go through `realUserText` again.
 */
export function clipTitle(t: string): string {
  const cp = [...t]
  return cp.length > TITLE_MAX ? `${cp.slice(0, TITLE_MAX).join('')}…` : t
}
