# A new field would have dropped every saved project page

**Date**: 2026-10-21 · **Surface**: the display cache's saved project details (ADR-0029), after an update

## What happened

The memory drawer needed the project's main memory file on the project's read list, so the project detail gained a
field: the main file's entry. The live contract was extended to require it. The spec then said that a project detail
saved by an earlier version, without the field, "degrades to not listed until the live read replaces it". It did not:
restoring a saved read runs the same live contract, so every saved project detail would have failed it and been
dropped. After the update, each project the user had viewed would have opened with a wait instead of its last page —
the upgrade case ADR-0029 exists for. Found in code review before it shipped; nothing reached a user.

## Why no test caught it

- No test restored data saved by the previous version. Every saved-data test wrote its cache with the current code,
  so the old shape never reached the restore path.
- The spec's sentence came from reasoning about the renderer (an absent field reads as "none") and missed the
  validation in front of it. The restore path's checks sit in a different module from the type the field was added to.
- The real cache on this machine held the old shape; nobody looked at it until the review asked what a saved detail
  looks like today.

## What it settled

A saved project detail with no main-file entry is given an empty one before validation, so it restores and lists no
main file until the live read replaces it; a present but malformed entry is still dropped. A test writes a cache in
the shape the installed app's own cache holds and restores it. CONTEXT's display-copy invariant now carries the rule.

## The rule to carry forward

**A field added to a type the display cache saves is filled in on restore when absent, or the update drops every
saved entry of that type.** The test for it writes the previous version's shape — taken from a real saved cache, not
from the current type.
