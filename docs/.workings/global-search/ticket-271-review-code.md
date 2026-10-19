# Code review — #271

Ticket: [#271](https://github.com/aloong-planet/agentshed/issues/271) · feature `global-search` · reviewed
2026-10-19 on branch `feat/global-search`, commits dff584f and 16daf97 on 57a6a5c, plus the test additions
below (uncommitted at review time, committed with this record). Scope: every change of the branch — the
question corpus and its two channels in the main process, the contract and the preload, the page, the jump and
the project list's reveal in the renderer, the copy in six languages, the styles, the shared-UI check's rail
exemption, and the e2e and unit tests.

## Underlying premises

No finding. Premises the change rests on, each checked against the code or measured:
- The corpus lists exactly what a project's Sessions tab lists: both take `perProjectStats.get(mergeKey(path))`'s
  sessions (the Sessions tab through the project detail's `stats`); the project list's set, stale projects
  included, is the snapshot's `projects`.
- The corpus can read before the first scan completes, from the restored statistics and the token cache on
  disk (S2): measured by the startup-scan e2e case, which hits while the scan is held.
- A search sent right after a scan waits for that scan's update: `refresh()` assigns the reading under way
  before its first await, and the main process asks for it before sending the snapshot. Held only by
  reasoning at first — now pinned by a corpus case (U14) that asks for the update and searches at once, red
  under a mutation that defers the scheduling by one tick.
- Showing the page again never asks for a finished reading and does ask after a failed one (otherwise the
  hint would flash on every return): held only by the library's documented `staleTime` function at first —
  now pinned by query-layer cases (Q3) over real observers, red under both mutations (always stale; always
  fresh).
- The new causal comments: the jump's "fetched first, so the search page stays on screen" — a mutation that
  switches at once turns the hold case red with the stage on Projects; the corpus's identity comment ("an
  answer appended leaves it unchanged") — the update case reads the answer-only session not at all, red under
  a mutation counting the turn's end; the snapshot ordering comment — U14 above.

## Runnability

No bug found. Paths walked:
- The corpus's states: never asked (a scan does nothing), reading (every caller joins one promise), read
  (a load resolves at once, a search reads no file), updating after a scan (a scan arriving meanwhile runs
  one more pass over the newer listing), failed as a whole (the load and the search reject; the next load or
  scan reads again). Each has a corpus case.
- Fault escape surface: a session that cannot be indexed, stat-ed or read — self only (left out; its texts
  removed; the pass goes on); a question whose range will not parse — self only (that question cannot match,
  the session's others can). A whole-pass failure can come only from the delay seam's pause or the listing
  callback, neither of which reads data; it surfaces as the search's failure line, never as "no hits".
- The renderer's states: before a keyword, reading, waiting for the answer (the previous answer stays — each
  answer carries its keyword, so the highlight is the answer's own), failed, no hit, hits, nothing to search
  (including the first launch before any snapshot). The page state survives unmounting through a module-level
  holder, reset by a restart.
- The jump: a cached or saved page switches at once; any other is fetched first; a later click or any rail
  navigation (the menu's Settings included) supersedes a pending jump, whose page stays cached. The list's
  reveal is a one-shot request cleared by the list once done.
- Concurrency with the token engine: the corpus calls `sessionQuestions`, which may rebuild one file's index
  and write the token cache — the same path, with the same interleaving against a build, as the session page.
  No new race.

## Security

No finding. The search keyword is checked for type and length (the project search's 200) before use; the
reading channel takes no argument; both go through the sender-checking wrapper. Every file the corpus reads
comes from the main process's own statistics, never from the renderer. A hit opens its session through the
session page's existing allow-list. Question texts are drawn as text nodes (the HTML case shows its characters
and creates no element); the only rich-text copy is the counts line, whose interpolations are numbers.

## Consistency

No regression found: the project search is untouched apart from exporting its highlight; the snapshot's
invalidation list keeps its six names (pinned by a query-layer case) and adds global search's; the rail's
other items keep their places (the update slot case checks the Search item too). New class names were
searched before use (`gsearch`, `ph`, `pn`, `pc`, `gs-note`, `reading-hint`: no other rule or element; the
descendant `.big` and `.sub` have no global rule). Colours are tokens only, and every interaction state is an
existing class's.

### Refactor list (for the owner; none done)

| # | What | Why | Impact | Suggested |
|---|---|---|---|---|
| R1 | One helper for "a question's byte range → its displayed text" | Duplicated code: the session page handler, the project search and the corpus each parse a range the same way (Grok slice vs JSON + `questionTextAt`) | None today (self); a fourth reader would copy it again, and a change to one copy (the Grok branch, say) would leave the others reading differently | A separate small task: it touches the project search's path, which CON-002 keeps unchanged in this ticket |
| R2 | One component for a session's hit card and rows | Duplicated code: the project search and global search draw the same `.grp` / `.gh` / `.hit` markup (the prototype makes it one shared block, session-hits); the highlight would move with it out of `DetailPane` | None today; the two would drift on the next change to either | With #272 or a separate task, for the same CON-002 reason |
| R3 | One constant for the keyword's 200-character limit | The literal appears in both search handlers, and the spec says the limit is the project search's | None today | Now or with R1; trivial |
| R4 | The highlight's alignment for letters whose lower case changes length | Pre-existing in the shared highlight: it indexes the original text with positions found in its lower-cased copy, so a question holding such a letter misplaces the mark — measured: in "İİx" the keyword "x" is found at index 4 of the five-unit lower-cased copy, and the mark covers nothing | Self: one row's highlight; the hit itself is right | Do not do — exotic, and fixing it means a matching routine both searches share |

### Found outside the change surface

- **A stripped Codex fork's session page title.** The session page's header takes its title from the token
  index (`sessionQuestions`), while every list — the project's Sessions tab, its overview, global search's
  cards — takes `SessionMeta.title`, which the scan rewrites for a stripped fork from the first question that
  is still displayed. So such a fork's page shows its parent's first question as its title while the lists
  show its own (seen in the jump e2e case: the card "Child asks to notarize the fork" opens a page titled
  "Parent question about signing"). Impact: every stripped Codex fork whose title came from its first
  question, on the session page header only. Suggested: a separate issue — it is session-view's (A1: the title
  and the question set share a source), and #272's exits sit in that header. It has no lasting home yet: the
  owner decides between an issue and dropping it.

## The owner's decisions, 2026-10-19, and their execution

- **R1, R2, R3: done now**, in 2d0a2ce. R1's helper replaces three copies whose behaviour was compared line by
  line before the change (the same Grok slice; the same trim, parse, object check and `questionTextAt`; null on a
  parse failure). R2's component draws exactly the markup it replaced in both pages — the project search's
  block and global search's block were read side by side with it (same classes, nesting, keys and pills; the
  project search's snippet and body marker passed in as the row's text and `inBody`). R3's constant replaces
  the two literals. Safety net: the existing tests, run whole by the gateway on 2d0a2ce.
- **R4: not done**, as suggested.
- **The stripped fork's title: [#278](https://github.com/aloong-planet/agentshed/issues/278)**. Writing it up
  widened the finding: a project's own search cards take the same index title as the session page header
  (both from `sessionQuestions`), so they show the replayed title too; the lists and global search's cards take
  the scan's rewritten one. The issue states both.
- **A hit row's number: centred, the app's way.** The prototypes' shared hits piece now centres it. Measured in
  both pages that use the piece by the text's own line boxes (`Range.getClientRects`), since the flex items'
  boxes are stretched to one height and their centres agree whatever the alignment: the number's text sat 3 px
  above the question's before, level after (global search 7 rows, project detail 4).
- **The landing page: not now, later** — held by [#279](https://github.com/aloong-planet/agentshed/issues/279).
