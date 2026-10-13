# macOS release line — Coverage and acceptance checklist

Specs: [app-update](../../specs/app-update.md), [mac-distribution](../../specs/mac-distribution.md),
[landing-page](../../specs/landing-page.md); affected legacy units in
[appearance](../../specs/appearance.md) and [i18n](../../specs/i18n.md).
Source commit: specs written on b4cc66e (the prototype answers of 2026-10-13); the specs, the CONTEXT
wording fix and this checklist are committed together in the commit after it.
Scope: first construction of all three features — every coverage unit of the three specs; plus the
appearance and i18n units this round makes untrue (see "Legacy regression obligations").

This is a work index, not a requirement authority. No ticket is allocated and no verification is
claimed. Source anchors are the owner's answers in the requirements session of 2026-10-12/13 (session
transcript, timestamps UTC); supporting text is given in English, since this file follows the
repository's working language. The answers' original wording is in the transcript.

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| 10-12 08:16 — open a public macOS release line ("enable, open the release line") | Confirmed and in force | mac-distribution (whole); mac-distribution::CON-007 | Enables `macos-distribution`; the capability flip ships with the release work, not now |
| 10-12 08:34 — release packages built in CI, triggered by pushing a tag | Confirmed and in force | mac-distribution::US-002, mac-distribution::REQ-002 | Four tiers from the policy, keyed to the trigger |
| 10-12 08:34 — arm64 only | Confirmed and in force | mac-distribution::REQ-001/AC-01; Out of Scope (x64/universal) | One DMG per release |
| 10-12 08:34 — download from GitHub plus a mirror | Confirmed and in force | mac-distribution::US-002/AC-01, mac-distribution::REQ-004 | Mirror for formal releases only (later answer 13:35) |
| 10-12 08:57 — first release a pre-release, v0.1.0-beta | Confirmed and in force | mac-distribution::REQ-006 | Version changed before tagging (release process) |
| 10-12 08:57 — README in six languages gets download and install instructions, shipped with the first release | Confirmed and in force | mac-distribution::US-003/AC-01 | Content details moved to Implementation Decisions (derived, not a new requirement) |
| 10-12 08:57 — automatic updates are in scope | Confirmed and in force | app-update (whole) | — |
| 10-12 09:23 — declare client-framework "electron" | Background | — | Done separately (merged change of 2026-10-12) |
| 10-12 09:23 — mirror on Cloudflare R2 | Confirmed and in force | mac-distribution::REQ-004 | — |
| 10-12 09:23 — build a landing page | Confirmed and in force | landing-page (whole) | — |
| 10-12 09:27 — found update: only announce, download when the user clicks | Superseded by a later decision | — | Replaced by 14:43 "exactly as Codex" (background download); ADR-0032 amendment |
| 10-12 09:27 — automatic checks on by default, can be turned off in settings | Confirmed and in force | app-update::US-002/AC-01, app-update::US-002/AC-02, app-update::REQ-003/AC-01 | Per-field fallback to on is the existing preference rule |
| 10-12 09:27 — the channel follows the installed version | Confirmed and in force | app-update::US-004 | Matches CONTEXT "Release channel" |
| 10-12 09:54 — test whether dl.agentshed.aloongplanet.com gets a valid certificate | Confirmed and in force | mac-distribution::REQ-004 (Pending note) | Owner action outstanding; ADR-0031 stays Proposed |
| 10-12 09:54 — a separate bucket, agentshed-releases | Confirmed and in force | mac-distribution::REQ-004/AC-01 | Separate token too (ADR-0031 option 5) |
| 10-12 09:54 — as Transfer: site/ in the repo, Astro, Pages | Confirmed and in force | landing-page::CON-001; landing-page::US-002/AC-01 (routing as Transfer) | Routing `/` zh, `/en` en is Transfer's configuration, read on 2026-10-13 |
| 10-12 09:54 — no mainland-China copy of the landing page | Explicitly out of scope | landing-page Out of Scope; mac-distribution Out of Scope | — |
| 10-12 09:59 — updates come from GitHub Releases | Confirmed and in force | app-update::CON-002 | — |
| 10-12 09:59 — check at launch and every 24 hours | Confirmed and in force | app-update::REQ-006, app-update::US-001/AC-01, app-update::US-001/AC-02 | Turning the switch on adds no check: literal reading of ADR-0032's decision (US-002/AC-04) |
| 10-12 09:59 — landing page in Chinese and English | Confirmed and in force | landing-page::CON-002, landing-page::US-002 | — |
| 10-12 09:59 — download statistics: open a ticket, do later | Explicitly out of scope | Out of Scope in landing-page and mac-distribution | Deferred (ADR-0031 option 10) |
| 10-12 13:34 — pre-releases synced too, under a separate beta pointer | Superseded by a later decision | — | Replaced at 13:35 by "follow the current rule" |
| 10-12 13:34 — landing page at agentshed.aloongplanet.com | Confirmed and in force | landing-page::CON-001 | — |
| 10-12 13:35 — follow the current rule (mirror and pointer on formal releases only) | Confirmed and in force | mac-distribution::CON-004 | — |
| 10-12 13:42 — prompt "restart to install"; install on quit when not clicked | Superseded by a later decision (in part) | app-update::US-001/AC-04, app-update::US-001/AC-05 | The prompt became the ready button (14:43); install on quit stays |
| 10-12 13:42 — manual check in both the application menu and settings | Confirmed and in force | app-update::US-003, app-update::REQ-003, app-update::REQ-005 | — |
| 10-12 13:42 — automatic checks silent on failure, manual checks show the result | Confirmed and in force | app-update::REQ-002/AC-01, app-update::US-003 | — |
| 10-12 13:42 — no statement about the network request | Confirmed and in force | app-update::CON-001 | The landing page's "only reads files" line is a separate, confirmed item (10-13 06:53) |
| 10-12 13:45 — launch the page; until a formal release exists, download points at the GitHub pre-release and says it is a test version | Confirmed and in force | landing-page::REQ-001/AC-02, landing-page::REQ-002/AC-03, landing-page Failure A1 | — |
| 10-12 14:14 — write both ADRs; update CONTEXT; go on to step 2 | Background | — | Done (ADR-0031, ADR-0032, CONTEXT) |
| 10-12 14:21 — after a dismissed notice, notify again at the next launch or check | Superseded by a later decision | — | Replaced by 14:43 "the button stays and cannot be closed" |
| 10-12 14:21 — a failed user-started download shows the failure with Retry | Superseded by a later decision | — | Replaced by 14:46 "see how Codex handles it" → silent (ADR-0032 amendment) |
| 10-12 14:21 — the switch governs automatic checks only; what has started continues | Confirmed and in force | app-update::US-002/AC-03; CONTEXT invariant reworded 2026-10-13 | The invariant's old wording forbade the continued download; corrected, see audit |
| 10-12 14:21 — development run: no checks; menu item and settings controls unavailable with a reason | Confirmed and in force | app-update::US-005, app-update::REQ-005 | — |
| 10-12 14:22 — electron-builder's default DMG look | Confirmed and in force | mac-distribution::US-001/AC-04 | — |
| 10-12 14:23 — like Codex's update button: a button when there is an update, a hover message, using the app unaffected if not clicked | Confirmed and in force | app-update::REQ-001, app-update::US-001/AC-06 | — |
| 10-12 14:32 — follow Codex's source: bottom left, shown only when there is an update | Confirmed and in force | app-update::REQ-001/AC-01 | Shown while downloading, installing or ready (amendment) |
| 10-12 14:32 — landing page structure L1, the long page as Transfer's | Confirmed and in force | landing-page::REQ-003 | — |
| 10-12 14:43 — follow Codex exactly | Confirmed and in force | app-update Implementation Decisions (lifecycle); app-update::US-001/AC-01 | Background download; no failure state |
| 10-12 14:43 — the button cannot be closed and stays until installed | Confirmed and in force | app-update::REQ-001/AC-03 | — |
| 10-12 14:43 — menu-triggered results in a toast, settings-triggered results in place | Confirmed and in force | app-update::US-003/AC-01, app-update::US-003/AC-02 | — |
| 10-12 14:46 — a failed background download: "see how Codex handles it" | Confirmed and in force | app-update::REQ-002/AC-02 | Codex's lifecycle has no failure state → silent, button goes |
| 10-13 03:01 — screenshots from the owner's own data | Confirmed and in force | landing-page::REQ-005/AC-01 | — |
| 10-13 05:35 — features as a scroll effect: text on the left scrolls, the selected text shows its page | Confirmed and in force | landing-page::REQ-004 | Step height and neighbour visibility came from prototype iteration, confirmed with the structure at 06:53 |
| 10-13 06:16 — screenshots may be public | Confirmed and in force | landing-page::REQ-005/AC-01 | — |
| 10-13 06:53 — update prototype (a)–(f) confirmed as is | Confirmed and in force | app-update::REQ-001/AC-02, app-update::REQ-001/AC-04, app-update::REQ-003/AC-01, app-update::REQ-003/AC-02, app-update::REQ-005 | Accent fill, instant tooltip, segmented switch, footnote, loader-circle, menu placement and dev-run disabling |
| 10-13 06:53 — landing (a)–(d) confirmed as is | Confirmed and in force | landing-page::REQ-003, landing-page::REQ-006, landing-page::US-004/AC-01 | Structure, non-exhaustive agent wording, the "only reads files" subtitle, install step 3 |
| 10-13 06:53 — the page reads the R2 latest pointer at run time | Confirmed and in force | landing-page::REQ-001/AC-01, landing-page::REQ-001/AC-05; mac-distribution::REQ-004/AC-03 | Cross-origin readability is a consequence on the mirror |
| 10-13 06:53 — crop the feature screenshots to their subject at one zoom | Confirmed and in force | landing-page::REQ-005/AC-02 | — |
| 10-13 (spec synthesis) — without a pointer, read GitHub's public API for the newest pre-release; when neither reads, the release list without a version, also before the script runs | Confirmed and in force | landing-page::REQ-001/AC-02, landing-page::REQ-001/AC-03, landing-page::REQ-001/AC-04, landing-page::REQ-002/AC-04 | Prototype revised; confirmation of the revision pending |
| 10-13 (spec synthesis) — a failed install after the click: error toast, the button goes | Confirmed and in force | app-update::REQ-002/AC-03 | Prototype revised; confirmation of the revision pending |
| 10-13 (spec synthesis) — test seams: injected update source, e2e scripted source, the landing pure function plus a build check, the asset's own seam | Confirmed and in force | Testing Decisions of all three specs | — |
| 10-13 (spec synthesis) — the settings result line follows the update state | Confirmed and in force | app-update::REQ-004 | Prototype revised; confirmation of the revision pending |
| 10-13 (spec synthesis) — when R2 is unreadable, take GitHub's latest formal release first | Confirmed and in force | landing-page::REQ-001/AC-02, landing-page::REQ-002/AC-02 | Also covers the minutes between a formal release and its pointer (Failure A3) |
| ADR-0031 Decision (accepted by the owner's "write both ADRs") — four CI tiers, publication order, the formal-only mirror | Confirmed and in force | mac-distribution::REQ-002, mac-distribution::REQ-003, mac-distribution::CON-004 | The policy (`macos-signing.md` §5, §8) is the constraint |
| ADR-0032 Context — the macOS updater needs a ZIP; the packaging asset gates only DMGs | Confirmed and in force | mac-distribution::REQ-001/AC-02, mac-distribution::CON-002 | Requires a skillshed asset change before update packages ship (Pending in the spec) |
| ADR-0031 Neutral — electron-builder 26.17.0 | Confirmed and in force | mac-distribution::CON-005 | — |
| CONTEXT invariant on outbound requests | Confirmed and in force | app-update::CON-001, app-update::US-002/AC-01 | Reworded 2026-10-13 to match the 14:21 answer |

## Spec → tickets → verification

Not allocated. Tickets are cut by `/to-tickets` after the revised prototypes are confirmed; this
section is filled there, not here.

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-13; specs as committed after b4cc66e; no implementation | Every unit of the three specs; no ticket | Not run yet | Unverified |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source row above maps to a coverage unit, or is recorded as superseded, background or out of scope | Table above | Complete for the answers of 10-12 08:16 to 10-13 spec synthesis. The 10-12 07:41 and 08:09 answers concern other work (#223 follow-ups, `.env.local`) and are not sources here |
| Reverse: every normative unit traced to a source or derived from one | All three specs | Derived units, each resolving an undefined case without changing a confirmed behaviour: app-update::US-002/AC-04 (literal reading of ADR-0032's schedule); app-update::US-003/AC-05 (a manual check joins one in flight — no duplicate request); app-update::REQ-006/AC-02 (sleep makes at most one check); app-update Failures A6, B3, C1, C3, E5, H1; mac-distribution::REQ-001/AC-04 (minimum macOS 12, agreeing with the confirmed landing copy and Electron 43's floor); mac-distribution Failures A1, C1–C3; landing-page Failures A3, A7, A8. Reported to the owner with the specs |
| Removed during the audit: a derived landing boundary with no source (section links scrolling clear of the sticky header) | landing-page Failure B2 | Removed; not decided by the prototype |
| Conflict: CONTEXT's invariant said no outbound request at all while automatic checks are off, which forbids finishing a download already under way (10-12 14:21 answer) | CONTEXT invariant; app-update::US-002/AC-01, app-update::US-002/AC-03 | CONTEXT reworded to match the confirmed decision (no re-confirmation needed: it applies a decision already made) |
| Conflict check: ADR-0032's original decision vs its amendment | ADR-0032 | The specs follow the amendment; its own text records which consequences no longer hold |
| Conflict check: ADR-0031 "download points at the latest formal release on R2; otherwise the GitHub pre-release" vs the run-time fallbacks | ADR-0031; landing-page::REQ-001 | Consistent: the fallbacks refine what the ADR leaves unsaid; not ADR-worthy (easy to reverse) |
| Conflict check: the landing page reads GitHub at run time vs the app's outbound-request invariant | landing-page::CON-003; CONTEXT | No conflict: the invariant governs the app, and the page is a website |
| Unresolved dependency: the ZIP gate needs the electron-scaffold asset changed in skillshed | mac-distribution::CON-002 | Pending note in the spec; the work is outside this repository and precedes the release tickets |
| Unresolved dependency: the download host certificate | mac-distribution::REQ-004 | Owner action (Cloudflare); Pending note; ADR-0031 Proposed |
| Prototype gate, interface points of app-update | app-update::REQ-001 to REQ-004, REQ-002/AC-03, US-003 toasts | Visible in the settings prototype: rail button in three states, tooltip, Updates section, dev-run state, result line, toasts, install failure. The native menu item is stated in the spec as an explicit exception (as for the rest of the menu in i18n). Revised parts (install-failure toast, lifecycle-first line) await the owner's confirmation |
| Prototype gate, interface points of landing-page | landing-page::REQ-002 to REQ-006, QR-001 | Visible in the landing prototype: header, hero in four states, features section, screenshots, install steps, download section, footer, dark and light, narrow layout. The two new states (list; formal from GitHub) await the owner's confirmation |
| Prototype gate, mac-distribution | mac-distribution::US-001/AC-04, US-003 | No app interface: the DMG window is electron-builder's default by the owner's choice, and the README is copy. Exception stated in the spec |
| Failure modes checked by user operation sequence, including state entry and exit | app-update Sequences A–G; landing-page A–D; mac-distribution A–E | Every lifecycle state has its entry and exit paths in the app-update table, and every failure returns to idle with REQ-002 deciding the visible result |

### Legacy regression obligations

| Unit (legacy identifier) | Change this round | Mapping |
|---|---|---|
| appearance D4 (settings at the rail's bottom) | "sits alone" became untrue; reworded to the bottom anchor plus a pointer | Its own obligation (the bottom anchor) is unchanged; what may sit above it has its primary definition in app-update::REQ-001/AC-01. To be mapped to the identifier convention before ticket publication, not renumbered here |
| i18n "The application menu" implementation decision | "plus one entry point" became untrue; now names settings and "Check for Updates…" | The menu item's primary definition is app-update::REQ-005. Same mapping rule as above |
