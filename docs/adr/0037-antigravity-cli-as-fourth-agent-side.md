# ADR-0037: Onboarding Antigravity CLI as the fourth agent side

- Status: Accepted (2026-10-28)

## Context

The request was to count Gemini usage. Google has since moved individual users off Gemini CLI: from
2026-06-18 it serves only enterprise Code Assist licences and paid API keys, and free, Google AI Pro
and Ultra users were moved to **Antigravity CLI** (`agy`), a closed-source Go binary that updates
itself several times a week. agy keeps each conversation in its own SQLite database whose rows carry
protobuf blobs, with a usage record per model call; the schema is not published and was read from the
descriptors embedded in the 1.4.9 binary. Measured on this machine against real sessions (API-key and
Google sign-in modes, a fork, a rewind, a subagent, failed calls), it differs from the three existing
sides in ways that each admit more than one answer: every call is stored three times in one database,
a fork copies the whole database, a rewind deletes usage, its input excludes cache reads, its model
names are not normalised, and its project-level skills directory is the one Codex already reads.

## Options

1. **The selected bundle** — Antigravity CLI as a full side, read from its own data root only; the
   trust ledger as registry; usage from the conversation databases, each call counted once; a
   four-field total; model names as recorded; unreadable conversations reported; turn contents from
   the transcript with rewound turns dropped; built-in skills unlisted; every component category
   grounded on real samples; `.agents/skills` shown as one group shared with Codex
2. Gemini CLI as the fourth side — deferred: the users this product serves no longer get access to it,
   and its session files omit background model calls and failed retries and are deleted after 30 days
   by default. Restart condition: usage through a paid Gemini API key or an enterprise licence needs
   counting, in which case it is a fifth side
3. Also scanning the desktop app's and the IDE's data roots — rejected: they are separate products,
   there is no sample of either on this machine, and the side's name would have to cover three
   products
4. Registry = the folders conversations ran in, or agy's own Project records — rejected: the former
   makes "registered" mean something different on this side (ADR-0019 rejected the same for Grok);
   the latter are shared with the desktop app and created automatically, not a decision the user made
   about a folder
5. Usage from `transcript_full.jsonl` — rejected: it is append-only and simpler to parse, but carries
   no model name and no call id, and the per-model breakdown needs the billed model
6. Total = agy's own `total_tokens` (input + output) — rejected: agy's input excludes cache reads, so
   cache reads would fall outside the total and the composition bar's buckets could not sum to it
   (token-stats spec G8)
7. Normalising model names (stripping a routing suffix, or using the display name without its effort
   level) — rejected: the suffix rule rests on one observed sample, and the display name is a
   different naming form from every other side's model ids
8. Skipping unreadable conversations silently, as the other sides do — rejected: a closed format that
   updates itself several times a week makes a silent drop more likely here than anywhere else
9. Crediting a conversation that spans several folders to every folder — rejected: project figures
   would count it more than once and stop adding up to the global total
10. Turn contents decoded from the database's step payloads — rejected: the payloads are undecoded
    protobuf and do not fit byte-range turn fetching; keeping rewound turns in the transcript view —
    rejected: the page would show turns agy itself has undone
11. Listing agy's built-in skills — rejected: they ship with the tool and are rewritten by it, and no
    other side's built-in skills are listed
12. Showing nothing for component categories without local data, as for Grok — rejected by the user:
    real samples are generated with agy itself before the spec is written
13. Listing `.agents/skills` under both Codex and Antigravity, or under Codex only with a borrowing
    note — rejected by the user in favour of one shared group: the first shows the same files twice,
    and the second misdescribes a directory agy's documentation names as its own default

## Decision

We adopt **option 1**:

- **Scope and data root**: Antigravity CLI is a full agent side — project list, token statistics,
  session list and turn contents, and the agents page's components. Only its own data root,
  `~/.gemini/antigravity-cli`, is read, together with the configuration it loads from
  `~/.gemini/config`; the desktop app's and the IDE's roots are not. Only the latest agy format is
  supported.
- **Registry**: `trustedWorkspaces` in agy's `settings.json` — the folders the user agreed to trust
  when agy asked, written by agy itself. A folder used only through headless runs is not a project;
  its tokens still count globally (the rule Claude and Grok already follow).
- **Session and project**: a session is one conversation database, identified by its path. A
  conversation spanning several folders belongs to the first folder it lists, presumed to be the
  launch directory — to be confirmed against a real multi-folder conversation during implementation.
  A subagent conversation is recognised by the parent conversation its own metadata names, never by
  where its file sits; its tokens count and it stays out of the session list.
- **Usage**: read from the conversation databases. Each call counts once across every database,
  identified by `response_id`, then `provider_assigned_message_id`, then `message_id` — signed-in
  sessions carry the first, API-key sessions only the last. A failed attempt that carries token
  counts and an id of its own counts too. A call without a timestamp is an undated row.
- **Total**: input + output + cache reads + cache writes. agy's input excludes cache reads, so this is
  higher than agy's own `total_tokens` by exactly the cache reads.
- **Model**: `response_model` as agy records it, without normalisation.
- **Unreadable conversations**: left out, with a structured notice on the Antigravity side giving how
  many could not be read.
- **No writes**: reading never creates or changes a file in agy's directories (the product's existing
  read-only stance); a plain read-only SQLite open was measured to leave `-shm` and `-wal` files
  behind, so the reading method is chosen in the spec under that constraint.
- **Turn contents**: from the conversation's `transcript_full.jsonl`, by byte range; a turn whose step
  indices are later reused — what a rewind leaves behind — is abandoned and stays out of the
  question index.
- **Components**: built-in skills are not listed. Subagents, plugins, MCP servers, memory and
  configuration are supported in this feature, each grounded on a real sample generated with agy
  before the spec is written. Project-level `.agents/skills`, which Codex and agy both load, is shown
  as one group shared by the two sides; how that group appears, installs and uninstalls is settled
  separately.

> **Settled the same day (2026-10-28)**: the group is the **shared skills directory** (CONTEXT.md). A
> project install offers it as one target, marked as shared by the sides that load it, rather than a
> Codex target and an Antigravity target that land in the same place — two options that behave
> identically were rejected as confusing. Uninstalling from it states that the skill goes for every
> side that loads it. Component samples are generated with agy itself — the official `flutter`
> plugin, and global and project-level MCP, subagent and rule files written as agy's documentation
> describes and confirmed through agy's own listings; once copied into the research record, the
> global samples are removed and the project-level ones stay in the demo project.

> **What the samples ground (2026-10-28)**: each category is shown only where agy was observed to
> load it, following the invariant that degraded judgements follow the target system's behaviour.
> Grounded: global plugins (enablement absent = enabled) and their bundled skills, subagents and MCP
> servers; global and project-level subagents; the global MCP file; global and project-level rules;
> the four global instruction files. Not shown: project-level MCP and the CLI-only rules directory —
> documented, but not loaded in the samples — and memory, because agy produced no knowledge item over
> an eight-turn session, so there is nothing to ground a reader on. A project's own `AGENTS.md`,
> which Codex and agy both read, is already shown once as a project file and needs no change.

> **Configuration narrowed, and the side's interface name (2026-10-28, during prototyping)**: the
> configuration sections stop distinguishing sides and show two entries only, **CLAUDE.md** and
> **AGENTS.md**. On the agents page, CLAUDE.md is `~/.claude/CLAUDE.md`, and AGENTS.md renders every
> global AGENTS.md that Codex or agy was observed to load and that exists — `~/.codex/AGENTS.md`,
> `~/.gemini/AGENTS.md` and `~/.gemini/config/AGENTS.md` (agy loads both of its own together, the root
> one first) — one after another, each headed by its path. On a project's page they are the project's
> own CLAUDE.md and AGENTS.md. The Codex `config.toml` summary and the Claude project settings summary
> are removed; no settings summary is added for agy. agy's GEMINI.md files and its rules (global and
> project-level) are shown nowhere — this narrows the grounded list above. Grok's global AGENTS.md is
> not added: there is no sample of it on this machine. In the interface the side is called
> **Antigravity** (badge AG, chip ANTIGRAVITY); documents keep "Antigravity CLI" to tell it from the
> desktop app and the IDE. The shared skills directory's group sits between the Codex groups and the
> Antigravity groups, and the count of unreadable conversations is shown on the Antigravity side card.

## Consequences

- Positive: individual Gemini users' usage is counted from a source that records background calls,
  failed retries and a server-side response id per call — more than Gemini CLI's files ever held; the
  four sides keep one meaning each for registry, session identity and total.
- Positive: forks, the triple record and subagents cannot double-count, because identity is per call
  across every database rather than per file.
- Negative: the reader depends on an unpublished, reverse-engineered schema of a tool that updates
  itself several times a week; the structured notice makes a break visible, it does not prevent one.
- Negative: a rewind deletes usage from the database; today's figure falls with it, and a past day is
  kept only by the archive's retention (ADR-0026), i.e. only if a scan saw it first.
- Negative: agentshed's Antigravity total reads higher than agy's own figures by the cache reads, and
  model names may carry unexplained routing suffixes such as `-n`.
- Negative: `.agents/skills` belongs to two sides at once, a case the effective view and project
  install did not have; generating component samples widens this feature's scope.
- Neutral: the per-file aggregate cache gains a fourth variant, so `CACHE_VERSION` is bumped in the
  same change; `UsageRow` already carries the side, so the archive format is unaffected. CONTEXT.md's
  `TokenTotals.input` invariant (cache writes as a Claude-only figure) must be amended when this side
  ships, since agy reports cache writes too.

## Sources

`~/research/antigravity-cli-internals/local-data-and-usage.md` (static analysis of agy 1.4.9 and its
embedded descriptors, and §10: real sessions on this machine, 2026-10-28, reconciled call by call
against headless output); `~/research/gemini-cli-internals/local-data-and-usage.md` §0.5 (Gemini CLI's
status); the upstream Gemini CLI README and Google's transition announcement; token-stats spec G8;
ADR-0019, ADR-0021, ADR-0026. The user's rulings of 2026-10-28 on every axis above.
