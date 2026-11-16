# ADR-0037: Onboarding Antigravity CLI as the fourth agent side

- Status: Accepted (2026-10-28)

## Context

Individual users of Google's models no longer get Gemini CLI, which since 2026-06-18 serves only enterprise Code
Assist licences and paid API keys; they were moved to Antigravity CLI (`agy`), a closed-source binary that updates
itself several times a week. agy keeps each conversation in its own SQLite database whose rows carry protobuf
records under a schema that is not published, and a conversation can list several folders, be forked, be rewound
and start subagents. Its usage and its components are decided apart (ADR-0048, ADR-0049); what is decided here is
which data the side reads and what a project and a session are on it.

## Options

1. **Antigravity CLI as a full side read from its own data root only, with the trust ledger as its registry, one
   conversation database as a session, unreadable conversations reported, and turn contents from the transcript with
   rewound turns dropped** — chosen.
2. Gemini CLI as the fourth side — deferred: the users this product serves no longer get it, and its session files
   omit background model calls and failed retries and are deleted after 30 days by default. Restart condition: usage
   through a paid Gemini API key or an enterprise licence needs counting, in which case it is a fifth side.
3. Also scanning the desktop app's and the IDE's data roots — rejected: they are separate products, there is no
   sample of either on this machine, and the side's name would have to cover three products.
4. A registry of the folders conversations ran in, or of agy's own project records — rejected: the first makes
   "registered" mean something different on this side (ADR-0019 option 2), and the second is shared with the desktop
   app and created automatically, not a decision the user made about a folder.
5. Skipping unreadable conversations silently, as the other sides do — rejected: a closed format that updates itself
   several times a week makes a silent drop likelier here than anywhere else.
6. Crediting a conversation that spans several folders to every folder — rejected: project figures would count it
   more than once and stop adding up to the global total.
7. Turn contents decoded from the database's step payloads — rejected: the payloads are undecoded protobuf and do not
   fit byte-range turn fetching.
8. Keeping rewound turns in the turn contents — rejected: the page would show turns agy itself has undone.

## Decision

We adopt **option 1**:

- **Scope**: Antigravity CLI is a full agent side: project list, token statistics, session list and turn contents,
  and the agents page's components. Only its own data root, `~/.gemini/antigravity-cli`, and the configuration it
  loads from `~/.gemini/config` are read, in agy's latest format only, and reading never creates or changes a file in
  agy's directories.
- **Registry**: `trustedWorkspaces` in agy's `settings.json`, the folders the user agreed to trust when agy asked. A
  folder used only through headless runs is not a project, and its tokens still count globally.
- **Session and project**: a session is one conversation database, identified by its path. A conversation that lists
  several folders belongs to the first it lists. A subagent conversation is recognised by the parent its own metadata
  names, never by where its file sits; its tokens count and it stays out of the session list.
- **Unreadable conversations**: left out, with a notice on the Antigravity side saying how many could not be read.
- **Turn contents**: read from the conversation's `transcript_full.jsonl` by byte range; a turn whose step indices
  are later reused, which a rewind leaves behind, is dropped and stays out of the question index.

## Consequences

- Positive: the four sides keep one meaning each for a registry and a session, so the project list and the session
  pages need no rule of the side's own.
- Negative: the reader depends on an unpublished, reverse-engineered schema of a tool that updates itself several
  times a week; the notice makes a break visible, it does not prevent one.
- Neutral: the first listed folder is presumed to be the launch directory, which no conversation seen so far could
  confirm (token-stats::REQ-003/AC-08).
- Neutral: the interface calls the side Antigravity while documents keep "Antigravity CLI", since the desktop app and
  the IDE this side does not read share the product name (agents-overview::CON-004).

## Sources

`~/research/antigravity-cli-internals/local-data-and-usage.md` (static analysis of agy 1.4.9 and the descriptors
embedded in it, and §10, real sessions on this machine on 2026-10-28 in API-key and Google sign-in modes, with a fork,
a rewind, a subagent and failed calls); `~/research/gemini-cli-internals/local-data-and-usage.md` §0.5 (Gemini CLI's
status); the upstream Gemini CLI README and Google's transition announcement. On 2026-10-29 none of this machine's 19
conversations listed more than one folder. The owner's rulings of 2026-10-28 on every part above.
