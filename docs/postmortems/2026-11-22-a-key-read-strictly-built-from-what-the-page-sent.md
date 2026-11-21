# A key read strictly, built from what the page sent

**Date**: 2026-11-22 · **Surface**: the read registry's retirement passes (`retireAfterScan`, `retireAfterDetail`) and
the package listing's guard (`listSkillFilesArgs`)

## What happened

#521 changed both retirement passes to judge each registration by its owner instead of its saved read. One restored
without its read then goes by the same rules.

A package listing's owner is its saved-read key: `savedReadKey` of the listing's arguments. The key always holds both
the project path and the plugin root, with `null` for whichever is absent. The passes read that key strictly: it must
hold one path, the one its scope takes. Any other key is an owner this build does not read. The scan retires such an
owner, and a page's read leaves it alone.

The independent review found that this build registered keys of the other kind live. `listSkillFilesArgs` checked that
the path a scope needs is a string, then returned the page's object as sent. A listing sent with a path its scope does
not take, such as a plugin package with a project path, therefore registered its files under a key the passes could
not read. Two things followed:
- A project page's read left the listing's files readable after the plugin root was gone. The code before the change
  had retired them.
- Every scan retired the listing, even while its root was held.

Only a page sending a field the app's own renderer never sends could reach this, and the stale permission lasted until
the next scan. It was caught before merging.

## Root cause

The strict read of the key assumed that every key this build writes belongs to exactly one listing. But the key is
built from the guard's result, and the guard passed on the object it was given. Whatever it did not check, it did not
drop.

## Why no test caught it

- **The change stated the assumption as a negative claim, and pinned it the wrong way round.**
  - Ledger item 25 said a key that is not exactly one listing's is retired "since nothing in this build registers it
    again".
  - A unit row, "a listing key with a path its scope does not take", asserted that the page's pass leaves such a key
    alone.
  - Both rested on the renderer's builders (`SkillExpandBlock`, `PluginSkillList`), which send exactly one path. They
    did not rest on the guard, which decides what reaches the key.
- **The guard's cases sent only canonical arguments, compared with `toEqual`.** A result carrying a field the guard
  never looked at passed them.

## What it settled

- **The guard rebuilds its result.** `listSkillFilesArgs` now returns side, name, scope and only the path its scope
  takes, built from what it checked, as `sessionTurnArgs` and `installSkillArgs` already did.
- **Its case sends a stray path.** Each scope is sent with and without one, and compared with `toStrictEqual`. The case
  failed on the guard that passed its argument on.
- **No other reader relied on the stray field.** A typecheck with the arguments narrowed per scope found the two
  readers of a path their scope does not take: the key, and the container check for a global package's root.
- **Every guard returns a value rebuilt from what it checked.** #538 brought `searchSessionsArgs` and
  `uninstallSkillArgs` in line, and `installSkillArgs` now checks and passes on its own copy of the sides list. The one
  exception is the preference setters' pass-through, whose setters refuse an object or an array. `ipc-guards.test.ts`
  sends each guard that takes an object a stray field at every level, sends each that takes a primitive that primitive in
  an array and in an object, and fails on a guard with no row saying what it takes; AGENTS.md states the rule under
  Engineering.
