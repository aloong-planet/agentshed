# App updates

> Related decisions: [ADR-0032](../adr/0032-app-updates.md)

## Overview
An installed copy of Agentshed would otherwise stay on whatever version was first downloaded. The app
looks for a newer release by itself, downloads it in the background, and installs it when the user
clicks or quits — without ever interrupting what they are doing.

## Capabilities
- An installed copy checks for an app update at launch, then every 24 hours while it stays open, as long
  as automatic checks are on (the default); a Mac that slept through a check makes one check on waking
- An app update that is found starts downloading in the background at once, with no prompt
- While an update downloads, installs or is ready, a small round button sits at the bottom left, just
  above Settings; it shows the download's progress as a ring, then a spinning loader while installing
  (standing still for users who reduce motion), then a download icon when ready. With no update in
  flight there is no button and nothing moves
- Hovering or focusing the button shows at once what it is: "Update available", "Downloading update
  n%" (following the download while open) or "Installing update…", in the UI language
- Clicking the ready button installs the update and restarts the app into the new version; clicking it
  again, or clicking while downloading, does nothing more
- An update left ready is installed when the app is next quit, and the next launch runs it
- The button follows the chosen theme and light or dark appearance like the rest of the app
- Settings has an "Updates" section after Language and Appearance. Its "Check for updates
  automatically" switch is on by default; a change applies at once and is kept across restarts.
  Turning it off does not stop a download already under way or drop an update that is ready, and
  turning it on does not check straight away — the next launch or daily check does
- "Current version" shows the version running, with "Check now" beside it: the line next to the button
  says "Checking…", then "You're up to date" or "Couldn't check for updates", and an update it finds
  starts downloading like any other. The button cannot be pressed while its own check runs or while an
  update downloads
- While an update downloads, is ready or installs, that line says so, whichever check found it; once the
  update is ready the button becomes "Install now", which does what the ready button at the bottom left
  does. A failed download leaves the line empty rather than claiming the app is up to date
- The line is kept when leaving settings and coming back, and follows the UI language. A new launch
  starts with it empty, except the first launch after the app's version went up — by an update or by a
  newer copy installed by hand — where it says "You're up to date"
- A check that fails, and a download that fails, show nothing: the button goes away and a later check
  tries again. A failed install after the click shows an error notice, and a later check downloads the
  update again
- An installation is offered the kind of release it is: a test version (pre-release) is offered newer
  test versions and formal releases; a formal release, formal releases only. Nothing older than the
  running version is ever offered

## Boundaries and non-goals
- Checking for updates is the one thing the app itself fetches from the network: it asks GitHub
  Releases about new versions and downloads the one it finds. Nothing else in the app reaches the network,
  and with automatic checks off it reaches it only when you check from settings
- A development run (an app built from source and not packaged) never checks for updates: its switch and
  "Check now" are unavailable, and settings says why
- No release notes are shown in the app, and an update cannot be skipped or postponed; the release
  channel cannot be chosen — it follows the version installed
- An app run straight from the disk image, without being moved to Applications, cannot update itself:
  its downloads fail, so the button goes away again after each one
