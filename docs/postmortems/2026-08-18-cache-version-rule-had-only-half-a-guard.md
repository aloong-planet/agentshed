# I forgot the cache bump, then wrote a guard that cannot guard it

**Date**: 2026-08-18 · **Surface**: the token metering cache (ADR-0023's change to the Codex and
Grok cache-write reading)

## What happened

ADR-0023 changed how one `FileAgg` field is computed — on the Codex and Grok sides `cacheWrite` went
from "parse the record's field" to "always 0". The implementation shipped through a full green gate
(typecheck, 65 unit tests, 57 e2e, smoke) **without bumping `CACHE_VERSION`**, which the constant's
own comment has required for computation changes since 2026-08-02.

Caught by `/review-code` in the same session, reading that comment. Had it shipped: on any machine
where the field had ever parsed non-zero, the existing cache keeps the value while the recomputed
total no longer includes it, so `input + output + cacheRead + cacheWrite > total` — the very
invariant the change exists to protect.

## The second, worse mistake

The reflex on finding it was to add a guard test: seed a previous-version cache carrying a stale
non-zero `cacheWrite`, assert it is recomputed. It went red before the bump and green after, and was
written up as "the computation half of the rule now has a guard of its own".

**It has no such thing.** The test seeds `CACHE_VERSION - 1` — one notch below the current value
whatever that is — so it never matches and always recomputes. It went red only during authoring,
while it was temporarily seeded at the literal current version. Measured afterwards: rolling
`CACHE_VERSION` back 13 → 12, reproducing exactly the mistake this postmortem is about, leaves the
new test **green**.

Worse, the first draft of this file asserted that the computation half of the rule "never got a
defence of its own" and "stayed unguarded for sixteen days". Both false. The 2026-08-02 postmortem
added a defence *and* the neighbouring test case carries a ⚠️ note stating precisely what it can and
cannot do:

> This case tests **the version invalidation mechanism itself**, not "the author remembered to bump".
> No unit test can cover the latter: a missed bump leaves no trace whatsoever in the code under test
> … Confirmed by measurement: rolling CACHE_VERSION back from 6 to 5 leaves this case green.
> The algorithm-change half relies on process alone.

That note is eleven lines above where the new test was inserted. It had already reached the
conclusion, already measured it, and already said the honest thing. I re-derived a worse answer next
to it, and wrote a postmortem claiming the ground was unbroken.

## Why the gate could not catch either mistake

For the missed bump: a missed bump leaves no artefact. There is no expression to evaluate, no branch
to enter, no value to differ. Every fixture builds against a fresh temp cache directory, so the
stale-cache path is not under-tested but **unreachable by construction**. The 2026-08-02 work
established this by measurement rather than argument, and it remains true.

For the false claim about the guard: nothing verifies that a newly written test fails for the reason
its name gives. The red observed during authoring was real, but it came from a temporary literal, not
from the mechanism the test would ship with — a red earned under conditions that do not survive to
the committed form.

## What was actually done

- `CACHE_VERSION` 12 → 13, with a version-log entry naming this as a computation change.
- The new test **kept but renamed and re-commented** to say what it does assert (after recomputation
  the field is 0 and the four fields still sum to the total) and, in a ⚠️ block, what it does not —
  with the measurement that proves it.
- No new defence against a missed bump, because there is none to add at the unit level. Saying so is
  the honest outcome; the previous claim was not.

## The rule to carry forward

**A guard written in response to a miss must be measured against that miss, not against the bug it
was convenient to reproduce.** The test-authoring red is not evidence: mutate the code back into the
exact mistake and confirm the new test notices. Here that takes one line and ten seconds, and it
turns "I added a guard" into "I added an assertion, and the class remains process-guarded".

**Second: before concluding a rule is unguarded, read what is adjacent to where you are typing.**
This is the same self-deception the 2026-08-02 postmortem is named for — citing the state of a guard
without verifying it — inverted. That one cited a protection that was not working; this one denied a
protection that was, while standing inside its comment block. Both come from answering a question
about existing defences from memory of the code rather than from the code.
