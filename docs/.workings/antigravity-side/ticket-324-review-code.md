# Code review — #324 Antigravity sessions and turns

Ticket: [#324](https://github.com/aloong-planet/agentshed/issues/324) (feature `antigravity-side`) · feature checklist:
[checklist.md](checklist.md)

Date 2026-10-29 · scope: every product-code change of the ticket, `c9f69aa..a91857a` (`src/main/index.ts`,
`src/main/providers/{antigravity,token-stats,question-index,turn-content,search-sessions,question-corpus,session-title}.ts`,
`src/shared/{session-resume,i18n/zh,i18n/en}.ts`, `src/renderer/src/{SessionPane,DetailPane}.tsx`), read as one diff
(1143 lines), with the test fixtures and cases read alongside · fixes in the commit that follows this record.

## Underlying premises

Findings: F1, F2 (fixed). The facts the code rests on were measured again, over every transcript on the machine
(read-only copies; script `verify.mjs` in the session scratch directory):

- step indices only fall at the measured rewind (three lines of `8c07e920`, nowhere else) — the premise of
  `agyKeptLines` and of the turn trimming;
- every one of the 24 calls is one call per response, followed (after any system messages) by a result line — the
  premise of pairing in order;
- all 11 system messages match the sender and body patterns; both creation echoes yield their conversation id;
- the transcript path `<root>/brain/<id>/.system_generated/logs/transcript_full.jsonl` with `<id>` the database's name
  (15 of 15 transcripts; the 4 empty conversations have none).

- **F1** — the `CACHE_VERSION` v19 comment said a v18 entry "would leave every conversation unlisted until it
  changed". Not so: the shape guard now requires the new fields, so a v18 Antigravity entry is turned away and read
  again one by one. The comment now states the bump as the shape rule's and says what the guard would do.
- **F2** — `readAgySummaryTitles`'s doc said an untitled conversation "is not in" the summaries; it is, with an empty
  title (measured for the fork and both subagents). Reworded to what the reader does: leaves it out.

The new comments that state a cause were checked against the code: the read source taken before the index (the
handlers' identity order), a failed rebuild failing the page only (the cache is not written on a null parse), titles
read per scan (no per-file cache of them).

## Runnability

No finding. Paths walked, each with its escape surface:

| Path | Behaviour | Escape surface |
|---|---|---|
| Transcript missing or not openable in the parse | No question; not listed; tokens count | Self |
| A transcript line that will not parse; a half-written last line | Skipped; the turn ends at the last parseable line | Self |
| Summaries missing, another shape, not a database | Every title falls back to the first question | By design of the one source (REQ-003/AC-03), not an escape |
| Summaries read failing while agy writes | The titles last read are kept | Self |
| Database read failing while agy writes (page rebuild) | `sessionParseFailed` for that page; cache untouched; next fetch reads again | Self |
| Transcript changed after the scan | Signature mismatch → that conversation re-read for the page; the next scan agrees | Self |
| Transcript deleted after the scan | `sourceIdentity` refuses → the page's error state (P6) | Self |
| A parent deleted since the last scan | Out of the cache at the next scan → the banner's gone form | Self |
| A parent unreadable in the supported format | Left out of the scan's readable set → the fork's banner says "no longer on this machine" | Same-layer, wording only — see the refactor list R2 (kept, written into the spec's failure modes) |
| Before any build in the process (search during startup) | Titles read once lazily; cached entries serve the index | Self |

The parse runs on the workers in production: the targeted e2e run under the built app's parse pool reported no
`[parse-pool]` line (the launcher counts it as an error).

## Security

No finding. The renderer can name only an admitted database path; the transcript path is derived on the main process
from that path's directory-listed name, and the page's and turn's handlers lstat the derived transcript (a replaced
symlink is refused, as for every side's session file). Finder is handed only allow-listed paths, now databases alone.
Agent text — prose with `file://` links, titles, system messages — reaches the renderer as data and renders as text
(e2e: no anchor inside the prose). The regular expressions over agent text are anchored by literals and lazy; the
transcript lines they run on are single JSON values.

## Consistency

No finding requiring a change; two items to the refactor list. Invariants re-checked against the change: the read
allow-list stays an exact set of what the renderer may name (R1); the page's identity check is taken on the file whose
bytes are read, as before; the question text is normalised by the one function every side uses (REQ-002); a cache shape
change carries its version bump and the archive stamps in the e2e cases moved with it (`+c19`); `listedOf` is now the
flag every kind carries.

Smell baseline over the changed code: Duplicated Code — the Antigravity banner repeats the Codex banner's linked-title
fragment (R1 below); Repeated Switches — `side === 'antigravity'` branches in `questionTextAt`, `turnBlocksFromText`,
`sessionIdFromPath`, the banner and the pill tooltip, each the existing per-side branching of its function (answered:
the per-side rules differ in kind, as for the other sides); the rest of the baseline does not apply.

## Refactor list (not executed)

| # | Content | Reason | Impact | Recommendation |
|---|---|---|---|---|
| R1 | Share the linked parent-title fragment between the Codex and Antigravity banners | Duplicated Code (about twelve lines) | Self; display only | Do not do now: the change is narrow and the Codex banner is outside this ticket's scope; worth doing if a third banner variant arrives |
| R2 | Tell an unreadable parent from a deleted one in the fork's banner | The gone wording is inexact when the parent still exists but cannot be read | Same-layer, wording only, and only when the parent was rewritten in a new format while the fork was not | Do not do: a new banner variant would need a prototype; the case is written into session-view's failure modes |

## Findings

| # | Layer | Finding | Disposition |
|---|---|---|---|
| F1 | Underlying premises | The v19 comment's claim about v18 entries did not hold | Fixed (comment) |
| F2 | Underlying premises | The summaries reader's doc misdescribed untitled rows | Fixed (comment) |

Instance or class: both are instances (named comments). The class question "a comment states a measured fact" was
answered by re-measuring every fact the new comments state (the premises list above).
