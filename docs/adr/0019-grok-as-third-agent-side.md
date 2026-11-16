# ADR-0019: Onboarding Grok as the third agent side

- Status: Accepted (2026-08-15)

## Context

The xAI Grok CLI (configuration root `~/.grok`) keeps the same kinds of artefact as the other agent sides: sessions,
skills, subagents, plugins, MCP servers and memory. It differs from them in four places, each with a defensible
answer in more than one direction: it keeps no dedicated project registry, it stores a session as a directory rather
than a file, it reads Claude Code's configuration as a compatibility layer, and its usage records carry a real
billing cost besides token counts.

## Options

1. **The registry is the trusted-folder ledger; components borrowed from Claude Code stay out of Grok's own lists;
   cost is neither read nor stored; a session's identity is the authoritative update stream inside its directory** —
   chosen.
2. The registry taken from the session store's directory names — rejected: the names decode losslessly to project
   paths, but "registered" would then mean something other than a record the agent writes on the user's decision, as
   it means on the other sides, and the two sets disagree (a project with sessions and no trust record). Such a project
   is left out of the list, as an unregistered Claude project is, while its tokens still count globally.
3. Borrowed components shown inside Grok's own lists — rejected: Grok does load Claude Code's skills, subagents,
   plugins and MCP servers at runtime, but every Claude entry would then appear twice, and telling the two occurrences
   apart needs a source layer the product does not otherwise have.
4. Reading the per-turn cost — rejected: `costUsdTicks` is real billing data, so discarding it is a real loss, but the
   other sides' records carry no cost, so the metric would exist on one side and read as breakage on the rest; the
   boundary of no dollar cost stays (token-stats, Out of Scope).
5. A session's identity is its directory — rejected: it is the more literal reading, but the cache signature, the read
   allow-list, byte-range turn fetching and search are all defined over a file, and a directory's mtime does not move
   when a file inside it is appended to, so the signature would stop detecting change and the other three would need
   redefining in code every side shares.

## Decision

We adopt **option 1**:

- **Registry**: Grok's project registry is its trusted-folder ledger. A project with sessions but no ledger record is
  not listed, and its tokens still count toward the global totals, as on the Claude side.
- **Compatibility**: Grok's lists show only components under its own configuration root. Skills, subagents, plugins
  and MCP servers it loads from Claude Code's directories are borrowed and do not join Grok's lists, and the Grok
  grouping says in one line that they are loaded at runtime.
- **Cost**: `costUsdTicks` is neither read nor archived.
- **Session identity**: a Grok session is identified by the absolute path of the authoritative update stream inside
  its directory, the one file that carries the conversation, the tool calls and the per-turn usage.

## Consequences

- Positive: the sides differ only in their parsers, so the registry, session identity and effective view keep one
  meaning each on every side. Grok's per-turn records name the billed model, so its per-model breakdown is exact
  rather than the approximation by a session's primary model that Codex has (ADR-0006).
- Negative: a project used with Grok but never trusted is missing from the list while its tokens are counted, so the
  list's total and the global total disagree by design, as they do on the Claude side.
- Negative: Grok's effective view understates what Grok loads, and only the one line of copy keeps it from
  misleading.
- Neutral: a subagent session sits beside its parent, whose `subagents/` directory holds only a pointer file, so
  whether a session is a subagent's, which counts toward tokens and stays out of the list (projects-list B8), is read
  from the session's own record rather than from directory depth.
- Neutral: a usage row carries its side as a value (ADR-0020), so a new side changes neither the archive format nor
  its version.

## Sources

`~/.grok/README.md` §File Locations, §Claude Code Compatibility, §Session Persistence, §Skills, §Plugins, §MCP Servers
(bundled with Grok 1.0.0). Measured on this machine on 2026-08-15: 4 session directories against 3 trust records;
`turn_completed.usage` carrying `costUsdTicks` and a `modelUsage` map keyed by the billed model; 26 Claude skills,
which Grok's lists would have shown as 52 rows; a subagent session at top level with its parent's `subagents/` entry
holding a 2,756-byte pointer file only. The owner's rulings of 2026-08-15 on all four parts.
