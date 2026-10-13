# App updates

> Related: [ADR-0032](../adr/0032-app-updates.md) (as amended the same day) ·
> [ADR-0031](../adr/0031-macos-release-line.md) (the releases this reads) ·
> [mac-distribution](mac-distribution.md) (what each release carries) · CONTEXT: **App update**,
> **Update check**, **Release channel**, and the invariant on outbound requests
>
> Pending: an installed release of Agentshed checks for app updates. Until it does there is no
> feature entry to link.

## Problem Statement

Once Agentshed is released, an installed copy has no way to learn that a newer version exists: users
stay on whatever they first downloaded. Agentshed is local-first, and until now its own code has made
no outbound request at all, so whatever reaches the network has to be the one deliberate exception, be
possible to turn off, and must not stand between the user and their work.

## Solution

The app checks GitHub Releases for an app update at launch and every 24 hours, while a settings switch
(on by default) allows it. An update that is found downloads in the background at once, as in Codex. A
small button appears at the bottom of the rail only while that update is downloading, installing or
ready to install; hovering it says what it is, and clicking the ready button, or "Install now" in
settings, installs the update and restarts the app. An update left ready is installed when the app next
quits. The user can also check by hand, from the application menu or from settings, and a manual check
always reports what it found. An
automatic check that fails, and a background download that fails, show nothing. An installation is
offered the releases of its own release channel, which follows the version installed. A development
run never checks.

## User Stories

### app-update::US-001 Stay current without watching the repository

As a user with automatic checks on, I want a newer version to reach me on its own and wait until I am
ready, so that I stay current without visiting GitHub and without being interrupted.

- app-update::US-001/AC-01: At launch the app makes one automatic update check. When it finds an app
  update, the download starts in the background at once, with no prompt, and the update button
  appears at the bottom of the rail showing the download's progress.
- app-update::US-001/AC-02: While the app stays open, it makes another automatic check every 24 hours.
- app-update::US-001/AC-03: When the download completes, the button becomes the ready button.
  Hovering or focusing it shows "Update available".
- app-update::US-001/AC-04: Clicking the ready button installs the update and restarts the app into
  the new version.
- app-update::US-001/AC-05: An update left ready is installed when the app next quits, and the next
  launch runs the new version.
- app-update::US-001/AC-06: At no point does anything block the app. No dialog or modal appears, no
  page changes, and while no update is in flight the button takes no space in the rail.

### app-update::US-002 Keep the app from reaching the network on its own

As a user who does not want the app to go online by itself, I want to turn automatic checks off, so
that it makes no request unless I ask for one.

- app-update::US-002/AC-01: With the switch off, the app makes no automatic check, neither at launch
  nor on the 24-hour timer. Together with app-update::CON-001 this means the app starts no outbound
  request unless the user asks for a manual check. The one exception is the download already under way
  that app-update::US-002/AC-03 lets finish.
- app-update::US-002/AC-02: The switch is on in a fresh installation. Its value survives a restart. An
  unreadable or invalid stored value falls back to on without disturbing any other preference.
- app-update::US-002/AC-03: The switch governs automatic checks only. Turning it off neither cancels
  a download already under way nor discards an update already ready, which still installs on quit or
  on a click.
- app-update::US-002/AC-04: Turning the switch on does not start a check. The next check is the next
  launch or the next tick of the 24-hour timer.

### app-update::US-003 Check by hand and always hear the outcome

As a user, whether or not automatic checks are on, I want to ask for a check and always be told what
it found, so that I know where I stand.

- app-update::US-003/AC-01: "Check for Updates…" in the application menu reports its outcome in a
  toast. The possible outcomes are already up to date (naming the current version), the check failed,
  or an update was found and is downloading in the background.
- app-update::US-003/AC-02: "Check now" in settings reports its outcome in the result line beside the
  button: checking, already up to date, or the check failed. An update it finds shows in the line as
  described in app-update::REQ-004. The button is unavailable while its own check runs, and while an
  update is downloading — a click could change nothing then, and the line already says why (owner's
  call, 2026-10-13). While an update is ready or installing, the button is "Install now" instead
  (app-update::REQ-003/AC-04). "Check now" is back, and available, once the update is installed, or
  once the download or the install fails.
- app-update::US-003/AC-03: A manual check that finds an update starts the background download, as
  any other check does.
- app-update::US-003/AC-04: A check from the menu made while an update is downloading, ready or
  installing makes no request and does not start a second download. It reports that state in a toast
  instead: the version is downloading, it is ready to install, or the update is installing. Settings
  cannot ask in that state: its button is unavailable while the update downloads and is "Install now"
  while it is ready (app-update::US-003/AC-02).
- app-update::US-003/AC-05: A manual check made while another check is in flight does not start a
  second request. It reports the outcome of the check in flight.

### app-update::US-004 Be offered the releases of my channel

As a user, I want to be offered the kind of release I installed, so that I do not end up on a test
version I did not choose, while a test version still gets its fixes.

- app-update::US-004/AC-01: An installation of a formal release is offered formal releases only.
- app-update::US-004/AC-02: An installation of a pre-release is offered newer pre-releases and newer
  formal releases.
- app-update::US-004/AC-03: Once a pre-release installation has updated to a formal release, it is a
  formal-release installation and is offered formal releases only.
- app-update::US-004/AC-04: No installation is ever offered a version older than the one it runs.

### app-update::US-005 A development run never checks

As a developer running the app unpackaged, I want it never to check or update, so that a release
never replaces my working build. The updater cannot work in an unpackaged app anyway.

- app-update::US-005/AC-01: An unpackaged run makes no update check, automatic or manual.
- app-update::US-005/AC-02: In an unpackaged run the menu item is disabled, the switch and the
  "Check now" button are unavailable, and the settings footnote says that updates are not checked in
  a development run.

## Functional Requirements

### app-update::REQ-001 The update button

- app-update::REQ-001/AC-01: The button sits in the rail's bottom group, directly above Settings, and
  is present only while an update is downloading, installing or ready. In every other state (no update,
  or a check in flight) the slot is empty and takes no space.
- app-update::REQ-001/AC-02: It takes a 36px rail slot holding a 24px filled circle in the current
  theme's accent colour, with its glyph in the card colour: a progress ring showing the download's
  progress while downloading, a spinning loader-circle while installing (still under reduced motion),
  and the download icon when ready.
- app-update::REQ-001/AC-03: Only the ready button can be clicked. It has no close action and stays
  until the update is installed.
- app-update::REQ-001/AC-04: Hovering or focusing the button shows an instant tooltip to its right, in
  the chart tooltip's dark form. The texts are "Update available", "Downloading update n%" and
  "Installing update…". The same text is the button's accessible name, and while downloading the
  slot exposes its progress as a progress bar. The tooltip follows the progress while open and stays
  anchored to the slot.
- app-update::REQ-001/AC-05: The circle, its glyph and the tooltip stay distinguishable in all three
  themes, in both light and dark.

### app-update::REQ-002 Failures

- app-update::REQ-002/AC-01: A failed automatic check shows nothing. The next scheduled check tries
  again.
- app-update::REQ-002/AC-02: A failed background download, whichever check started it, shows nothing.
  The button goes, and the next check, scheduled or manual, downloads again.
- app-update::REQ-002/AC-03: A failed install after the user clicked to install — the ready button or
  "Install now" in settings — shows an error toast, "Couldn't install the update". The button goes, and
  the next check downloads again.

### app-update::REQ-003 The settings "Updates" section

- app-update::REQ-003/AC-01: The settings page gains a third section, "Updates", after Language and
  Appearance, in the same card-and-rows form. One card holds two rows. The first, "Check for updates
  automatically", has an On / Off segmented control (the existing segmented form). The second,
  "Current version" followed by the running version, has the result line and one button: "Check now",
  or "Install now" while an update is ready or installing (app-update::REQ-003/AC-04).
- app-update::REQ-003/AC-02: Below the card, a footnote says that new versions download in the
  background, that clicking the update button at the bottom left installs and restarts, and that
  otherwise the update installs on quit. In a development run the footnote is replaced as stated in
  app-update::US-005/AC-02.
- app-update::REQ-003/AC-03: A change to the switch takes effect at once, with no save button.
- app-update::REQ-003/AC-04: While an update is ready, the version row's button is "Install now" in
  place of "Check now", in the same form and position: the line beside it says the update is ready, so
  the row offers the install (owner's call, 2026-10-13). Clicking it does what clicking the ready
  button does (app-update::US-001/AC-04). The two are one action: once either is clicked the install
  runs once, "Install now" stays but is unavailable while it runs, and the rail shows installing. When
  the download finishes while settings is open, the unavailable "Check now" becomes "Install now"
  where it stands.

### app-update::REQ-004 The settings result line follows the update

- app-update::REQ-004/AC-01: While an update is downloading, ready or installing, the result line
  shows that state, whichever check found the update: "Version x is downloading", "Version x is ready
  to install" or "Installing update…".
- app-update::REQ-004/AC-02: With no update in flight, the line shows the outcome of the last check
  made from settings in this session; failing that, the post-update line of app-update::REQ-004/AC-04;
  failing that, nothing. An update found by any check, from any surface, clears the line's earlier
  outcome, since an "up to date" or a failure from before is no longer true. So after a background
  download fails the line is empty: it shows neither the download nor an outdated "up to date".
- app-update::REQ-004/AC-03: The line is kept when the user leaves settings and comes back, and it
  follows a language switch. It is not kept across a restart: a new run starts empty, or with the
  post-update line of app-update::REQ-004/AC-04.
- app-update::REQ-004/AC-04: On the first run after the app's version went up — whether the update was
  installed from the ready button, installed on quit, or installed by hand — "Current version" shows
  the new version, and the line shows "You're up to date" in the ok form, the same text a settings
  check gives. The line describes the state the user is in, not the action ("updated"), by the owner's
  call of 2026-10-13. It stays for that run until a check made from settings replaces it, and
  app-update::REQ-004/AC-01 still wins over it.

### app-update::REQ-005 The menu item (direct acceptance)

The application menu gains "Check for Updates…" directly below "About Agentshed". Its copy follows the
in-app language and is rebuilt with the rest of the menu after a language switch. It is disabled in a
development run.

### app-update::REQ-006 The schedule

- app-update::REQ-006/AC-01: There is one automatic check at launch, then one every 24 hours while the
  app runs. Each one honours the switch as it stands at that moment.
- app-update::REQ-006/AC-02: A Mac that sleeps through one or more ticks makes at most one check on
  waking, never a burst of missed checks.
- app-update::REQ-006/AC-03: While an update is downloading, ready or installing, an automatic check
  makes no request. The update in flight is installed first, and the next check after the restart
  looks again.

## Quality Requirements

### app-update::QR-001 Copy fits in every UI language

Applies to: every string this feature adds — the menu item, the three tooltips, the settings section,
both footnotes, every result line and every toast.

- app-update::QR-001/AC-01: Every string exists in all six UI languages (ADR-0013) and passes the
  dictionary gates.
- app-update::QR-001/AC-02: Measured in each of the six languages at the settings page's width, the
  row labels and the result line each stay on one line beside their controls, for every state of the
  line.

## Constraints

### app-update::CON-001 The app's one outbound request (direct acceptance)

Applies to: the app's own code, in the main process and the renderer. The update check, and the
download of an update it found, are the only outbound requests the app makes, and both go to GitHub
Releases (ADR-0032, CONTEXT's outbound-request invariant). The renderer's content security policy
keeps allowing no remote origin. The app shows no statement about this request (ADR-0032 option 10,
declined).

### app-update::CON-002 GitHub Releases is the update source (direct acceptance)

Applies to: every installed copy. Update information and update packages come from GitHub Releases,
never from the R2 mirror (ADR-0032 option 2, rejected). The mirror holds formal releases only, and the
channel rule of app-update::US-004 depends on GitHub's release feed.

### app-update::CON-003 No natural language from the main process (direct acceptance)

Applies to: the update states and outcomes that cross IPC. They cross as enumerated states, versions,
progress and error codes. Every word the user reads comes from the renderer's dictionaries (ADR-0015,
ADR-0016).

### app-update::CON-004 Nothing restarts without the user (direct acceptance)

Applies to: every install. The app restarts into an update only after a click on the ready button or
on "Install now" in settings (app-update::REQ-003/AC-04).
Install on quit happens only on a quit the user made, and never relaunches the app.

## Failure modes and boundaries

**Sequence A: launch and the schedule**

- A1 Launch with the switch on and the network up: one check (app-update::US-001/AC-01). If it finds
  nothing, nothing is shown.
- A2 Launch offline, with GitHub unreachable, or with a rate-limited or blocked response: the check
  fails silently (app-update::REQ-002/AC-01). There is no faster retry. The next tick or a manual
  check tries again (ADR-0032 consequence: those users see no update until a check gets through).
- A3 Launch with the switch off: no check at all (app-update::US-002/AC-01).
- A4 The app is left open for days: one check per 24 hours (app-update::REQ-006/AC-01). Sleep through
  a tick: at most one check on waking (app-update::REQ-006/AC-02).
- A5 The switch is turned on mid-session: no immediate check (app-update::US-002/AC-04).
- A6 The feed answers with something that is not a valid newer version (a malformed or missing
  version, or metadata without the macOS package): the check counts as failed. It shows nothing when
  automatic, and reports "Couldn't check for updates" when manual. A version string is shown to the
  user only after it has been validated.

**Sequence B: found and downloading**

- B1 An update is found by any check: the background download starts and the button appears with
  progress at 0 (app-update::US-001/AC-01, app-update::US-003/AC-03).
- B2 The download fails (network drop, a full disk, a package that fails verification): the button
  goes and nothing is shown (app-update::REQ-002/AC-02). If the menu had already toasted "found —
  downloading", no second toast follows. The settings line stops showing the download
  (app-update::REQ-004/AC-02).
- B3 The app runs from the DMG or another read-only or translocated location: the update cannot be
  applied there, and that surfaces as a failed download, so the button never appears. The landing page
  and the README tell users to drag the app to Applications. Prompting the user to move it is out of
  scope.
- B4 The user quits during a download: nothing is installed. The next check downloads again (a cached
  partial download may be reused, which the user does not see).
- B5 The switch is turned off during a download: the download continues (app-update::US-002/AC-03).

**Sequence C: ready and installing**

- C1 Ready, and the user clicks the ready button or "Install now": installing, then restart into the
  new version (app-update::US-001/AC-04, app-update::REQ-003/AC-04). Pending display-cache writes are
  flushed as on any normal quit before the app is replaced, so the restart loses no saved page.
- C2 Ready, and the user quits by any normal route (the menu, ⌘Q, closing the window): install on quit,
  with no relaunch (app-update::US-001/AC-05, app-update::CON-004).
- C3 Ready, and the app is force-quit or crashes: nothing is installed. The next launch's check finds
  the update again and makes it ready again, possibly from the cached download.
- C4 The install fails after the click (a full disk, changed permissions, a signature the system
  rejects): error toast, the button goes, and the next check downloads again (app-update::REQ-002/AC-03).
- C5 A newer release is published while an update is ready: automatic checks do not look until the
  ready update is installed (app-update::REQ-006/AC-03). After the restart, the next check offers the
  newer one.
- C6 A check while ready: from the menu it reports "ready to install" and makes no request
  (app-update::US-003/AC-04). Settings offers "Install now" in place of "Check now", so it cannot ask
  (app-update::REQ-003/AC-04).
- C7 The first run after an update, by either route (C1 or C2): "Current version" is the new version,
  and the line says "You're up to date" (app-update::REQ-004/AC-04). If that run's launch check finds
  a still newer release, the line shows its download instead (app-update::REQ-004/AC-01). If automatic
  checks are off or the launch check fails, a release published after the download is unknown to this
  run, and the line still says up to date — the same knowledge a settings check had when the update was
  found. A settings check replaces the line.
- C8 The first run of a fresh installation, the first run of the first version that records its
  version, and a run after the version went down (a hand-installed older copy): no post-update line.
- C9 A newer copy installed by hand (dragged from a DMG): its first run counts as a run after the
  version went up, and shows the post-update line. The app cannot tell the two routes apart, and the
  line holds for both.
- C10 The user clicks the ready button or "Install now", then clicks either again before the restart:
  nothing more happens. "Install now" is unavailable and the rail shows the spinner, which cannot be
  clicked, so the install runs once (app-update::REQ-003/AC-04, app-update::REQ-001/AC-03).
- C11 The download finishes while settings is open: the unavailable "Check now" becomes "Install now"
  where it stands, and the line becomes "ready to install" (app-update::REQ-003/AC-04,
  app-update::REQ-004/AC-01). An install from "Install now" that fails leaves "Check now", available,
  and an empty line (app-update::REQ-002/AC-03, app-update::REQ-004/AC-02).

**Sequence D: manual checks**

- D1 Menu check, up to date: an ok toast naming the current version. Failed: an error toast. Found: an
  ok toast saying it is downloading in the background (app-update::US-003/AC-01).
- D2 Settings check: the button is unavailable while it runs, and the line shows "Checking…" and then
  the outcome (app-update::US-003/AC-02).
- D3 A manual check while an automatic one is in flight: no second request, and the requester gets the
  in-flight outcome (app-update::US-003/AC-05).
- D4 Menu and settings checks in quick succession: the second joins the first. Each surface reports in
  its own form.
- D5 A settings "up to date", then an automatic check finds an update: the line switches to the
  download (app-update::REQ-004/AC-01). If that download then fails, the line is empty, not "up to
  date" again (app-update::REQ-004/AC-02), and "Check now" is available again.
- D6 The user leaves settings during a check and returns after it finished: the line shows the outcome
  (app-update::REQ-004/AC-03).

**Sequence E: channel**

- E1 0.1.0-beta installed, 0.1.0-beta.2 published: offered (app-update::US-004/AC-02).
- E2 0.1.0-beta installed, 0.1.0 published: offered. After installing it, a later 0.2.0-beta is not
  offered (app-update::US-004/AC-03).
- E3 0.2.0 installed, 0.2.1-beta published: not offered (app-update::US-004/AC-01).
- E4 A release older than the running version is marked latest on GitHub: not offered
  (app-update::US-004/AC-04).
- E5 A locally packaged build (signed, never notarized, version 0.1.0) is an installation of its
  version like any other: it is offered a newer formal release when one exists. This affects
  developers only.

**Sequence F: development run**

- F1 An unpackaged run: no check from any trigger. The controls are unavailable and the menu item is
  disabled (app-update::US-005).
- F2 The test seam (see Testing Decisions) can declare an update source in an unpackaged run under
  test. Production never sets it.

**Sequence G: interaction with existing features**

- G1 The rail's bottom group: when present, the update button sits above Settings. Settings keeps its
  bottom anchor, and the rail's other entries do not move (appearance D4 refers here).
- G2 A language switch: the menu item, an open tooltip, the settings section and the result line all
  follow at once. A toast already shown keeps its language.
- G3 A theme or light/dark switch: the circle, glyph and tooltip recolour with everything else
  (app-update::REQ-001/AC-05).
- G4 The first launch after an update restores the startup display data like any other launch: an
  application version change alone does not discard it (agents-overview::CON-001). The usage
  archive's accounting stamp includes the application version and follows its own rules
  (token-stats). The update adds no migration of its own.
- G5 A second instance launched while an update is ready exits as before (single-instance lock). The
  running instance keeps the ready update.
- G6 Toasts: the update toasts use the app's existing toast and stack with any other toast.

**Content brought in from outside**

- H1 The release feed is external content. Only a validated version string from it reaches the
  renderer, and it is rendered as text. Release notes, links and HTML from the release are not shown
  anywhere in the app, so they open no new surface.
- H2 The downloaded package is applied by the system updater, which checks its code signature against
  the running app. A package the system rejects is an install failure (C4), never a partial install.

## Implementation Decisions

- **One update controller in the main process** owns the lifecycle and is the only thing that calls the
  updater. It talks to an injected **update source**. In production that is electron-updater reading
  GitHub Releases, with automatic download on, install on quit on, no downgrade, and the pre-release
  setting left to follow the running version (ADR-0032 Context).
- **The lifecycle** (decision from the prototype, trimmed): the states are idle, checking, downloading
  (with progress), ready and installing. There is no failure state: every failure returns to idle,
  and REQ-002 decides what the user sees.

  | From | Event | To |
  |---|---|---|
  | idle | a check starts (automatic, gated by the switch; or manual) | checking |
  | checking | update found | downloading |
  | checking | up to date / failed | idle |
  | downloading | progress | downloading |
  | downloading | done | ready |
  | downloading | failed | idle |
  | ready | the user clicks the ready button or "Install now" | installing |
  | installing | failed | idle (error toast) |
  | downloading / ready / installing | a check is asked for | unchanged; the state is reported |
  | checking | a check is asked for | unchanged; the requester joins it |

- **IPC**: the main process pushes the lifecycle (state, version, progress) to the renderer, and the
  renderer asks for "check now" (naming the surface that asked), "install", and the current state on
  mount. The outcome of a manual check is reported back to the surface that asked for it. All of this
  goes through the contract module with validation on both sides (ADR-0001).
- **The switch is a preference**, stored in the existing preferences table with one setter of its own,
  the same shape as theme, mode and language, and with per-field fallback to on.
- **Packaged or not** is the app's own packaged flag. The menu item's enabled state and the settings
  controls' availability both derive from it.
- **The menu** keeps its template as a pure function of the language and the injected actions. The new
  item adds an action and an enabled flag.
- **Renderer**: a rail slot in the bottom group, the settings section, and the toasts. New icons
  (download, loader-circle) go into the icon module, copied from Lucide. The tooltip reuses the chart
  tooltip's existing form and colour tokens. The circle uses the accent token and its glyph the card
  token, so nothing is hard-coded per theme.
- **Quit ordering**: install-and-restart goes through the app's normal quit path, so the display-cache
  flush in that path runs before the app is replaced.
- **The first run after an update** is recognised by comparing the running version with the version the
  app recorded on its previous run. The record is kept in userData, apart from the preferences (it is
  not something the user chooses). It is written at each launch, and a missing record shows nothing
  (C8).

## Testing Decisions

Seams confirmed by the owner on 2026-10-13:

- **The update source**: unit tests drive the controller with a fake source, covering every transition
  in the table, gating by the switch, the packaged flag and the lifecycle, deduplication of concurrent
  checks, the schedule (with injected time), and every failure path.
- **An environment-injected scripted source for e2e**, in the same family as the existing
  `AGENTSHED_*` test seams and never set in production. It lets Playwright drive found → downloading →
  ready → install, from either button and including the install failure, and assert the rail button,
  its tooltip text and geometry, the settings section and line, and the toasts. It also stands in for
  "packaged" for the update feature only, so the settings controls can be exercised under test.
- **The preferences store**: the switch's default, persistence and per-field fallback, following the
  existing preference cases.
- **The post-update line**: e2e seeds an older, equal, newer or missing recorded version in the
  isolated userData and asserts what the line and "Current version" show (app-update::REQ-004/AC-04,
  C7–C9). No update has to run for this.
- **The IPC contract**: validation of the lifecycle payload and of the command arguments.
- **The menu template**: unit tests on the pure function cover the item's position, copy in six
  languages and its disabled state when unpackaged. What the native menu actually draws is accepted by
  hand — a known gap, as for the rest of the menu (i18n).
- **Not automatable, accepted by evidence**: the real electron-updater ↔ GitHub ↔ system-updater path,
  channel selection on real releases, and install on quit. These are first verifiable once two
  releases exist.

  > Pending: two releases exist, so an installation of the first has been updated to the second.

Prior art: the rescan and scan-delay environment seams, the preference store's per-field cases, and the
menu template's tests.

## Out of Scope

- Showing release notes or a "what's new" page in the app.
- Letting the user choose a channel, skip a version, or postpone an update.
- Prompting the user to move the app to Applications (B3).
- Updating from the R2 mirror (app-update::CON-002).
- A statement about the network request (ADR-0032 option 10, declined).
- Windows and Linux.
- Any requirement on how a download is transferred (whole or differential); either satisfies this
  spec.

## Further Notes

- Prototype gate: the rail button, the settings section and the toasts passed on 2026-10-13. The
  owner confirmed the accent fill, the instant dark tooltip, the reused segmented control, the
  footnote, the loader-circle icon, and the menu item placed below "About". The native menu cannot be
  expressed in an HTML prototype and is stated here instead.

  > Pending: the owner has confirmed the revised prototype's install-failure toast
  > (app-update::REQ-002/AC-03), its lifecycle-first result line (app-update::REQ-004/AC-01), its
  > post-update line (app-update::REQ-004/AC-04), its "Check now" that is unavailable while an update
  > downloads (app-update::US-003/AC-02), and its "Install now" in place of "Check now" while an update
  > is ready (app-update::REQ-003/AC-04).

- The first release is a pre-release (ADR-0031), so the first users are on the pre-release channel.
