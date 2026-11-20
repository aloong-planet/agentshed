# A copy that kept the links below its entry

**Date**: 2026-11-20 · **Surface**: the skill install (`src/main/providers/install.ts`) and the skills view's package
walk (`src/main/providers/skill-package.ts`)

## What happened

Installing a skill copied it with `cpSync(source, target, { recursive: true, dereference: true })`. Under Electron 43's
Node 24.18, `dereference` resolves only the source itself and copies every link below it as a link, so a project's copy
of a skill holding a nested link wrote through into the global library or wherever the link led (measured: nested file
and directory links kept, and writing into the copy changed the original).

The walk written to replace it compared directories by their real paths, to stop at a link back into the skill. The
independent review found that a real path does not reduce every spelling of one directory to one: on a volume that
ignores letter case, or through the firmlink `/System/Volumes/Data`, a link back spelled another way was entered and
copied again, and the notice named a deeper path. The skills view's package walk, built on the same comparison, listed
a package's files twice for such a link. The re-review then found the directories holding the landing and the library
entry gathered along their paths as written: with a link on the way (a project's `.claude`, a project path that is
itself a link, a linked library directory) a link to the real holder got through, and a project inside the skill had
its skills directory made inside the global library before it was refused.

## Why nothing caught it

- The install's only link case linked the skill's own entry, which `dereference` does resolve.
- What `cpSync` does with a nested link depends on the Node it runs on: Node 22, 24 and 26.7 keep it, Node 26.13
  dereferences it (measured 2026-11-20). The machine the fix was written on ran its unit tests on 26.13, so a unit case
  for the nested link was green there on the unfixed code; CI's Node 22 would have shown it red, had there been one.
- Every link case spelled its target as its real path, and no fixture's project or library path held a link, so
  comparing paths and comparing identities agreed in all of them.

## What was done

- The install walks the skill itself, landing each file and directory a link leads to, and fails on a link that leads
  nowhere or back, naming it (skill-install::REQ-004).
- Both walks tell directories apart by device and inode. The install gathers the directories holding the skill, its
  library entry and the landing along both the written path and where it really leads, and refuses a project inside
  the skill before writing anything.
- An e2e case installs a skill holding nested links under the app's own Node; unit cases cover links spelled in another
  letter case (where the volume ignores it), relative link targets as the library's entries have, and links on the
  project's and the library's own paths.

## The rule to carry forward

**A test of how a file-system call treats links runs on the Node the app runs on**, since the answer changes between
Node versions; and **a walk that must not re-enter a directory tells directories apart by identity, not by path**,
gathering the holders of what it guards along where their paths really lead.
