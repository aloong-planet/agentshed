# An older build stopped on a newer build's side

**Date**: 2026-10-30 · **Surface**: the usage archive and the display copy, read by an installed 0.1.0-beta.2

## What happened

The installed 0.1.0-beta.2 showed the first-scan skeleton ("Scanning the agent sides…") and never left it, for as long
as it ran. A development run of the main branch, which had gained the Antigravity CLI side, uses the same user-data
directory as the installed copy (app-update spec, Implementation Decisions); its scans had archived two usage rows of
that side. beta.2 admitted every archive row whose day and total were well formed, whatever its side, and its figure
derivation looked each row's side up among the sides it knows: the lookup found nothing, and every scan threw
`Cannot read properties of undefined (reading 'input')` in `deriveStats`. The saved display copy, written by the newer
build, named the side in its values and failed the contract, so no restored snapshot stood in either. With every scan
failing and nothing restored, the skeleton stayed (agents-overview A4d). Diagnosed by running a build of the release's
commit against a copy of the user's data files; removing the two rows alone let it load in about three seconds.

The same reading found a latent case: an archive whose format version is above the build's was treated as corrupt —
degraded to empty and overwritten at the next scan, losing the newer build's history.

## Why no test caught it

- No test ever gave a build persisted data naming a side outside its set. The opposite direction — data saved before a
  side existed, read by the build that added it — had a rule and tests (the 2026-10-21 postmortem); data a newer build
  wrote had neither.
- The archive's reader validated only the fields the conflict rule uses. Inside the process every row's side is typed,
  so the derivation never had a reason to doubt one; the file was the one untyped entrance.
- Every e2e case starts from a fresh user-data directory written by the build under test, so a file from another
  build never reached the startup scan.

## What it settled

token-stats::REQ-005, token-stats::REQ-006 and agents-overview::REQ-005: archive rows of a side the build does not know
are held apart — out of every figure and archived-only day, written back as read; an archive of a newer format is
neither read nor written; the display copy's records keyed by side lose such a side's keys before the contract check.
Tests seed the files at the boundary another build writes them, under a side name generated to be outside the set, so
a side added later cannot make a case meaningless; an e2e case reproduces the stuck skeleton on the unfixed build and
loads on the fixed one.

## The rule to carry forward

**Read a file in the user-data directory as possibly written by a newer build.** Its side names and format version are
data, not this build's types: hold what this build does not know apart and keep it intact, and never let it reach code
that indexes by side. A test for it writes what a newer build would write — a side outside the set, a version above
this one — not what the current code writes.
