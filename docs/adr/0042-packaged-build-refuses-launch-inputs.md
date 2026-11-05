# ADR-0042: A packaged build refuses every launch input outside an allow-list, and the packaging proves it

- Status: Accepted (2026-11-05)

## Context

macOS trusts a signed build: what the user has granted it, and what it can read, belong to whatever runs inside it. The
Electron fuses (`electron-builder.yml`) close Node's entries into a packaged build, `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`
and `--inspect`, and nothing closed the others. Measured on the notarized v0.1.0-beta.5 and v0.1.0-beta.6 (macOS 26, Electron 43.2.0),
launched by a process running as the same user, against temporary directories:

| Input | What the build did |
|---|---|
| `--remote-debugging-port`, with one dash or two | Opened the port; a client could drive the window |
| `--remote-debugging-pipe` | Answered on the pipe |
| `--gpu-launcher=<program>` | Ran the program |
| `ELECTRON_RENDERER_URL=<url>` | Loaded the URL in the window, trusted its IPC, and gave it the preload's 41 methods |
| `--renderer-cmd-prefix`, `--utility-cmd-prefix` | Ran nothing, and crashed |

`--gpu-launcher` turned up only by trying a few more switches, not from any list: Chromium's switches are not a published
contract. The helper executable, run directly with the port switch, opened the port too. The app also read eleven
`AGENTSHED_*` test seams in a packaged build, one of which replaces the update source.

## Options

1. **Refuse the whole launch, with exit code 64, on any switch outside an allow-list or any seam variable; the packaging
   launches the built app to prove it** — chosen.
2. Remove the debugging switches with `app.commandLine.removeSwitch` and carry on — rejected: it closes the port (measured)
   and leaves `--gpu-launcher` and everything not yet found.
3. Remove every switch outside an allow-list and carry on — rejected: a switch read before the main script runs cannot be
   undone. Measured: `--js-flags=--expose-gc` removed at the top of main still leaves `gc` exposed. The app would run under
   an input it believes it removed.
4. A deny-list of known switches, then refuse — rejected: the list is only as good as the last person's guess, and
   `--gpu-launcher` is what a guess misses.
5. Gate each seam where it is read, with `app.isPackaged` — rejected: they are read at more than a dozen sites, and a new
   seam would be open until someone remembered.
6. A dialog on refusal — rejected: no one reaches this by opening the app, so there is no user to tell; a launcher could use
   it to put a dialog in the app's name on screen; and it would be a new state form.
7. Keep the port for the release's own checks — rejected: driving the notarized build through it was tried once, for
   v0.1.0-beta.6, and the evidence it gave does not outweigh leaving it open on every installed copy.
8. Leave it, since whoever can start the app already runs as the user — rejected: they do not hold what the user granted
   this app, and the fuses already close the same door for Node.

## Decision

We choose **option 1**. In a packaged build, before anything loads, the main process exits with code 64 when the launch
carries a switch other than `--user-data-dir` or an environment variable that is the development server's URL or an
`AGENTSHED_*` test seam. It names the refused inputs on standard error, without their values, and shows nothing.
`--user-data-dir` stays because it only moves where the settings live and runs nothing, and it lets a packaged build be
started without touching the real settings.

The refusal is checked on the real package, since an unpackaged run never reaches it: every packaging, in either profile,
launches the built app with inputs it must refuse and then with only its settings directory. The check lives in
electron-scaffold's packaging asset, so a project using the asset cannot ship this door. The exit code is the contract
between the app and that check, so a crash never passes for a refusal.

## Consequences

- Positive: the switches nobody has tried yet are closed too, and a new seam with the prefix is refused without another line.
- Positive: `AGENTSHED_UPDATE_SCRIPT` and the other seams are out of reach in an installed copy, as their specs always said.
- Negative: an installed copy can no longer be driven through a debugging port or given a fixture home. A check on a real
  package is limited to what its exit, its window and its files show; anything else runs from a build of the tag.
- Negative: `--enable-logging` and the like no longer work on an installed copy, so diagnosing one means a build of its tag.
- Negative: if a future macOS added an argument of its own to every launch, the app would refuse to open, and the packaging
  check would not show it, because it starts the process directly. Measured on macOS 26: `open` passes only what it is given,
  and the updater's relaunch passes nothing. A launch through `open` is part of checking a package by hand.
- Neutral: a copy of the bundle with its executable renamed would read as unpackaged (not measured), but its signature no
  longer holds, so it is no longer the app macOS trusts. A symlink does not, and neither does a helper executable run directly: measured, each still reads as packaged, and refuses.

## Sources

Spec: [mac-distribution](../specs/mac-distribution.md) mac-distribution::CON-008. Policy: electron-scaffold's
`electron-security.md` item 21 and `macos-signing.md` section 6.
