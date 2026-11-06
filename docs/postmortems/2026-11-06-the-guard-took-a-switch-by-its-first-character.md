# The guard took a switch by its first character

**Date**: 2026-11-06 · **Surface**: launching a packaged build

## What happened

v0.1.0-beta.7 shipped the launch guard of ADR-0042, which refused a switch outside its allow-list. It decided what a switch was
by the argument's first character, a dash. Chromium decides differently: it trims whitespace from each argument first, and
reads what is left. So `--remote-debugging-port=0` after a space, or after a tab, got past the guard and opened the port on the
notarized build. The check of that release had passed every input it tried.

It came up while another project was being given the same guard: reading Chromium's `base/command_line.cc` for that project's
Windows build showed a slash starting a switch there, and a switch's name lowercased. A rule that differs by platform made the
first question "what else does it do before it reads a switch", and the answer was the trim.

## Why no test caught it

- The guard reproduced a reading of the command line it had never read. "One dash or two" was measured; what Chromium does
  before looking at the dash was not asked.
- The unit cases, the packaging check's inputs and the spec's failure list were all written from that same picture of a
  switch, so they agreed with each other and with the guard. Each was a list of switches, and none was an argument shaped
  some other way that Chromium would still read as one.
- The check launched the real package, which is the right place, but only with the inputs that picture produced.

## What it settled

The guard no longer reads the command line at all: it compares each argument, as given, with the exact spellings it accepts,
and refuses everything else, an argument with no dash included (ADR-0042, amended; mac-distribution::CON-008). Variable names
are compared in any case, for the same reason. The packaging check now launches the built app with the switch after a space,
so a guard that takes a switch by its first character fails packaging. electron-scaffold's rule says to compare whole
arguments and gives the platform differences, and a new packaging platform is now one of the times to go through the checklist
again.
