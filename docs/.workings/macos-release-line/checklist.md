# macOS release line — Coverage and acceptance checklist

Specs: [app-update](../../specs/app-update.md), [mac-distribution](../../specs/mac-distribution.md),
[landing-page](../../specs/landing-page.md); affected legacy units in
[appearance](../../specs/appearance.md) and [i18n](../../specs/i18n.md).
Source commit: specs written on b4cc66e (the prototype answers of 2026-10-13); the specs, the CONTEXT
wording fix and this checklist are committed together in the commit after it. Last revised on 290dc9b
with uncommitted changes (the owner's confirmation of the revised prototypes, and the ticket mapping
below), committed with this checklist in the commit after it.
Scope: first construction of all three features — every coverage unit of the three specs; plus the
appearance and i18n units this round makes untrue (see "Legacy regression obligations").

This is a work index, not a requirement authority. The tickets were published on 2026-10-14 as
#230–#241, with the prerequisite zhoulf1006/skillshed#18 (drafted as #230–#241 and zhoulf1006/skillshed#18, in that order);
each has its document sync checklist next to this file. No verification is claimed. Source anchors are the owner's answers in the requirements session of 2026-10-12/13 (session
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
| 10-12 09:54 — test whether dl.agentshed.aloongplanet.com gets a valid certificate | Confirmed and in force | mac-distribution::REQ-004 | Checked from outside Cloudflare on 2026-10-17 (infra); the spec's note is plain text and ADR-0031 Accepted since #236 (2026-10-19) |
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
| 10-13 (spec synthesis) — without a pointer, read GitHub's public API for the newest pre-release; when neither reads, the release list without a version, also before the script runs | Confirmed and in force | landing-page::REQ-001/AC-02, landing-page::REQ-001/AC-03, landing-page::REQ-001/AC-04, landing-page::REQ-002/AC-04 | Prototype revised; the owner confirmed the revision on 2026-10-13 |
| 10-13 (spec synthesis) — a failed install after the click: error toast, the button goes | Confirmed and in force | app-update::REQ-002/AC-03 | Prototype revised; the owner confirmed the revision on 2026-10-13 |
| 10-13 (spec synthesis) — test seams: injected update source, e2e scripted source, the landing pure function plus a build check, the asset's own seam | Confirmed and in force | Testing Decisions of all three specs | — |
| 10-13 (spec synthesis) — the settings result line follows the update state | Confirmed and in force | app-update::REQ-004 | Prototype revised; the owner confirmed the revision on 2026-10-13 |
| 10-13 (spec synthesis) — when R2 is unreadable, take GitHub's latest formal release first | Confirmed and in force | landing-page::REQ-001/AC-02, landing-page::REQ-002/AC-02 | Also covers the minutes between a formal release and its pointer (Failure A3) |
| 10-13 (owner's report on the prototype: with an update ready, choosing "up to date" and clicking "Check now" changed nothing) — grey out "Check now" while an update is downloading, ready or installing | Superseded by a later decision (in part) | app-update::US-003/AC-02, app-update::US-003/AC-04 (narrowed to the menu); app-update Failure D5 | The click was by design a no-op (no request while an update is in flight) but looked dead. Greyed while downloading stays; for ready and installing the next row replaced it with "Install now" |
| 10-13 (owner's report on the prototype: in the "ready" state the row should have an "Install now" button, not the check button) — "Install now" in place of "Check now" while an update is ready | Confirmed and in force | app-update::REQ-003/AC-04 (new); adjusted to it: app-update::US-003/AC-02, app-update::US-003/AC-04, app-update::REQ-003/AC-01, app-update::REQ-002/AC-03, app-update::CON-004, the lifecycle table; app-update Failures C1, C6, C10, C11 | Same action as the ready button. Greyed while installing, one install whichever button is clicked, and the in-place change when the download finishes are derived (see audit). Prototype revised; the owner confirmed it on 2026-10-13 |
| 10-13 (owner's question on the prototype) — after a successful update the settings line says "up to date", in the ok form; describe the state, not the action ("updated") | Confirmed and in force | app-update::REQ-004/AC-04 (AC-02 and AC-03 adjusted to it); app-update Failures C7–C9 | Reuses the settings check's "up to date" text. Prototype revised (it also showed the old version number after a played update, now fixed); the owner confirmed the revision on 2026-10-13 |
| ADR-0031 Decision (accepted by the owner's "write both ADRs") — four CI tiers, publication order, the formal-only mirror | Confirmed and in force | mac-distribution::REQ-002, mac-distribution::REQ-003, mac-distribution::CON-004 | The policy (`macos-signing.md` §5, §8) is the constraint |
| ADR-0032 Context — the macOS updater needs a ZIP; the packaging asset gates only DMGs | Confirmed and in force | mac-distribution::REQ-001/AC-02, mac-distribution::CON-002 | Requires a skillshed asset change before update packages ship (Pending in the spec) |
| ADR-0031 Neutral — electron-builder 26.17.0 | Confirmed and in force | mac-distribution::CON-005 | — |
| CONTEXT invariant on outbound requests | Confirmed and in force | app-update::CON-001, app-update::US-002/AC-01 | Reworded 2026-10-13 to match the 14:21 answer |

## Spec → tickets → verification

Tickets (blocking edges are direct; "owner" marks an owner action outside the code):

| Ticket | Title | Blocked by |
|---|---|---|
| #230 | Automatic app updates with the update button | None |
| #231 | The settings "Updates" section | #230 |
| #232 | "Check for Updates…" in the application menu | #231 (Failure D4 needs both surfaces) |
| #233 | Package through the electron-scaffold asset | None |
| #234 | Release by pushing a tag | #233; owner: the signing and notarization secrets |
| #235 | Every release carries the update ZIP and its metadata | #234; zhoulf1006/skillshed#18 |
| #236 | Mirror formal releases to R2 behind the download host | #234; owner: the host's certificate check, the bucket, its token and the R2 secrets |
| #237 | The landing page in Chinese and English | None |
| #238 | The landing page offers the release that exists | #237 |
| #239 | Launch v0.1.0-beta: the first pre-release, the live landing page and the README | #232, #235, #238; owner: the Pages project and its domain |
| #240 | Update an installed pre-release to the next one | #239 |
| #241 | Closeout: full-feature acceptance and documentation regression | #230–#240 |
| zhoulf1006/skillshed#18 | electron-scaffold: produce and gate a ZIP alongside the DMG | None |

"Test" names the seam of the spec's Testing Decisions: the controller with a fake update source (unit),
the environment-injected scripted source (e2e), the preference store, the IPC contract, the menu
template, the landing state function (unit), the built-site check, the static workflow test and the
asset's own tests.

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| app-update::US-001/AC-01 | At launch one automatic check; a found update downloads in the background at once, no prompt; the button appears with progress | #230: implementation and user-path acceptance | Test: controller unit (launch → check → found → downloading); e2e (launch → the rail shows the button with its ring at 0, no dialog) |
| app-update::US-001/AC-02 | Another automatic check every 24 hours | #230 | Test: controller unit with injected time |
| app-update::US-001/AC-03 | Download done → the ready button; hover or focus shows "Update available" | #230 | Test: e2e (scripted download completes → download icon; hover and focus → tooltip text) |
| app-update::US-001/AC-04 | Clicking the ready button installs and restarts into the new version | #230: the click and the install; #240: the real restart | Test: e2e (click → installing; the scripted source records one install); Evidence (#240): an installed pre-release restarts into the next one |
| app-update::US-001/AC-05 | An update left ready installs on the next quit; the next launch runs it | #230: configuration; #240: real path | Test: controller unit (install on quit on, no relaunch); Evidence (#240): quit with an update ready, relaunch on the new version |
| app-update::US-001/AC-06 | Nothing blocks the app; no dialog, modal or page change; no space while no update is in flight | #230 | Test: e2e (no update → the slot takes no space and the rail's entries keep their places; found → no dialog, page unchanged) |
| app-update::US-002/AC-01 | Switch off → no automatic check at launch or on the timer; no outbound request except a manual check and a download under way | #230: gating; #231: through the switch | Test: controller unit; e2e #231 (switch off, restart → the scripted source records no request) |
| app-update::US-002/AC-02 | On in a fresh installation; survives a restart; an invalid stored value falls back to on alone | #230: the stored preference; #231: through the switch | Test: preference store unit (default, persistence, per-field fallback); e2e #231 (toggle, restart → kept) |
| app-update::US-002/AC-03 | The switch governs automatic checks only; off cancels no download and discards no ready update | #230: controller; #231: through the switch | Test: controller unit; e2e #231 (off during a download → it completes, the ready button appears) |
| app-update::US-002/AC-04 | Turning the switch on starts no check | #230; #231 | Test: controller unit; e2e #231 (on → no request recorded) |
| app-update::US-003/AC-01 | The menu item reports in a toast: up to date (with version), failed, or found and downloading | #232 | Test: e2e (the menu item's click triggered in the main process → the toast for each scripted outcome) |
| app-update::US-003/AC-02 | "Check now" reports in the line; unavailable during its own check and while downloading; "Install now" while ready or installing; "Check now" back after install or failure | #231 | Test: e2e (each scripted state → line text, button label and availability) |
| app-update::US-003/AC-03 | A manual check that finds an update starts the background download | #230: controller; #231: settings; #232: menu | Test: controller unit; e2e #231 and #232 (from each surface → the rail button appears) |
| app-update::US-003/AC-04 | A menu check while downloading, ready or installing makes no request and toasts the state | #232 | Test: e2e (each in-flight state → its toast; no request recorded) |
| app-update::US-003/AC-05 | A manual check during another joins it and reports its outcome | #230: controller; #231: settings; #232: menu | Test: controller unit (two checks → one request, both resolve); e2e #231 (settings during the launch check) and #232 (menu during a settings check — Failure D4) |
| app-update::US-004/AC-01 | A formal-release installation is offered formal releases only | #230: updater configuration; #240: real releases | Test: unit (configuration from the running version: no pre-releases for a formal version) |
| app-update::US-004/AC-02 | A pre-release installation is offered newer pre-releases and formal releases | #230; #240 | Test: unit (pre-releases allowed for a pre-release version); Evidence (#240): Failure E1 on real releases |
| app-update::US-004/AC-03 | After updating to a formal release, formal releases only | #230 | Test: unit (the configuration follows the running version, so the formal case applies) |
| app-update::US-004/AC-04 | Never a version older than the running one | #230 | Test: unit (downgrade off) |
| app-update::US-005/AC-01 | An unpackaged run makes no check, automatic or manual | #230 | Test: controller unit (unpackaged → no trigger requests) |
| app-update::US-005/AC-02 | Unpackaged: switch and "Check now" unavailable, development footnote | #231 | Test: e2e (the seam's packaged stand-in off → controls unavailable, the footnote) |
| app-update::US-005/AC-02 | Unpackaged: the menu item is disabled | #232 | Test: menu template unit |
| app-update::REQ-001/AC-01 | In the bottom group directly above Settings, only while downloading, installing or ready; otherwise no space | #230 | Test: e2e geometry per state, Settings at its bottom anchor (appearance Failure D4) |
| app-update::REQ-001/AC-02 | 36px slot, 24px accent circle, card-colour glyph: ring, spinner (also under reduced motion), download icon | #230 | Test: e2e (computed sizes and colours per state; reduced motion → the loader stands still) |
| app-update::REQ-001/AC-03 | Only the ready button can be clicked; no close; stays until installed | #230 | Test: e2e (clicks while downloading or installing do nothing; no close control) |
| app-update::REQ-001/AC-04 | Instant tooltip to the right in the chart tooltip's form; three texts; accessible name; progress bar; follows progress; anchored | #230 | Test: e2e (hover and focus → text and position; accessible name; progressbar value; text follows progress while open) |
| app-update::REQ-001/AC-05 | Distinguishable in three themes, light and dark | #230 | Test: e2e computed colours in the six theme states; Evidence: screenshots |
| app-update::REQ-002/AC-01 | A failed automatic check shows nothing; the next scheduled check retries | #230 | Test: controller unit; e2e (scripted failure → no toast, no button) |
| app-update::REQ-002/AC-02 | A failed background download shows nothing; the button goes; the next check downloads again | #230 | Test: controller unit; e2e (scripted download failure) |
| app-update::REQ-002/AC-03 | A failed install after a click shows "Couldn't install the update"; the button goes | #230: ready button; #231: "Install now" | Test: e2e (scripted install failure from each button) |
| app-update::REQ-003/AC-01 | "Updates" third, one card with two rows: the switch; Current version, line and one button | #231 | Test: e2e (section order, rows, controls) |
| app-update::REQ-003/AC-02 | The footnote; replaced in a development run | #231 | Test: e2e (footnote per run kind) |
| app-update::REQ-003/AC-03 | A switch change takes effect at once, no save | #231 | Test: e2e (toggle → the stored preference changes) |
| app-update::REQ-003/AC-04 | Ready → "Install now", same form and place, same action as the ready button; one install; unavailable while installing; relabelled in place when the download finishes | #231 | Test: e2e (ready → "Install now"; click → installing and one install recorded; download finishing with settings open → the same element relabelled) |
| app-update::REQ-004/AC-01 | The line shows downloading, ready or installing, whichever check found it | #231 | Test: e2e |
| app-update::REQ-004/AC-02 | No update in flight → last settings outcome, else the post-update line, else nothing; any found update clears the earlier outcome | #231 | Test: e2e (settings "up to date", automatic find, failed download → empty — Failure D5) |
| app-update::REQ-004/AC-03 | Kept when leaving settings; follows the language; not kept across a restart | #231 | Test: e2e |
| app-update::REQ-004/AC-04 | First run after the version went up: new version shown, "You're up to date" in the ok form, until a settings check; AC-01 wins | #231 | Test: e2e (seeded older, equal, newer and missing recorded versions — Failures C7–C9) |
| app-update::REQ-005 | Below "About Agentshed"; copy follows the in-app language and is rebuilt on a switch; disabled in a development run | #232 | Test: menu template unit (position, six languages, disabled flag); Evidence: screenshot of the native menu (the known gap) |
| app-update::REQ-006/AC-01 | One check at launch, then every 24 hours; each honours the switch at that moment | #230 | Test: controller unit with injected time |
| app-update::REQ-006/AC-02 | Sleep through ticks → at most one check on waking | #230 | Test: controller unit (time jumps several periods → one check) |
| app-update::REQ-006/AC-03 | An automatic check during an update in flight makes no request | #230 | Test: controller unit |
| app-update::QR-001/AC-01 | Every string in six languages, passing the dictionary gates | #230, #231, #232: each its own strings | Gate: `pnpm typecheck` (dictionary type) and `pnpm check:i18n` |
| app-update::QR-001/AC-02 | Six languages at the settings width: labels and line on one line, every line state | #231 | Test: e2e measurement in six languages × line states |
| app-update::CON-001 | The check and its download are the only outbound requests, to GitHub Releases; the CSP allows no remote origin; no statement | #230 | Test: the existing CSP test; Evidence: a search for outbound request APIs in the app's code, command and output kept |
| app-update::CON-002 | Update information and packages from GitHub Releases, never R2 | #230 | Test: unit on the production source's configuration |
| app-update::CON-003 | IPC carries states, versions, progress and codes only | #230, #231, #232: each its own IPC | Test: contract validation tests |
| app-update::CON-004 | Restart only after a click on the ready button or "Install now"; install on quit only on the user's quit, never relaunching | #230: ready button and quit; #231: "Install now" | Test: controller unit; e2e (no install without a click) |
| app-update Failure A6 | A malformed answer is a failed check; only a validated version is shown | #230: validation; #231, #232: the manual report | Test: controller unit; e2e #231 and #232 ("Couldn't check for updates") |
| app-update Failure B2 | After a menu "found" toast, a failed download adds no toast; the line stops showing it | #232: toast; #231: line | Test: e2e |
| app-update Failure B3 | A read-only or translocated app surfaces as a failed download | #230 | Test: controller unit (the source reports failure); Evidence (#240) when a real run reaches it |
| app-update Failure B4 | Quit during a download installs nothing; the next check downloads again | #230 | Test: controller unit |
| app-update Failure C1 | Install-and-restart goes through the normal quit, so the display-cache flush runs first | #230: the path; #240: the real restart | Evidence: the install calls electron-updater's quitAndInstall, which on macOS hands over to Electron's autoUpdater.quitAndInstall — it closes the windows and quits normally, so `before-quit` runs the flush (electron-updater 6.8.9 `MacUpdater.handleUpdateDownloaded`; no test can reach it: the scripted install never quits). Evidence (#240): the restart keeps the saved pages |
| app-update Failure C3 | Force-quit with an update ready installs nothing; the next launch finds it again | #230 | Test: controller unit |
| app-update Failure C10 | Repeat clicks on either button install once | #230: rail; #231: "Install now" | Test: e2e (second click → one install recorded) |
| app-update Failure C11 | The download finishing relabels in place; a failed install from "Install now" leaves "Check now" and an empty line | #231 | Test: e2e |
| app-update Failure D4 | Menu and settings checks in quick succession join; each reports in its own form | #232 | Test: e2e |
| app-update Failures D5, D6 | The line after a failed download; the line after returning to settings | #231 | Test: e2e |
| app-update Failure E5 | A locally packaged build is an installation of its version | #230 | Test: unit (the configuration does not special-case local builds) |
| app-update Failure F2 | The scripted source only under test; production never sets it | #230 | Test: unit (the seam is read only from its environment variable); Evidence: search for its consumers |
| app-update Failure G2 | A language switch: menu, open tooltip, section and line follow; a shown toast keeps its language | #230: tooltip; #231: section and line; #232: menu | Test: e2e (switch with the tooltip open); menu template unit |
| app-update Failure G4 | The first launch after an update restores the startup display data | #231 | Test: e2e (seeded newer recorded version with a saved display cache → restored) |
| app-update Failure G5 | A second instance while an update is ready exits; the running one keeps it | #230 | Test: e2e if the single-instance setup allows; otherwise Evidence |
| app-update Failure G6 | Update toasts use the existing toast and stack | #230: install failure; #232: menu | Test: e2e |
| app-update Failure H1 | Only a validated version string reaches the renderer; no notes, links or HTML | #230 | Test: contract validation tests |
| app-update Failure H2 | A package the system rejects is an install failure | #230: as REQ-002/AC-03; #240: real path | Test: covered by REQ-002/AC-03; Evidence (#240) |
| app-update Failures A1–A5, B1, B5, C2, C4–C9, D1–D3, E1–E4, F1, G1, G3 | Each restates the units it cites | The owners of the cited units | Verified with the cited units |
| mac-distribution::US-001/AC-01 | Download, open, drag, open; the first launch shows Apple's "checked … none" notice | #239 | Evidence: browser download of the published DMG, screenshot of the notice (Failure D1) |
| mac-distribution::US-001/AC-02 | The first launch succeeds offline | #234: gate; #239: evidence | Gate: the gate job validates the `.app`'s stapled ticket; Evidence (#239): first launch with the network off |
| mac-distribution::US-001/AC-03 | Opening the DMG passes Gatekeeper; the DMG is stapled | #234: gate; #239: evidence | Gate: spctl and stapler checks on the DMG; Evidence (#239): independent check of the downloaded DMG (`macos-signing.md` §7) |
| mac-distribution::US-001/AC-04 | The DMG window has electron-builder's default look | #233 | Evidence: screenshot of the mounted DMG |
| mac-distribution::US-002/AC-01 | A formal tag: gated GitHub release marked Latest, R2 copy, pointer last | #234: through the GitHub release; #236: mirror and pointer | Test: static workflow test; Evidence: Waiting (trigger: the first formal release) |
| mac-distribution::US-002/AC-02 | A pre-release tag: the same gates, Pre-release, no R2, no pointer | #234: workflow; #239: first real run | Test: static workflow test; Evidence (#239): the v0.1.0-beta run and release |
| mac-distribution::US-002/AC-03 | A failed gate publishes nothing; the failing step and Apple's log are kept | #234 | Test: static workflow test (publishing needs the gate job); Gate: the asset's tests (failure propagation) |
| mac-distribution::US-002/AC-04 | Manual run with the switch: release packaging and every gate, temporary artifacts only | #234 | Test: static workflow test; Evidence: one manual verification run (the spec's Pending) |
| mac-distribution::US-002/AC-05 | Manual run without the switch: local packaging, temporary artifacts only | #234 | Evidence: one manual run without the switch |
| mac-distribution::US-003/AC-01 | Six READMEs gain download and install instructions with the first release | #239 | Gate: `pnpm check:lang`; Evidence: the README change in the release change |
| mac-distribution::REQ-001/AC-01 | One arm64 DMG, fixed name, Developer ID; notarized and stapled with its `.app` | #233: name and signing; #234: notarization in CI | Gate: the asset's artifact-set gate; Evidence: verification-run artifacts and an independent check |
| mac-distribution::REQ-001/AC-02 | A ZIP of the same stapled `.app` with the update metadata; exactly one `.app`, same checks | #235 | Gate: the asset's ZIP gate; Evidence: verification-run artifacts, independent check of the ZIP's `.app` |
| mac-distribution::REQ-001/AC-03 | Apple's logs kept unaltered with the run's artifacts | #234 | Evidence: the verification run's artifact list |
| mac-distribution::REQ-001/AC-04 | Minimum macOS 12, agreeing with the README and the landing page | #233: declaration; #237, #239: copy; #241: the cross-check | Evidence: the packaged app's minimum system version; #241 compares the three statements |
| mac-distribution::REQ-002/AC-01 | The tier follows the trigger | #234 | Test: static workflow test |
| mac-distribution::REQ-002/AC-02 | Publishing and mirroring only on real tag events | #234: publish; #236: mirror | Test: static workflow test |
| mac-distribution::REQ-002/AC-03 | Mirror and pointer jobs depend on the gate job, formal tags only | #236 | Test: static workflow test |
| mac-distribution::REQ-003 | Artifacts before the pointer; pointer after each mirrored file is reachable; the GitHub release only with the whole set | #234: GitHub release; #236: pointer | Test: static workflow test (ordering); Evidence: Waiting (trigger: the first formal release) |
| mac-distribution::REQ-004/AC-01 | Formal releases in `agentshed-releases`, one directory per version, under the download host | #236 | Test: static workflow test; Evidence: Waiting (trigger: the first formal release) |
| mac-distribution::REQ-004/AC-02 | The pointer names the formal version and its URLs | #236 | Test: unit or static test of the pointer's content; Evidence: Waiting (trigger: the first formal release) |
| mac-distribution::REQ-004/AC-03 | Cross-origin GET from the landing origin; no pointer before the first formal release | #236 | Evidence: requests with the landing origin (allowed) and another origin (refused), output in the R2 runbook |
| mac-distribution::REQ-004 (Pending: the host) | The host is decided by its certificate check | #236 (owner action first) | Evidence: the check's output; ADR-0031's status updated |
| mac-distribution::REQ-005 | Release note per template; titles; "notarized" claimed only after gates and independent verification | #239 | Evidence: the published note |
| mac-distribution::REQ-006 | First release `v0.1.0-beta`; version changed first, tag on that commit | #239 | Evidence: the tagged commit's package version |
| mac-distribution::CON-001 | One call through the asset; built-in notarization off; copies unmodified; asset tests in the gateway | #233; #235 (re-copied) | Gate: the asset's tests in `pnpm verify`; Evidence: byte comparison with skillshed's copy |
| mac-distribution::CON-002 | The ZIP's gate comes from the asset | zhoulf1006/skillshed#18: the asset; #235: adoption | Evidence: the adopted asset version gates the ZIP |
| mac-distribution::CON-003 | Fail closed: no certificate fails packaging; no Apple or R2 credential fails release and mirror | #233: local; #234: CI; #236: R2 | Gate: the asset's tests (missing identity); Test: static workflow test (secret booleans) |
| mac-distribution::CON-004 | Only formal releases reach R2 and the pointer | #236 | Test: static workflow test |
| mac-distribution::CON-005 | electron-builder 26.17.0 | #233 | Gate: the frozen lockfile; Evidence: the resolved version |
| mac-distribution::CON-006 | No credential is ever printed | #233, #234, #236 | Evidence: workflow review and run logs |
| mac-distribution::CON-007 | `macos-distribution` enabled; profiles name the two commands; source points to the runbook | #233 | Evidence: the capability file read with a TOML parser |
| mac-distribution Failures A1, A2, A4, A6, B1, B3, C4 | Version mismatch fails first; other suffixes are pre-releases; empty secret fails at once; build metadata or a non-semver version fails at the tag check; time limit; set check; manual never publishes | #234 | Test: static workflow test, the tag check's tests (A1, A6); Evidence: the verification run (B1 durations) |
| mac-distribution Failures C3, C5 | No mix of two builds' files; a pre-release after a formal release leaves Latest and R2 alone | #234: the GitHub release; #236: the mirror | Test: static workflow test |
| mac-distribution Failures A3, B2 | Leftovers cleared; Invalid fetches the log without masking the error | #233 | Gate: the asset's tests |
| mac-distribution Failure B4 | A ZIP `.app` without ticket or signature fails the release | #235 | Gate: the asset's ZIP gate |
| mac-distribution Failures C1, C2 | A partial or unreachable upload leaves the pointer | #236 | Test: static workflow test |
| mac-distribution Failures D1–D4 | The notice's wording; drag to Applications; Apple Silicon; macOS 12 | #239: README and launch; #237: landing copy | Evidence: copy and the launch screenshot |
| mac-distribution Failures E1, E2 | Local packaging through the asset, never notarized; fuses kept | #233 | Evidence: local run outputs (with credentials loaded; without the identity); the fuse check's output |
| mac-distribution Failure A5 | Tag placement is not checked | — | Background: the release process (#239 follows it) |
| landing-page::US-001/AC-01 | Hero: icon, title, description, button with the platform line, whole-window screenshot | #237 | Test: built-site check; Evidence: browser screenshot |
| landing-page::US-001/AC-02 | A formal release → the hero downloads its DMG | #238 | Test: state function unit; Evidence: browser with a served pointer |
| landing-page::US-001/AC-03 | Only pre-releases → newest pre-release, said to be a test version | #238 | Test: unit; Evidence: browser |
| landing-page::US-001/AC-04 | Unknown → the release list | #237: served; #238: unreadable | Test: built-site check; unit |
| landing-page::US-002/AC-01 | Chinese at `/`, English at `/en`, header toggle | #237 | Test: built-site check |
| landing-page::US-002/AC-02 | Same sections and states in both, each with its own screenshots | #237: sections and shots; #238: states | Test: built-site check; unit (state copy in both languages) |
| landing-page::US-003/AC-01 | Four feature steps, each with its screenshot | #237 | Test: built-site check; Evidence: browser |
| landing-page::US-004/AC-01 | Three install steps, the third about the notice and the update button | #237 | Test: built-site check |
| landing-page::REQ-001/AC-01 | Pointer read → formal from R2 | #238 | Test: unit |
| landing-page::REQ-001/AC-02 | No pointer → GitHub: latest formal, else newest pre-release | #238 | Test: unit |
| landing-page::REQ-001/AC-03 | Neither readable, or no release → list | #238 | Test: unit |
| landing-page::REQ-001/AC-04 | As served and without scripts → list | #237 | Test: built-site check |
| landing-page::REQ-001/AC-05 | No release needs a site change | #238; #239 | Test: unit (no version constant); Evidence (#239): the live page offers v0.1.0-beta unchanged |
| landing-page::REQ-002/AC-01 | Formal from R2: texts, link, two download buttons | #238 | Test: unit; Evidence: browser |
| landing-page::REQ-002/AC-02 | Formal from GitHub: GitHub links, one button | #238 | Test: unit; Evidence: browser |
| landing-page::REQ-002/AC-03 | Test: texts, pill, note, one button | #238 | Test: unit; Evidence: browser |
| landing-page::REQ-002/AC-04 | List: texts, no pill, no version | #237 | Test: built-site check |
| landing-page::REQ-002/AC-05 | GitHub links in a new tab; the R2 download in place | #237: list links; #238: the others | Test: built-site check; unit |
| landing-page::REQ-003 | Header, sections and footer | #237 | Test: built-site check; Evidence: browser |
| landing-page::REQ-004/AC-01 | Wide: text left, fixed frame right, nearest-to-middle step | #237 | Evidence: browser measurement record |
| landing-page::REQ-004/AC-02 | Current step accent bar, hover forms | #237 | Evidence: browser measurement (computed styles) |
| landing-page::REQ-004/AC-03 | Steps a third of a screen tall | #237 | Evidence: browser measurement |
| landing-page::REQ-004/AC-04 | Click or Enter scrolls the step to the middle; focus ring inside | #237 | Evidence: browser measurement |
| landing-page::REQ-004/AC-05 | Cross-fade; instant under reduced motion; only the shown shot is reachable | #237 | Evidence: browser measurement |
| landing-page::REQ-004/AC-06 | Below 760px: stacked shots with a gap | #237 | Evidence: browser measurement |
| landing-page::REQ-004/AC-07 | Switching language keeps the step and scroll | #237 | Evidence: browser measurement |
| landing-page::REQ-005/AC-01 | The approved shots, one set per language, light | #237 | Evidence: the shots are the approved set |
| landing-page::REQ-005/AC-02 | Hero whole window; feature cuts 16:9 at one zoom, between rows, no recent sessions in the token cut | #237 | Evidence: image dimensions and review |
| landing-page::REQ-005/AC-03 | Every shot's space held | #237 | Test: built-site check (declared sizes) |
| landing-page::REQ-006 | Two languages; non-exhaustive agent wording; the app's palette in light and dark | #237 | Test: built-site check; Evidence: browser in both appearances |
| landing-page::QR-001/AC-01 | 400, 900, 1280, 1440px: no sideways scroll, buttons in their cards, gutters, all four states | #237: list state; #238: the other three | Evidence: browser measurement record |
| landing-page::CON-001 | `site/` with Astro, deployed by Pages at the domain | #237: project; #239: deployment | Evidence: build output; the live URL |
| landing-page::CON-002 | Chinese and English only | #237 | Test: built-site check (two pages) |
| landing-page::CON-003 | Reads the pointer and GitHub's API only | #238 | Test: unit (the reader's URLs); Evidence: search for requests in `site/` |
| landing-page Failures A1–A8 | Each download-decision boundary | #238 (A1's live part in #239) | Test: unit per branch (malformed pointer, rate limit, drafts, a release without the DMG); Evidence: browser for A7 |
| landing-page Failures B1, B2, C1–C4, D1 | Languages, navigation, features section, appearance | #237 | Test: built-site check (link targets); Evidence: browser measurement |
| landing-page Failure E1 | Only validated versions and URLs on the expected hosts | #238 | Test: unit (unexpected hosts rejected) |
| landing-page Failure E2 | Real data in the shots by the owner's decision | — | Background |
| appearance Failure D4 (legacy) | Settings at the rail's bottom anchor; the update button above it while in flight | #230 | Test: e2e geometry (with app-update Failure G1) |
| i18n "The application menu" (legacy) | Settings and "Check for Updates…" as entry points | #232 | Test: menu template unit |
| Spec headers' Pending notes (feature entries) | app-update: written with the behaviour; mac-distribution and landing-page: with the first release and the page live | #230 (app-update); #239 (the other two) | Evidence: the feature entries and the specs index |
| app-update Testing Pending (two releases) | An installation of the first release has updated to the second | #240 | Evidence: the update run |
| mac-distribution Testing Pending (verification run) | The first manual verification run passed every gate | #234 | Evidence: the run |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-14; spec app-update and implementation at 95696cd (branch feat/app-update-button, on 5911d52; 77ad3bb plus the e2e launch fix 2cd591a and the in-flight predicate refactor 95696cd, no behaviour change); merged to main as 1844676 (#243), same tree | Every unit mapped to #230, on #230's paths | `pnpm verify` exit 0 at 95696cd: 789 unit tests (controller 17, sources 8, contract 5, preferences), 104 e2e (11 in `e2e/app-update.spec.ts`), smoke OK; fifteen mutations, fourteen caught and one line without a case (the tooltip closing with the slot), closed by #231 with a case through the wake path; unit-by-unit mapping in [ticket-230-review-tests.md](ticket-230-review-tests.md); CON-001 in [evidence/ticket-230/con-001-search.txt](evidence/ticket-230/con-001-search.txt); a packaged build's real check in [evidence/ticket-230/packaged-run.txt](evidence/ticket-230/packaged-run.txt). The real-release paths owned by #240 (restart, install on quit, Squirrel staging, Failures C1 and H2, channel on real releases) not run | Verified on #230's paths; #240's paths unverified |
| 2026-10-14; spec app-update and implementation at 0bca714 (branch feat/settings-updates, on dab4da4: e3c73f9, the geometry case's fix 1a3e2fb and the owner-confirmed refactors 0bca714; the gateway ran on its tree before the commit) | Every unit mapped to #231, on #231's paths | `pnpm verify` exit 0: 822 unit tests (version record 12, settings' check record 10, version row 6, the two parsers, the switch's handler), 129 e2e (24 in `e2e/settings-updates.spec.ts`, including six languages × seven line states; one added to `e2e/app-update.spec.ts` for #230's gap), smoke OK; every case written after its code proven by a mutation; unit-by-unit mapping in [ticket-231-review-tests.md](ticket-231-review-tests.md); rendered results and computed values in [evidence/ticket-231/](evidence/ticket-231/README.md). Not covered: "Check now" after a real install (the restart, #240); the menu's parts of the shared units (#232) | Verified on #231's paths; #240's restart and #232's menu unverified |
| 2026-10-14; spec app-update (and i18n's menu unit) and implementation at 2b1b703 (branch feat/menu-check-updates, on bf77387; the gateway ran on its tree before the commit) | Every unit mapped to #232, on #232's paths | `pnpm verify` exit 0: 830 unit tests (the menu template, the notice contract, `noticeToast` 5), 135 e2e (6 in `e2e/menu-check-updates.spec.ts`, through the installed application menu), smoke OK; every case written after its code proven by a mutation; unit-by-unit mapping in [ticket-232-review-tests.md](ticket-232-review-tests.md). The native menu's picture (app-update::REQ-005's Evidence): the owner's screenshot of a local package built from 2b1b703, 2026-10-14 ([evidence/ticket-232/](evidence/ticket-232/README.md)) — the item directly below "About Agentshed", enabled, in the interface language (English) | Verified on #232's paths |
| 2026-10-14; spec mac-distribution and implementation at 7a72cc0, then 496287b (branch feat/mac-packaging-asset with main 1844676 merged in, bringing #230's updater) | Every unit mapped to #233, on #233's paths | `pnpm verify` exit 0 at 7a72cc0 and again at 496287b (the 51 asset tests via `pnpm test:scripts`; their wiring proven able to fail; 789 unit, 104 e2e, smoke at 496287b); a real `pnpm dist:mac:local` with Apple variables loaded and one without an identity at 7a72cc0 ([evidence/ticket-233/local-packaging.txt](evidence/ticket-233/local-packaging.txt)): no submission, `Agentshed-0.1.0-mac-arm64.dmg`, app and DMG signed by the Developer ID identity, minimum 12.0, fuses 7/7; at 496287b the same signatures, minimum and fuses with electron-updater inside the app ([evidence/ticket-233/local-packaging-merged.txt](evidence/ticket-233/local-packaging-merged.txt)); review records ticket-233-review-*.md. The DMG window: the owner's screenshot of the 496287b DMG ([evidence/ticket-233/dmg-window.png](evidence/ticket-233/dmg-window.png)). CON-006's local file: untracked and ignored since #245 (d262cdc), merged into the branch at ddc3c2a. Not covered: `dist:mac:release` (#234's verification run); CON-006's CI paths (#234, #236) | Verified on #233's paths |
| 2026-10-18; spec mac-distribution and implementation at 1444b6b (branch feat/release-workflow on 75fa4a8, which merged the placeholder workflow of #252); the spec write-back and the records are committed after it; merged to main as 63caf45 (#257, 2026-10-19), the same tree as the branch's last commit 1d78970 | Every unit mapped to #234, on #234's paths | `pnpm verify` exit 0 before and after the rebase (830 unit, 82 then 83 script tests, 135 e2e, smoke). The static workflow test (12 cases), the tag check (4) and the publish step (16) — each case shown able to fail by 28 mutations ([evidence/ticket-234/mutations.txt](evidence/ticket-234/mutations.txt)). The manual run without the switch, 39125515039: local packaging, signed and not notarized, nothing published ([local-run.txt](evidence/ticket-234/local-run.txt)); its artifact's real layout exposed a publish-step bug, fixed in 1444b6b (code review R2). The manual verification run, 39140793605 on 1444b6b: the app and the DMG notarized (Accepted, submissions e95d75ca-… and 859cfc24-…), stapled and gated; Apple's two logs kept unaltered in the artifact ([copies](evidence/ticket-234/notary-logs/)); the downloaded DMG and its app checked independently per policy §7; B1: 1 min 8 s and 1 min 2 s; nothing published ([verification-run-2.txt](evidence/ticket-234/verification-run-2.txt)). Its first attempt, 39134948592, failed at Apple's authentication (APPLE_ID held a value other than the account's email; the owner corrected it) and published nothing ([verification-run-1.txt](evidence/ticket-234/verification-run-1.txt)). Not covered: the tag tiers' real runs — the publish job and US-002/AC-02 with #239's v0.1.0-beta, US-001/AC-02 and AC-03's Evidence with #239; US-002/AC-01 and REQ-003's Evidence Waiting (trigger: the first formal release) | Verified on #234's paths; the tag tiers' runs Waiting (#239; the first formal release) |
| 2026-10-14; as above | Every unit mapped to #235 and zhoulf1006/skillshed#18 | Not run yet | Unverified |
| 2026-10-19; spec mac-distribution and implementation on branch feat/r2-mirror, on 0a5ad4d (the gateway ran on its tree before the commit; the records are committed with it, and a comment in the workflow was corrected after the gateway, with the script tests, actionlint, lint and the language and NUL checks rerun) | Every unit mapped to #236, on #236's paths | `pnpm verify` exit 0 on the final tree (830 unit, 98 script tests, 135 e2e, smoke); actionlint 0. The mirror's tests (11) and the static workflow test's five added cases (16 in all) — each case shown able to fail by 22 mutations ([evidence/ticket-236/mutations.txt](evidence/ticket-236/mutations.txt)); the publish step's 16 cases unchanged after the shared artifact reading. REQ-004/AC-03: CORS measured against the live host, the landing origin allowed for GET only, another origin and a PUT preflight refused, no pointer yet ([evidence/ticket-236/cors.txt](evidence/ticket-236/cors.txt)). REQ-004's host: the certificate check of 2026-10-17, ADR-0031 Accepted. Not covered: no manual run reaches the mirror or the pointer, so R2, the host's serving of new objects and the runner's aws-cli are unexercised; US-002/AC-01, REQ-003, REQ-004/AC-01, AC-02 and CON-006's R2 run logs Waiting (trigger: the first formal release) | Verified on #236's paths by test and measurement; the real run Waiting (the first formal release, whoever cuts it) |
| 2026-10-14; as above | Every unit mapped to #237 | Not run yet | Unverified |
| 2026-10-14; as above | Every unit mapped to #238 | Not run yet | Unverified |
| 2026-10-14; as above | Every unit mapped to #239 | Not run yet | Unverified |
| 2026-10-14; as above | Every unit mapped to #240 | Not run yet | Unverified |
| 2026-10-14; as above | #241 (the cross-check of mac-distribution::REQ-001/AC-04, and the closeout) | Not run yet | Unverified |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source row above maps to a coverage unit, or is recorded as superseded, background or out of scope | Table above | Complete for the answers of 10-12 08:16 to 10-13 spec synthesis. The 10-12 07:41 and 08:09 answers concern other work (#223 follow-ups, `.env.local`) and are not sources here |
| Reverse: every normative unit traced to a source or derived from one | All three specs | Derived units, each resolving an undefined case without changing a confirmed behaviour: app-update::US-002/AC-04 (literal reading of ADR-0032's schedule); app-update::US-003/AC-05 (a manual check joins one in flight — no duplicate request); app-update::REQ-006/AC-02 (sleep makes at most one check); app-update Failures A6, B3, C1, C3, E5, H1; mac-distribution::REQ-001/AC-04 (minimum macOS 12, agreeing with the confirmed landing copy and Electron 43's floor); mac-distribution Failures A1, C1–C3; landing-page Failures A3, A7, A8. Reported to the owner with the specs |
| Removed during the audit: a derived landing boundary with no source (section links scrolling clear of the sticky header) | landing-page Failure B2 | Removed; not decided by the prototype |
| Contradiction found while verifying the greyed "Check now": after a settings "up to date", an automatic check found an update whose download then failed, and the line went back to "up to date" although a newer version exists | app-update::REQ-004/AC-02; app-update Failure D5 | Derived, resolving it the way the owner's lifecycle-first answer resolved the earlier one: an update found by any check clears the line's earlier outcome. The prototype check was red before the fix (the line read "up to date") and green after. Reported to the owner |
| Derived with the post-update line: a hand-installed newer copy also shows it; a fresh install, the first recording version and a downgrade show nothing; with checks off or failing, "up to date" reflects what was known at download time | app-update Failures C7–C9 | The app cannot tell an updater install from a hand install; the rest follow from comparing recorded and running versions. Reported to the owner |
| Derived with "Install now": it stays but is unavailable while the install runs; the ready button and "Install now" are one action, so a second click on either starts no second install; when the download finishes with settings open, the unavailable "Check now" becomes "Install now" in place; a failed install from it leaves "Check now" and an empty line | app-update::REQ-003/AC-04; app-update Failures C10, C11 | Each fills a case the answer left open without changing it. The prototype check of the greyed state was proven able to fail: with "Install now" left available while installing, a second click installed twice (the version moved two steps) and the check went red. Reported to the owner |
| Gap found in the design self-review: a menu check while an update is installing was undefined, and the prototype toasted "found — downloading", which is false then | app-update::US-003/AC-04 | Derived: the menu reports "Installing update…" (the tooltip's existing text), as it reports the other in-flight states. Prototype fixed. Reported to the owner |
| Conflict check: ADR-0032's amendment names the ready button as what installs and restarts | ADR-0032; app-update::CON-004 | No conflict: its decision, that nothing restarts without the user's click, holds with a second place to click. CON-004 names both. Not ADR-worthy (an entry point, easy to reverse) |
| Conflict: CONTEXT's invariant said no outbound request at all while automatic checks are off, which forbids finishing a download already under way (10-12 14:21 answer) | CONTEXT invariant; app-update::US-002/AC-01, app-update::US-002/AC-03 | CONTEXT reworded to match the confirmed decision (no re-confirmation needed: it applies a decision already made) |
| Conflict check: ADR-0032's original decision vs its amendment | ADR-0032 | The specs follow the amendment; its own text records which consequences no longer hold |
| Conflict check: ADR-0031 "download points at the latest formal release on R2; otherwise the GitHub pre-release" vs the run-time fallbacks | ADR-0031; landing-page::REQ-001 | Consistent: the fallbacks refine what the ADR leaves unsaid; not ADR-worthy (easy to reverse) |
| Conflict check: the landing page reads GitHub at run time vs the app's outbound-request invariant | landing-page::CON-003; CONTEXT | No conflict: the invariant governs the app, and the page is a website |
| Unresolved dependency: the ZIP gate needs the electron-scaffold asset changed in skillshed | mac-distribution::CON-002 | Pending note in the spec; the work is outside this repository: zhoulf1006/skillshed#18 in skillshed, which blocks #235 |
| Unresolved dependency: the download host certificate | mac-distribution::REQ-004 | Resolved 2026-10-17: the infrastructure repository added the host and checked its certificate from outside Cloudflare; #236 recorded it, rewrote the spec's note and promoted ADR-0031 to Accepted (2026-10-19) |
| Prototype gate, interface points of app-update | app-update::REQ-001 to REQ-004, REQ-002/AC-03, US-003 toasts | Visible in the settings prototype: rail button in three states, tooltip, Updates section, dev-run state, result line, toasts, install failure. The native menu item is stated in the spec as an explicit exception (as for the rest of the menu in i18n). Revised parts (install-failure toast, lifecycle-first line, post-update line, "Check now" greyed while downloading, "Install now" while ready) confirmed by the owner on 2026-10-13 ("ok, confirmed"); the spec's Pending note on them is rewritten as plain text |
| Prototype gate, interface points of landing-page | landing-page::REQ-002 to REQ-006, QR-001 | Visible in the landing prototype: header, hero in four states, features section, screenshots, install steps, download section, footer, dark and light, narrow layout. The two new states (list; formal from GitHub) confirmed by the owner on 2026-10-13; the spec's Pending note on them is rewritten as plain text |
| Prototype gate, mac-distribution | mac-distribution::US-001/AC-04, US-003 | No app interface: the DMG window is electron-builder's default by the owner's choice, and the README is copy. Exception stated in the spec |
| Failure modes checked by user operation sequence, including state entry and exit | app-update Sequences A–G; landing-page A–D; mac-distribution A–E | Every lifecycle state has its entry and exit paths in the app-update table, and every failure returns to idle with REQ-002 deciding the visible result |
| Forward (spec → tickets), 2026-10-14: every coverage unit and every failure item of the three specs has an owning ticket | The three specs; the table above | A script extracted the primary definitions (`- <slug>::<id>/AC-nn:` and `### <slug>::<id> … (direct acceptance)`) and the failure labels from each spec and compared them with the table's first column: app-update 47 units and 43 failure items, mac-distribution 30 and 20, landing-page 34 and 17, none missing, no reference to an unknown unit. Failure items that only restate the units they cite are verified with those units |
| Reverse (tickets → spec): every planned acceptance item traces to a coverage unit, a technical prerequisite or a process step | Draft tickets #230–#241, zhoulf1006/skillshed#18 | Technical prerequisites, each tied to the units it supports: #230 the update source seam (scripted source for e2e and the packaged stand-in, app-update Testing Decisions); #237 the site's test command in the verification gateway and CI (landing-page Testing Decisions); #235 the asset version from zhoulf1006/skillshed#18 (mac-distribution::CON-002). Process acceptance in every ticket: code review, test review, document sync. No other item |
| Finding: some evidence can only exist after the first formal release, which no ticket makes (the first release is a pre-release by the owner's decision) | mac-distribution::US-002/AC-01, mac-distribution::REQ-003, mac-distribution::REQ-004/AC-01, mac-distribution::REQ-004/AC-02 | #236 is accepted on the static workflow test and the CORS evidence; the real-run evidence is recorded as Waiting with the trigger "the first formal release". Put to the owner with the breakdown |
| Finding: the app-update feature entry is due "when the behaviour ships", and the repository's rule writes feature entries in the same change as the behaviour | app-update header Pending; specs README | #230 writes the entry and rewrites the header's Pending note; #231 and #232 extend it. Not a requirement change |
| Finding: menu and settings checks in quick succession (app-update Failure D4) need both surfaces | app-update::US-003/AC-05 | #232 is blocked by #231 rather than only by #230 |
| Finding: the first release must carry the updater, or its users could never update in place | app-update (whole); mac-distribution::REQ-006 | #239 is blocked by #232 (and so #230 and #231) and by #235 (the ZIP). Put to the owner with the breakdown |
| Finding: the README points to the landing page, so the page goes live with the first release | mac-distribution::US-003/AC-01; landing-page header Pending | Launch, README and go-live are one ticket (#239): they are seen together |
| Derived during #234 (2026-10-18): the workflow tells a pre-release by a `-` after the version, exact only for a semver version without build metadata | mac-distribution Failure A6 (new); A2 | Derived to make A2 exact: a version with build metadata or not semver fails at the tag check, before Apple. Confirmed by the owner on 2026-10-18; owned by #234 |

### Legacy regression obligations

| Unit (legacy identifier) | Change this round | Mapping |
|---|---|---|
| appearance D4 (settings at the rail's bottom) | "sits alone" became untrue; reworded to the bottom anchor plus a pointer | Kept as appearance Failure D4: failure items carry a sequence label in the current format too (app-update's are referred to the same way), so the label needs no migration. Its own obligation (the bottom anchor) is unchanged; what may sit above it has its primary definition in app-update::REQ-001/AC-01. Regression owned by #230, with app-update Failure G1 |
| i18n "The application menu" implementation decision | "plus one entry point" became untrue; now names settings and "Check for Updates…" | Not a coverage unit of its own: it points to the menu item's primary definition, app-update::REQ-005, and gains no identifier. Regression owned by #232 (the menu template's structure test) |
