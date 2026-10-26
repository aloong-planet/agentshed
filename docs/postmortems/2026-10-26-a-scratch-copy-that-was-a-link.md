# A scratch copy that was a link

**Date**: 2026-10-26 · **Surface**: the shared-UI gate's test (`scripts/check-shared-ui.test.mjs`) and the scratch
trees built around it

## What happened

The gate's test runs the gate on a temporary tree: real copies of `docs/prototypes/` and `src/`, symbolic links to
everything else, and planted faults written into the copies. When its plants became keyed by their path from the
root, a plant could name a linked path, and the harness would have written the repository through the link. The
code review found this before any plant did so.

Showing it meant running the test in a scratch tree with one plant under a linked directory. That scratch tree
linked `docs/prototypes/` and `src/` themselves. The harness's `cpSync` copied each link as a link, so its "copies"
were the worktree's own directories, and that run's plants were written into the worktree, in fifteen files: ten
pages, a shared stylesheet and an app source file changed, one file deleted, two added. The test still passed. The guard
added next refused exactly that tree on its first plant, which is how the damage was found. Every affected file was
compared with the committed version plus its plant, found equal, and restored byte for byte; nothing else had changed.

## Why nothing caught it

`cpSync(src, dst, { recursive: true })` does not follow a link that is `src` itself (`dereference` defaults to
false): it recreates the link. A link on an intermediate component (`X/docs` pointing at a real `docs`) is resolved by
the operating system and is safe, which is why earlier scratch trees, built that way, had been harmless. Nothing in
the harness checked where a write would land, and a passing test looks the same whether its plants hit the copy or
the repository.

## What was done

- The test refuses any plant or file change whose path does not resolve, with `realpathSync`, inside the temporary
  tree. A probe under a linked directory lands through the link without the guard and is refused with it.
- Scratch trees for running the test hold real copies of what the harness copies, and the worktree's status is
  checked after every scratch run.

## The rule to carry forward

**A harness that writes into a tree assembled from links must check where each write resolves before it writes**,
and so must whoever assembles a tree around it: a link where a copy was meant turns every planted fault into a real
one, and a green run does not say which happened.
