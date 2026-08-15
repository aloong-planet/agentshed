# ADR-0019: Onboarding Grok as the third agent side

- Status: Accepted (2026-08-15)

## Context

"Agent side" has enumerated two data sources since the product existed. The xAI Grok CLI (1.0.0,
config root `~/.grok`) is now in use on this machine and accumulates the same kinds of artefact the
other two do: sessions, skills, subagents, plugins, MCP servers, memory. Fitting it into the existing
model is not mechanical, because Grok differs structurally from both existing sides in four places at
once, and each difference has a defensible answer in more than one direction: it keeps no dedicated
project registry, it stores a session as a **directory** rather than a file, it deliberately reads
Claude Code's configuration as a compatibility layer, and its usage records carry **real billing
cost** rather than token counts alone.

## Options

1. **The selected bundle** — registry = the trusted-folder ledger; compatibility-borrowed components
   stay out of Grok's own lists; cost is neither read nor stored; a session's identity is the
   authoritative update-stream file inside its directory
2. Registry = the session store's directory names — rejected: the names are percent-encoded absolute
   paths and decode losslessly, which is tempting, but it makes "registered" mean something different
   on this side than on the other two, where the registry is an explicit per-project record the agent
   writes on the user's decision. Measured on this machine the two disagree (4 session directories vs
   3 trust records — one project has sessions and no trust record), so the choice is not academic;
   the cost of the rejection is that such a project does not appear in the list, which is exactly how
   an unregistered Claude project already behaves, and its tokens still count globally
3. Compatibility-borrowed components shown inside Grok's own lists — rejected: Grok loads
   `~/.claude/skills`, `~/.claude/agents`, `~/.claude/plugins` and `~/.claude.json`'s MCP servers at
   runtime, so showing them under Grok is the more faithful reading of "effective view". It was
   rejected because every Claude entry would then appear twice (26 skills on this machine become 52
   rows), and telling the two occurrences apart needs a source-layer concept the product does not
   otherwise have. What the product owes the user instead is a sentence saying the borrowing happens
4. Read the per-turn cost — rejected: `turn_completed.usage` carries `costUsdTicks`, which is real
   billing data rather than an estimate, so discarding it is a real loss. It was rejected because
   Claude and Codex records carry no cost at all, so the metric would exist on one side of a
   three-side comparison and read as breakage on the other two; `docs/features/token-stats.md` states
   "no dollar cost estimation" as a boundary and that boundary stays
5. Session identity = the session directory — rejected: it is the more honest reading (a Grok session
   *is* a directory), but the four mechanisms hanging off `SessionMeta.file` — the `(path, mtime,
   size)` cache signature, the read allow-list, byte-range turn fetching, and search — are all
   defined over a file. A directory's mtime does not move when a file inside it is appended to, so
   the signature silently stops detecting change, and the other three would each need redefining in
   code shared with the two existing sides

## Decision

We adopt **option 1**, in four parts:

- **Registry**: Grok's project registry is its trusted-folder ledger, matching the other two sides,
  where the registry is a record the agent keeps per project rather than a by-product of session
  storage. A project with sessions but no registry record is not listed; its tokens still count
  toward global totals, the same rule Claude already follows.
- **Compatibility rule**: Grok's lists show only components under its own configuration root. Skills,
  subagents, plugins and MCP servers it picks up from Claude Code's directories are
  *compatibility-borrowed* and do not join Grok's lists; the Grok grouping carries one line of copy
  saying they are loaded at runtime, so the omission is visible rather than silent.
- **Cost**: `costUsdTicks` is neither read nor archived. The no-money boundary is unchanged.
- **Session identity**: a Grok session is identified by the absolute path of the authoritative update
  stream inside its directory — the one file that carries the conversation, the tool calls and the
  per-turn usage, and therefore the only one both the metering and the display pipelines need.

Provider segmentation needs no decision here: ADR-0008 already recorded that a new vendor is added by
a rule in `shared/provider.ts` or else falls into "other", so Grok's models get an xAI rule under that
existing decision rather than a new one.

## Consequences

- Positive: three sides now differ only in their parsers; the registry, identity and effective-view
  concepts keep one meaning each across all of them. Grok's per-turn records name the model that was
  actually billed, so its per-model breakdown is exact rather than the session-primary-model
  approximation Codex is stuck with (ADR-0006).
- Negative: a project used with Grok but never trusted is invisible in the list while its tokens are
  counted, so the list total and the global total disagree by design — the same disagreement Claude
  already has, now on a second side. Grok's effective view understates what Grok actually loads, and
  the compensating copy is the only thing that stops that being a lie.
- Negative: the per-file aggregate cache gains a third variant, so `CACHE_VERSION` must be bumped in
  the same change — an old cache entry read as the new shape is the 2026-07-30 production crash.
- Neutral: subagent sessions sit **beside** their parents rather than nested inside them (the parent's
  `subagents/` directory holds only a pointer file), so the existing "counts toward tokens, stays out
  of the list" rule applies unchanged, but the judgement must read the session-kind field rather than
  infer from directory depth the way the Claude parser does.
- Neutral: `UsageRow` already carries the side as a value, so the archive format and
  `ARCHIVE_VERSION` are unaffected by the third side.

## Sources

`~/.grok/README.md` §File Locations, §Claude Code Compatibility, §Session Persistence, §Skills,
§Plugins, §MCP Servers (bundled with Grok 1.0.0). Measured on this machine 2026-08-15: 4 session
directories against 3 trust records; `turn_completed.usage` carrying `costUsdTicks` and a
`modelUsage` map keyed by the billed model; a subagent session present at top level with its parent's
`subagents/` entry holding a 2756-byte pointer file only. The user's rulings of 2026-08-15 on all
four axes.
