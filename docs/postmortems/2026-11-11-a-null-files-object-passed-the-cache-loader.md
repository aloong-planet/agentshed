# A null files object passed the cache loader

**Date**: 2026-11-11 · **Surface**: the token cache file (`token-cache.json`), as the engine loads it

## What happened

The loader takes a file for this build's cache when its version matches and `typeof files === 'object'`. `null` is an
object to `typeof`, so a file reading `{"version":<current>,"files":null}` was taken as valid, and the first lookup of a
session file in it threw a TypeError. That is the whole scan failing, on every launch, until the file is deleted — the
escape C2 exists to prevent. Found while changing when a build writes the file: the new code counted the entries the
cache held and would have thrown on the same file with no session file to look up at all. No such file is known to have
been written; the engine never writes one.

## Why no test caught it

- The garbage-cache case (C2) seeds a file of another version, which the version check turns down before `files` is
  looked at. No case seeded a file of the current version whose `files` is not an object of entries.
- The postmortem of 2026-10-29 enumerated every reader of a cached entry and put the entry guard first in each; its cases
  wrote a `null` entry and a `null` agg. The container those entries sit in is checked once, in the loader, and the
  loader was not among the readers enumerated.

## What it settled

The loader refuses a `files` that is `null`, and the file is then recomputed like any other garbage. One case seeds the
current version with `files` as `null`, as an array and as a string, and builds twice against each: once with no
session file and once with one, the file seeded again before the second build so that each build meets it. Against the
code before the fix the `null` row fails with the TypeError at the lookup.

## What remains

The same as on 2026-10-29: each level of the file is guarded where it is read, by whoever thought of it. A single
accessor that hands back a well-formed entry or nothing, over a `files` it has checked, would close the class.
