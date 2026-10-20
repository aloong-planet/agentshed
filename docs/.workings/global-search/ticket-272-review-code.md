# Code review — #272

Ticket: [#272](https://github.com/aloong-planet/agentshed/issues/272) · feature `global-search` · branch
`feat/global-search-exits`. Reviewed 2026-10-19. Implementation version: 09966e1 (the exits), with 53e3ab3 (the
capability declaration) before it; against 5dfbf0d. The owner then had both refactor candidates done and the
outside finding O-2 fixed: 5bd38dd (R-a, R-b) and 7d8ea36 (O-2); the layers below are re-reviewed on 5bd38dd
where the refactor changed what they describe. Scope: the session page's exits row and the origin of an
opened session (App, SessionPane), the row's styles, the two chevrons' comments, the copy in six languages, and
the e2e cases.

## Underlying premises

No finding.

- The way back relies on #271's search page keeping its keyword, sort, scroll position and last answer for the
  run outside the component: run, not assumed — E8 returns to the same keyword, sort and scroll position, and
  to the rescan's newer answer.
- The stale form relies on the project's entry in the current snapshot: read per render, so a project that turns
  stale while its session is open reads "Go to <project>" at once. A project gone from the snapshot reads the
  plain form and leads where the single back control already leads (the project page for a path no longer
  listed) — the same target as before this change, read from the code, not run.
- The comments this change writes, each against the present facts: the origin comment in App (which paths drop
  it, and that the rail keeps it) — E9, E10 and the mutations M1, M3, M11; the row's comment ("drawn as the
  prototype's exits") — 94 computed values equal ([measurements](evidence/ticket-272/measurements.md)); the
  stale copy's comment (a stale project has no Sessions tab) — E9 asserts no tabs; the chevrons' comments — the
  old "the two never appear in the same slot" was no longer true and is gone. The e2e comment's cause ("measured,
  not raced") is the first run's failure: the scroll position read after the click was 0, the restored one 848.5.
- The existing comment kept on `.sback` (the chevron moved out of the copy) matches ADR-0018's consequence.

## Runnability

No finding.

- The origin's paths, on 5bd38dd: the origin is part of the open session's value, so it cannot outlive the
  session it describes. Every call site that replaces that value (a search of the setter's name: five, the setter
  never passed on): the jump from a hit sets a session opened from search; the fork banner's parent and a session
  opened from the project's tab set a session without it; choosing a project and leaving for the project's
  Sessions tab (the back control and the way on into the project, one handler) set none. The rail does not touch
  it, so J7 holds. On 09966e1, where the origin was its own state cleared by hand, the mutations showed what the
  cases guard: removing the fork parent's clear turned J5 red (M1), and removing the three clears on the way into
  the project turned J4 red (M11), while each of those three alone survived as redundant (M2, M9, M10) — the
  redundancy R-b names, now gone by construction. The e2e cases ran green on 5bd38dd's code (the global search
  file and the seven app-spec session cases, 17).
- A jump superseded by a later click or by the rail changes nothing (the pending-jump counter), as in #271.
- The row is drawn outside the page's loaded content, so a hit whose session cannot be opened (J8) still shows
  the two exits above the error — read from the code, not run.
- Long text: the row stays on one line and cuts each exit with an ellipsis, as the prototype draws it. Measured by
  narrowing the window on real data: at 560 and 500 px wide both exits are cut (the text 52 of 72 and 90 of 124
  px at 560), the last exit ends at the header's content edge, the row stays 21 px high; at 640 px and wider,
  nothing is cut ([narrow-output.txt](evidence/ticket-272/narrow-output.txt), [screenshot](evidence/ticket-272/narrow-500.png)).
  Before this change a long name wrapped onto further lines; the one-line row is the prototype's.
- No error path is added, so no escape surface to classify.

## Security

No finding. The change takes no input across IPC, reads no path, and draws the project's name as text.

## Consistency

No bug. Two refactor candidates and two findings outside the change, below.

- Invariants this change touches: the single back control now has the prototype's look (padding, hover
  background, the row's spacing) on every session page — the confirmed prototype draws it so, and the app had
  drifted from it since 2026-08-02; the existing session-page cases that use it ran green. Its text now sits in a
  span, so long names are cut rather than wrapped (above).
- The baseline smells, each against the change: Mysterious Name — none (`fromSearch`, `exits`,
  `backToSearch`, `goToProject`, `goToProjectStale`); Duplicated Code — hit, R-a; Feature Envy — none; Data Clumps
  — hit, R-b; Primitive Obsession — none (a boolean for one yes/no); Repeated Switches — none (one conditional
  draws the row); Shotgun Surgery — part of R-b; Divergent Change — none; Speculative Generality — none; Message
  Chains — none; Middle Man — none; Refused Bequest — not applicable.
- The copy follows each language's existing back control: the Chinese "back to <project> · sessions" becomes
  "go into <project> · sessions", the English "Back to" becomes "Go to", and likewise in French, Spanish,
  Russian and Japanese.

### Refactor list (for the owner's decision)

| # | Content | Reason | Impact | Recommendation |
|---|---|---|---|---|
| R-a | The session page's props look up the shown project twice in one render, once for its name and once for its stale flag | Duplicated Code | Self: none on behaviour; two reads of a short list | Recommended not doing; **the owner chose to do it now** — done in 5bd38dd (one lookup per render) |
| R-b | The open session's state travels as a clump — the session, the question to locate, the "back to Sessions" flag and now the origin — set together by hand in each of five handlers, so a new way of opening a session must remember to clear the origin, or that session would show the exits | Data Clumps / Shotgun Surgery (an existing clump this change extends by one) | Self: a wrong navigation control on one page, no data lost; today's paths are guarded (M11 red) | Recommended not doing now; **the owner chose to do it now** — done in 5bd38dd: the session, the question to locate and the origin are one value, and the back control and the way on into the project share one handler. Class check on 09966e1, before it: of the six call sites that replaced the open session, five set or cleared the origin and the sixth, the single back control, was drawn only while it was clear |

### Outside the change

| # | Finding | Impact | Recommendation and the owner's decision |
|---|---|---|---|
| O-1 | In windows the e2e launcher opens, the session list's scrollbar track stays light in dark mode — with dark emulated, and with dark set through `nativeTheme` as the app does; #271's dark screenshots show it too | Users in dark mode who show scroll bars always may see a light strip beside every scrolling list; whether a normal launch shows it is not checked | Open an issue: check under a normal launch with scroll bars always shown; if real, declare the colour scheme or style the scrollbars. **Decided: an issue — [#281](https://github.com/aloong-planet/agentshed/issues/281)** |
| O-2 | The icon module's header still says icons glued to the dictionaries' copy are "tracked separately"; ADR-0018 records them removed or moved, and a scan of the six dictionaries finds no symbol glyph left, only arrows inside sentences and menu paths | A reader looks for a tracking item that does not exist | Delete that line, in this PR as its own commit (the file is already in the diff). **Decided: deleted in this PR — 7d8ea36** |

## Follow-up: the independent test check's findings

Checked 2026-10-20 on the follow-up's working tree (on 41f8a0d, uncommitted at review time): the e2e file (E3's,
E4's, E8's and E9's new assertions, the J11 case E11 and its `exitsFit` helper), `capabilities.toml`'s ID, the
spec's US-003/AC-01 and the two feature entries' lines. No application code changed.

### Underlying premises

- The fork child's located question is its first: the corpus numbers the questions shown after the strip from 1
  (`question-corpus.ts`, `i: idx + 1` over the displayed questions), and E9's new guard asserts it in the run. The
  session page's `focused` starts from the `focusQ` it is given and marks the question with that number in the same
  render as the list (`SessionPane.tsx`); `located` is the pulse and goes when it ends. So the guard asserts
  `focused`, and a focus carried into the parent would mark the parent's question 1 — the comment's causal claim
  rests on both.
- The main window's minimum width is 800 px (`src/main/index.ts`); E11 polls `innerWidth` to 800 after the resize.
- The long name's shape: of the 61 projects in this machine's registry, the 6 with a name of 20 characters or more
  are hyphenated (5) or hyphenated with a dot (1); the longest is 47. The fixture's 74-character hyphenated name is
  that shape, longer. Counted by separator kind, no name printed.
- New comments: each states a measured or read fact; none states an unverified cause.

### Runnability

The global search e2e file ran on a fresh build: 11 passed, among them E11 (the screenshot shows both exits cut on
one line at 800 px, then the single back control). The window resize is Electron's own `setSize` on the main
window, as app.spec's minimum-width cases do. No state or error path in the application changes; the tests close
their app and remove their homes and userData as every case here does.

### Security

No application code; the tests write only to their own temporary directories, removed in `finally`. Nothing to
report.

### Consistency

- Duplicated Code: `exitsFit`'s line count repeats settings-updates.spec's `lines`. Exempt: the e2e files keep their
  helpers per file (this file's `launch` says it is app.spec's launcher), and there is no shared e2e module; a
  shared one would be a change of its own.
- The spec's US-003/AC-01 now names the card header, as the owner answered; US-003/AC-04's "the session opened
  directly from a hit" reads with it, and session-view's P10 points at US-003's definition. Both feature entries
  say "the results — a hit, or a card's header" or "the global search results" accordingly.
- `capabilities.toml`: `[mutation-testing] enabled = false`, the registry's ID; the two scripts that read the file
  (`check-message-lang.mjs`, `release-workflow.test.mjs`) read other IDs.
- No bug; no refactor item.
