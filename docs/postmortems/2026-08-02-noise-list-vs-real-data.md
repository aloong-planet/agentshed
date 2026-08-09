# Implementing from a list vs implementing from the data: the noise list missed 60% (2026-08-02)

Session titles have to be stripped of harness noise. The spec's research phase provided a list:
caveat / command-message / the cron marker / Conversation info. Implementing from it makes the unit
tests all green while **more than 60% of the titles are still wrong**.

What this entry records is not a particular bug but **the failure rate of the act of "implementing
from a list"** — there are 8 more tickets ahead reading the same agent-generated data, and this
lesson will be used repeatedly.

## The gap between the list and the real data

Sampling the first user message of 297 real Claude sessions:

| Shape | Actual share | On the research list? |
|---|---|---|
| `Warmup` (the whole message is that one word) | **188 / 297 (63%)** | **No** |
| `[cron:<uuid> <name>] <the actual instruction>` | 92 / 297 | Yes |
| `<local-command-caveat>…` | 13 / 297 | Yes |
| `<command-message>…<command-args>real content</command-args>` | 2 / 297 | Yes |
| `Base directory for this skill: …` | Common | **No** |
| `Conversation info (untrusted metadata):` + a json block | **0 / 297 sampled, actually 6 files** | Yes (the list was right — **my sample missed it**) |

The list **missed the single most common item**. The result of implementing from it: 63% of session
titles become uuid filenames.

**But the list was not entirely wrong either — I was the one who missed `Conversation info`.**
A recheck found it does exist (6 files), in the form of `Conversation info (untrusted metadata):` +
a json metadata block + **the human's actual words after that**. I had asserted from "not in the
sample" that it did not exist, and written that assertion into the spec and into this document —
**that is a false negative conclusion, and it is worse than a missed item**, because it gives whoever
comes next the false certainty of "already checked, it doesn't exist".

Why it was missed: the sample took the most recent 300 files by descending mtime, and these were
files over a month old. **The sample was biased toward the recent.**

## Two rules that intuition gets backwards

The list gives shape names but no structure. Two of them are guaranteed to be implemented wrong from
intuition:

- **`[cron:…]`**: intuition says "this one was triggered by a scheduled job, drop the whole thing".
  In reality what follows the bracket is **the actual instruction the user wrote**, so dropping the
  whole thing drops a real question. Only the bracket may be stripped.
- **Slash commands**: intuition says "anything starting with `<command-message>` gets dropped whole".
  In reality the user's input is inside `<command-args>`, and dropping it takes a real question with
  it; it is the ones with empty args, like `/clear`, that should be dropped whole.

Neither is knowable without looking at real samples.

## Noise is layered: sampling first messages cannot see the second layer

Something subtler: the sample above was "each session's **first** message". Only after the stripping
rules were implemented, and the real function was run back over real data to inspect **the titles it
produced**, did the second layer surface — `<local-command-stdout>` (command output, 7/144). It is
never the first message; it only rises to become the title after caveat and `/clear` have been
stripped.

In other words: **sampling the input side is not enough to find the noise; you have to look at the
output side.**

The same trap was hit twice in one round, in opposite directions:
- when scanning back for `local-command` tags I **forgot to sort by mtime**, got a different batch of
  files, and reported "not there";
- when sampling noise shapes I **did sort by mtime**, and so missed an old project from over a month
  earlier.

**"Not in the sample" is not "does not exist".** A negative conclusion needs its sampling method
disclosed even more than a positive one — a positive conclusion has at least one instance behind it,
while a negative one rests entirely on sampling coverage, and coverage is exactly the thing most
readily assumed to be "enough". To conclude "does not exist", use something that does not depend on
sampling, such as a whole-repository grep.

## Defences put in place

- The stripping rules were extracted into a pure function (`session-title.ts`), whose file header
  records each rule's **measured share** and its source rather than just the rule — so whoever
  changes it later can see how strong the evidence is.
- A shape seen only once **gets no rule**: `[Image #N] <real question>` appeared once in the sample
  and was readable as a whole, so no stripping was added for it.
- **The reason for not writing a rule has to be the right reason**: `Conversation info` was
  originally skipped for the reason "never seen it", and the recheck proved it exists — the reason
  that actually holds is that **it only occurs in unregistered projects, which per A2 are never
  displayed at all**, so a rule would be dead code. A wrong reason with an accidentally right
  conclusion will not be right next time.
- Match by **family** rather than by enumeration: `<local-command-*>` was observed with two members,
  caveat and stdout, and the same mechanism (the harness wrapping a `!` command from the input box)
  will produce sibling tags, so match by prefix.
- The spec's section A4 was rewritten as **a table with measured shares**, annotated with "the
  research-phase list is incomplete" and "scan back again after adding a stripping rule".

## Lesson

**A "list" produced during research is a lead, not a specification.** It comes from someone's recall
or a spot check, and neither its omissions nor its phantoms announce themselves — omissions
especially: you do not think to look for what is not on the list.

Three actionable criteria:

1. For anything reading **someone else's generated** data (agent output, third-party configuration,
   an external API), take your own sample before implementing and **argue with shares**; where the
   list and the measurement disagree, the measurement wins, and the gap gets written back into the
   spec.
2. After implementing stripping or filtering logic, **run the real function back over real data and
   look at the output**. Sampling the input side only finds the first layer.
3. **To say "does not exist", do not use sampling.** Sampling can prove existence, never
   non-existence; use something coverage-independent such as a whole-repository grep for a negative
   conclusion, or else honestly write "not seen in this sample" instead of "does not exist".

A meta-lesson attached to the last one: **the principle "do not write code for shapes you have not
seen" is not wrong; what was wrong was taking "I didn't sample it" for "it doesn't exist".** The
principle constrains **the strength of the evidence** (there must be a sample or a mechanism); it is
not a licence for "I couldn't be bothered to check".
