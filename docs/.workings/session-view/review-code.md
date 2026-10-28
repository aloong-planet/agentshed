
---

# Review — code (step 5), #217: a grown Grok session's page (2026-10-09)

Scope: the Grok branch of `sessionQuestions`' rebuild, `readGrokSessionMeta` (grok.ts), the rebuilt
entry kept for every side but Codex (whose entry is stored with its resume state).

## ① Underlying premises — no finding

- "The walk reads a stream's cwd from the directory two levels up and the subagent flag from the
  summary beside it" — read in `readGrokSessions`; `readGrokSessionMeta` applies the same two rules.
- A page can only be opened for a file in the scan's cache (the read allow-list), which the walk
  produced, so the path always has the sessions/<cwd>/<id>/updates.jsonl depth.

## ② Runnability — no finding

A directory name that is not valid percent-encoding returns null and the page reports
`session-meta-unreadable` (self-harm; the walk skips such a directory, so it never reaches here in
practice). The root test appends the separator, so a sibling directory sharing the prefix is not taken
for the sessions root.

## ③ Security — no finding

The entry point still requires the file to be in the cache; nothing new is read from outside it.

## ④ Consistency — class-level check done, no other instance

"A reader picks a side from a file's path and defaults to Codex": enumerated the path-based side
decisions in src/main — this rebuild was the only one. The other side-dispatching readers (turn
content, question text, search) take the side from `sessionQuestions`' result (the parsed agg's kind),
which now routes correctly. Smell baseline: no hit.

## Outside this change (recorded, not fixed)

The Claude branch's root test (`file.startsWith(claudeRoot)`) has no separator, so a sibling directory
named like `projects-x` would match. No such directory exists in Claude's layout; recorded only.

---

# Review — code (step 5): the session ID and resume (2026-10-28)

No ticket: a direct implementation of session-view::US-001, session-view::CON-001 to session-view::CON-003
([spec](../../specs/session-view.md)). Implementation reviewed: 080218a (the slices and their tests), and the two
fixes below, committed after this record. Scope: every file the implementation changed — the page payload's session
ID (engine, handler, contract, restore), the resume command builder, the show-in-Finder channel and its judge, the
header component and its styles, copy and icons, and the tests.

## ① Underlying premises — no finding

- Each side's ID source rests on the 2026-10-28 enumeration (1048 Claude Code files, 2525 Codex rollouts, 14 Grok
  sessions) and on each tool's own help and messages; nothing is assumed beyond them. The Codex per-file record held
  `sessionId` before this change, so no cache version bump was needed: caches built by the installed app already
  carry it.
- The comment in the show-in-Finder handler says the allow-list before the first scan is the restored one: checked
  in the scan — the live allow-list replaces the restored one in the same synchronous block that sets the first-scan
  flag, before it, so no moment treats a restored entry as live.
- "Finder's own call reports no failure": Electron's `shell.showItemInFolder` returns nothing; the existence check is
  therefore the only way to report a vanished file.
- The comments written in this change state causes only where they are established (the segment naming from the real
  file, the tooltip's anchoring from the code itself).

## ② Runnability — one finding, fixed

- F1 (fixed): the header component kept its state across a jump to the fork parent — the session page is not
  remounted for a fork parent, so a copy's check on the child page showed on the parent page's button for the rest of
  its 1.5 s. One page's state shown on another: a same-layer escape, so a bug. Fixed by keying the component by the
  session file, as the page body already is. Class check: the header's other parts (the exits, the badge, the title,
  the meta line, the startup hint) hold no state; the body is keyed — this was the only stateful part not keyed. Test:
  the e2e case now copies on the stale child page, jumps to the parent and reads the parent's button once inside the
  1.5 s; red before the fix ("sact done"), green after.
- Error paths and their escape surfaces: a refused clipboard and a vanished file each end in one toast (self-harm);
  a malformed saved page is dropped alone, as before (self-harm); the engine's call adds a field and no new failure.
  A file deleted between the existence check and Finder's call shows the folder without a selection (self-harm).
  The copy timer is cleared on unmount; a copy resolving after unmount sets state on a gone component, which React
  ignores.

## ③ Security — no finding

The command quotes the directory always and the ID unless it is made of letters, digits, '-', '_' and '.', so a path
or a record cannot add a command (unit-tested with shell characters). The new channel goes through the trusted-sender
wrapper, then the exact-path session allow-list, judged before the disk is touched (unit-tested with R1's bypass
vectors), then the existence and restored-entry checks. Agent text reaches the page only as React text nodes.
Re-scanned after F1: keying a component changes no security surface.

## ④ Consistency — one finding, fixed; smell baseline below

- F2 (fixed): the copied state shared the hover rule, so a copied button kept the darker border after the pointer
  left; the prototype changes the icon's colour only. The e2e case now compares a copied, unhovered button's border
  with a resting one: red before the fix (rgb(217, 220, 224) against rgb(232, 234, 237)), green after. Class check:
  the other state rule written here, the disabled one, matches the prototype.
- Invariants checked: no copy enumerates the sides; copy names actions, not glyphs; the tooltip is viewport-
  positioned and dismissed by the shared hook; the new colour is declared for light and dark alike; the dictionary
  is Chinese first; failures are worded in the renderer from structured errors.
- Smell baseline, on the code this change introduced:
  - Duplicated Code — the tooltip's dark form is written out twice now, in the rail's update button and in this
    header. FloatingBox's own comment records that a look written twice drifted once already. Listed below.
  - Mysterious Name — the session page's "Copied" reuses the dictionary entry `detail.staleCopied`, named for the
    stale note. Kept by ui-design's rule (reuse a synonymous entry when no other file has to change). Listed below.
  - Data Clumps — the project directory and its stale flag travel together into the page; two values, one consumer.
    Listed below.
  - The class names `sacts` and `sact` follow the session page's `s` prefix (`sback`, `stitle`, `smeta`): exempt.
    The side switches in the builder and the ID reader mirror the existing per-side dispatch: exempt.

## Refactors (listed for the owner; the owner's ruling of 2026-10-28 in the last column)

| Item | Why | Impact | Suggested | Ruling and outcome |
|---|---|---|---|---|
| The tooltip's dark form in one place: export it from FloatingBox and use it in the update button and the session header | Duplicated Code; FloatingBox's comment on a look written twice | Self-harm: a future change to one copy leaves the other behind, visibly | Now — one constant, two call sites | Done: `TIP_LOOK` in FloatingBox, used by both; the app-update e2e file (12 cases) and the session header case green after it |
| Rename the reused "Copied" entry to a shared name | Mysterious Name | Self-harm: a reader of the session header meets a stale-note key | Not now — the rename touches the stale note too | Not done |
| Pass the project entry instead of its directory and flag | Data Clumps | Self-harm | Not done — two values, one consumer | Not done |

## Outside this change (recorded, not fixed)

The prototype's session page meta line is 11 px and the app's 12 px, a difference that predates this change; left to
step 8's cross-check.

## Self-check before the post-implementation check's fixes were handed back (2026-10-28)

Item 1 (product code changed by the fixes, against its spec text): not applicable — the fixes for F1-F6 change tests,
the spec's testing decisions and the working records only; no product code.

## Found in step 8 (2026-10-28)

- F3 (fixed): `resumeCommand` chose the tool by a ternary whose last branch was Grok's, so a side added later would
  silently get `grok --resume`. The review had exempted the per-side switches as mirroring the existing dispatch; that
  exemption was wrong for a fallthrough that gives another side's tool. Now a record keyed by every side, so a new side
  fails the typecheck until it has a command. `sessionIdFromPath` keeps its null fallback on purpose: a side it does
  not know shows the unavailable form, never another side's ID. Class check: the other per-side code written this round
  (the engine's three branches, each returning that side's own value) has no fallthrough to another side.

## Owner-requested increment (2026-10-28)

After delivery the owner asked for two findings outside the change to be fixed in it: the page handler's question
identity arguments pinned by a test (session-view::REQ-001/AC-04), and the settings prototype's update tooltip drawn
with the app's shadow. Implementation reviewed: the working tree on 7ff103f — `e2e/startup-restore.spec.ts` (the
restart case) and `docs/prototypes/appearance/prototype-settings.html`. No product code changed.

### ① Underlying premises — no finding

- "The page waits out the fetch delay": the second launch sets `AGENTSHED_FETCH_DELAY_MS=1000`, and the page handler
  waits it before reading (index.ts, the session page handler); the turn handler has no delay.
- "The snapshot refetches the open turn": `invalidateOnSnapshot` covers `turnContent`, and the text mutation's run
  shows the turn's new answer under the old row (`identity-mutations.json`), which only that refetch can produce.
- "The rewrite keeps the question's byte range": a question record's first two fields are its line's start and end
  (question-index.ts, the record's header), and the two texts are 14 bytes each. Confirmed by the run: with the text
  dropped and the range kept, the old identity is accepted.
- "The line put before the question is not a question": the moved page lists the same two texts (asserted).
- The comment's "a record shape seen before the first question of a real Claude Code file": one file read on this
  machine; the comment claims no more than that.

### ② Runnability — no finding

- The observer is installed before the existing check that the scan is still held, so the check proves it was in
  place before the snapshot. It stays connected for the rest of the case; it only reads.
- Under the unchanged code the turn channel refuses the old identity, so no new answer reaches the old row (the
  passing run in `identity-targeted.log`); the two positive pairs are the state at install and the state the case
  already waits for.
- The two page reads add two delayed fetches to the case (about 2 s). Failure paths: an exception in the turn call is
  returned as its message and compared, so a different error fails the `session-not-indexed` assertion rather than
  passing it.

### ③ Security — no finding

Test and prototype only. The test's direct channel calls use the preload API the renderer uses, with paths the scan
registered.

### ④ Consistency — no finding

The recorder follows the reveal recorder's pattern in the same case (`globalThis` cast, read back with `evaluate`). The
comment over the inode swap no longer claims the rewrite pins nothing; the new comments say what each step pins and
why the range is read at the channel. The prototype's note matches its head comment's language and dating; its value
is the app's (`settings-tip.json`: 0 6px 22px at 0.18 light, 0.5 dark). Smell list: nothing touched.
