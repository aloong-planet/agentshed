# ADR-0042: A packaged build refuses every launch input outside an allow-list, and the packaging proves it

- Status: Accepted (2026-11-06)

## Context

macOS trusts a signed build: what the user granted it, and what it can read, belong to whatever runs inside it. The
Electron fuses close Node's entries (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect`), but a same-user process could
still launch the build with Chromium switches that open a debugging port or run a program, or with the app's test-seam
or development-server variables (Sources). Chromium's switches are not a published contract, and how it reads an
argument differs by platform.

## Options

1. **Refuse the whole launch, with exit code 64, on any argument but an accepted one's exact spelling or any seam
   variable, and prove it on the built app in every packaging** — chosen.
2. Remove the debugging switches with `app.commandLine.removeSwitch` and carry on — rejected: it closes the port and
   leaves `--gpu-launcher` and everything not yet found.
3. Remove every switch outside an allow-list and carry on — rejected: a switch read before the main script runs cannot
   be undone, so the app would run under an input it believes it removed.
4. A deny-list of known switches, then refuse — rejected: the list is only as good as the last guess, and
   `--gpu-launcher` is what a guess misses.
5. Gate each seam where it is read, with `app.isPackaged` — rejected: they are read at over a dozen sites, and a
   new seam would be open until someone remembered.
6. A dialog on refusal — rejected: no one reaches this by opening the app, a launcher could use it to show a dialog in the
   app's name, and it is a new state form.
7. Keep the port for the release's own checks — rejected: what one drive of the notarized build showed does not
   outweigh a port open on every installed copy.
8. Leave it, since whoever can start the app already runs as the user — rejected: they do not hold what the user
   granted this app, and the fuses already close the same door for Node.
9. Read an argument as Chromium might, by a leading dash or by copying its trimming and platform prefixes — rejected:
   Chromium trims whitespace first, so a dash test lets a switch after a space or a tab through, and a copy of its
   reading fails at the next difference nobody has read.

## Decision

We choose **option 1**. In a packaged build, before anything loads, the main process exits with code 64, showing
nothing, when the launch carries an argument other than the exact spelling of `--user-data-dir=<path>` or a `-psn_`
token, or an environment variable, its name in any case, that is the development server's URL or an `AGENTSHED_*` test
seam (mac-distribution::CON-008). `--user-data-dir` stays because it only moves the settings, letting a packaged
build start without the real ones. Every packaging proves the refusal on the built app
(mac-distribution::CON-008/AC-05) through electron-scaffold's packaging asset, so no project using it can ship this
door, and the exit code is the contract with that check, so a crash never passes for a refusal.

## Consequences

- Positive: the switches nobody has tried yet are closed too, and every seam, `AGENTSHED_UPDATE_SCRIPT` included, is out
  of reach in an installed copy, a new one with the prefix refused without another line.
- Negative: an installed copy cannot be driven through a debugging port, given a fixture home or run with
  `--enable-logging`, so checking or diagnosing one beyond its exit, window and files takes a build of its tag.
- Negative: an argument the app has no use for, such as a file path, is refused too; were a future macOS to add one to
  every launch the app would not open, and the packaging check, which starts the process directly, would not show it.
- Neutral: `--type` naming a process type crashes before any of our code runs, with or without the guard, so it gets
  no exit 64 (mac-distribution F10).
- Neutral: names compare in any case, as Windows reads the environment, so on macOS this refuses only names nobody
  sets.
- Neutral: a bundle copy with its executable renamed would read as unpackaged (not measured), but its signature would
  no longer hold (mac-distribution F4).

## Sources

Measured on notarized v0.1.0-beta.5 and beta.6 (macOS 26, Electron 43.2.0): `--remote-debugging-port` (one dash or two,
also through the helper executable) and `--remote-debugging-pipe` opened a channel that drives the window,
`--gpu-launcher=<program>` ran it, `ELECTRON_RENDERER_URL=<url>` loaded the URL with trusted IPC and the preload's 41
methods, an empty `--type=` beside the port switch opened the port, and eleven `AGENTSHED_*` seams were read, one
replacing the update source; `removeSwitch` closed the port, but `--js-flags=--expose-gc` removed at the top of main
left `gc` exposed. beta.7's bypass: the 2026-11-06 postmortem. `open` passes only what it is given, and the updater's
relaunch nothing (macOS 26). Chromium's `base/command_line.cc`; Node's documentation of Windows environment names;
electron-scaffold's `electron-security.md` item 21 and `macos-signing.md` section 6.
