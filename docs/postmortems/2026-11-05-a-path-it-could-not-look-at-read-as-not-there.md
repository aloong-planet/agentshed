# A path it could not look at read as not there

**Date**: 2026-11-05 · **Surface**: the registry readers, the Instructions entries and Antigravity's directory-form subagents

## What happened

While making a failed registry read say so, the question came up of how else a registry could fail without reaching the
new code. `existsSync` answers false for a path behind a directory that cannot be entered: what it answers is whether it
could look, not whether the thing is there. With `~/.codex` at mode 000, which a `sudo` run can leave behind as a directory
only root may enter, its card read "Detected, 0 projects" with no explanation. An instruction file there read "None". An
Antigravity subagent in the directory form dropped out of the list, and a blocked `~/.gemini` made that side "Not
detected". Each of those reads already had a branch for a file that cannot be read, and the specs ask for it
(agents-overview A3 and REQ-004, project-detail REQ-002, subagents-view A8). None could reach it: the check in front had
already said absent.

## Why no test caught it

- Every "cannot be read" case built its state on the file itself: mode 000 on the file, or a directory where the file
  should be. Both leave `existsSync` true, so they drove the read's failure branch and looked like coverage of the read
  error. No case blocked the directory above the file.
- The promise was written where nothing checks it: the comment on `readInstructionFile` says a file that cannot be read
  keeps its path, directly above the check that decides otherwise for this one way of not being able to read it.

## What it settled

`isAbsent` (`src/main/providers/read-utils.ts`) answers true only for a path that is really not there, and the places that
promise a read error ask it: three registry readers, the Antigravity data root, `readInstructionFile` and the directory
form's `agent.md`. Each has a case with the directory at mode 000. The rule is an invariant in `AGENTS.md`.

The other `existsSync` sites were read one by one and stay, since no spec requires a read error there and most degrade the
same either way. Two stay for a reason worth knowing: `readClaudeActivity`'s guards a `readdirSync` with no catch, and
`skill-package.ts`'s containment check must fail closed on a root it cannot reach.

Later the same day the same answer turned out to call a live project stale, and the stale note told the user to have the
agent delete its records. So the rule also covers a place that tells the user something is gone and offers a way to remove
it, and the stale flag, an install's target and a plugin record's project now ask `isAbsent` too (projects-list A6). Three
sites still say something is missing for a path they could not look at, and stay, since none offers a removal:
`plugins.ts`'s install directory, and an install's source and an uninstall's target in `install.ts`.
