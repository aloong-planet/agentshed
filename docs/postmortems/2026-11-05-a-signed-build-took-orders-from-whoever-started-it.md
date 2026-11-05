# A signed build took orders from whoever started it

**Date**: 2026-11-05 · **Surface**: launching a packaged build

## What happened

While checking a fix on the notarized v0.1.0-beta.6, the build was started with `--remote-debugging-port` to drive it, and it
opened the port. The check worked, and that was the finding: the fuses had been read as closing this. Trying a few more inputs
found worse. `--gpu-launcher` ran the program it named, and `ELECTRON_RENDERER_URL` loaded a page of the launcher's choosing in
the window, with the preload's whole API (the table is in ADR-0042). Whatever the user had granted the app, code arriving
this way held too.

## Why no test caught it

- Every e2e case runs from source, where the development URL and the seams are meant to work. A package was only ever launched
  with nothing unusual, so nothing asked what it does with an input it should refuse.
- The checklist's fuse item reads the binary, which is the right test for a fuse and says nothing of what Chromium accepts. The
  release's gates ask the same kind of question: is it signed, stapled, fused. None starts the app.
- A comment recorded the belief as fact: `electron-builder.yml` said the fuses stop injection "through a debug port". They close
  Node's inspector. Nobody had tried the other.
- The how-to this project's setup came from teaches reading the development URL with no check that the build is unpackaged, and
  the code followed it.

## What it settled

A packaged build refuses any switch outside an allow-list and any seam variable before anything loads (ADR-0042,
mac-distribution::CON-008). An allow-list, because a deny-list would have stopped at the switch that started this.

The packaging asset now launches the built app with inputs it must refuse and with only its settings directory, so this holds on
the real package at every packaging. The rule and the check live in electron-scaffold, so a project using the asset cannot ship
this door, and the how-to's samples say what makes them safe.
