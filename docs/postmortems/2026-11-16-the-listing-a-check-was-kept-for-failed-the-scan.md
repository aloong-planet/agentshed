# The listing a check was kept for failed the whole scan

**Date**: 2026-11-16 · **Surface**: the projects list's Claude Code activity (`readClaudeActivity`)

## What happened

While a session directory the scan cannot list was made to keep the files the token store holds (#450), the second
independent review ran a scan through `Scanner.scan` with a registered project's Claude Code directory at mode 300 (it
can be entered, not listed), then at 000. Both scans failed with EACCES. Before the token build, the projects list reads
each project's Claude Code activity, and `readClaudeActivity` listed the project's encoded directory with `readdirSync`
behind an `existsSync` check and outside any try. `existsSync` is true for a directory that is there, so the listing ran
and threw out of the whole scan. The build never ran, and the window silently kept the last snapshot (token-stats E3).
The change's acceptance for a project's directory held for `TokenEngine.build`, and not in the app.

## Why no test caught it

- The token build's cases for a directory it cannot list call `TokenEngine.build`, which never runs the projects list's
  reads. The one case through `Scanner.scan` locked a Codex day's directory and Antigravity CLI's conversations, whose
  listings are the engine module's and fail only their own directory.
- The 2026-11-05 sweep read this site and kept its `existsSync`, since it "guards a `readdirSync` with no catch"
  ([2026-11-05](2026-11-05-a-path-it-could-not-look-at-read-as-not-there.md)). That guard stops a directory that is not
  there, and one behind a directory that cannot be entered. A directory that is there but cannot be listed passes it to
  the listing. The sweep's cases blocked the directory above, at mode 000, where the guard answers false and nothing
  throws.

## What it settled

`readClaudeActivity` tries its listing: a directory that is not there, or cannot be listed, gives that project's Claude
Code activity nothing, and the scan goes on (`AGENTS.md`, a failure reading one entry). No absence is decided there any
more. `scanner.test.ts` runs scans through `Scanner.scan` with each side's session directory and Claude Code's projects
directory at 300 and at 000, and asserts the rows, the sessions and the row's session count and time (projects-list
B10).
