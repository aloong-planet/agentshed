# Document sync checklist — #235

Ticket: [#235 Every release carries the update ZIP and its metadata](https://github.com/aloong-planet/agentshed/issues/235) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Rewrite the spec's CON-002 Pending note once the adopted asset gates the ZIP | [mac-distribution spec](../../specs/mac-distribution.md) | Done: the asset at 070c4f2 gates the ZIP; CON-002 is present tense (the ZIP is not submitted itself, its gate is the asset's), the Pending note gone, no trace of the earlier state |
| Add the ZIP and the update metadata to the macOS signing runbook | [mac-signing runbook](../../ops/mac-signing.md) | Done: the two commands, the asset's checked settings and the declared provider (the stale "lint skips the two copies" and "its header does not list `dmg.sign`" gone), the ZIP and metadata values, checking the ZIP's app and the metadata by hand, the artifact and publishing bullets, the release note's download table (DMG only) |
| Write back where the implementation departed from or added to the spec, in the same change | [mac-distribution spec](../../specs/mac-distribution.md) | Done: Implementation Decisions (the packaging asset's requirements with the ZIP, the copies linted; the release feed declared for packaging; what the release carries, R2 DMG-only); Testing Decisions (the publish step's refusal) |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done: the row for #235 and zhoulf1006/skillshed#18 (2026-10-19), from the gateway, the mutations, the two local packagings and the verification run 39216743638 with its independent check |
| ADR-0032's consequence that the asset "does not gate today" the ZIP (found in the scope re-check below) | [ADR-0032](../../adr/0032-app-updates.md) | Done: a dated note under that consequence (the asset gates the ZIP since 070c4f2, adopted), the decision text left as it was |
| Link the verification run's evidence on zhoulf1006/skillshed#18 (its owed acceptance criterion 2) and close it, once this change is on main; carry the code review's outside finding O1 (the asset's header on provider detection) there or in a new skillshed issue, as the owner decides | [zhoulf1006/skillshed#18](https://github.com/zhoulf1006/skillshed/issues/18), [code review O1](ticket-235-review-code.md) | Done: merged as e13f4ae (#267) on the owner's confirmation of 2026-10-19; the evidence linked on zhoulf1006/skillshed#18 ([comment](https://github.com/zhoulf1006/skillshed/issues/18#issuecomment-6263064225)) and the issue closed; O1 became [zhoulf1006/skillshed#21](https://github.com/zhoulf1006/skillshed/issues/21), the owner's choice of 2026-10-19 (a new skillshed issue, since #18 closes) |
| Tick the issue's acceptance items this ticket's evidence supports, once the change is on main | [#235](https://github.com/aloong-planet/agentshed/issues/235) | Done: the seven items (three process, four product) ticked on 2026-10-19, each on the evidence it names; the merge noted on the issue ([comment](https://github.com/aloong-planet/agentshed/issues/235#issuecomment-6263081008)) |
| Record the merge and the pull request's CI runs in the checklist's #235 row, once the change is on main | [checklist](checklist.md) | Done: the #235 row names the merge (e13f4ae, whose tree is the pull request head def6711's) and the CI runs on the pull request and on main; the review table's CON-002 dependency row is resolved (this records change) |

Pre-delivery scope re-check (2026-10-19, on b51002e with the uncommitted change):

- **The facts this ticket changed**: every release carries the ZIP, its blockmap and the update metadata with the
  DMG; the packaging asset is 070c4f2 (the ZIP gate, `dmg.sign` checked by the asset itself, its lint findings
  fixed); the configuration declares the GitHub provider; the copies are linted; the publish step refuses an artifact
  without its update files; R2 is unchanged (DMGs only).
- **The search**: the repository with `rg --hidden --no-ignore` (excluded: `node_modules`, `.git`, `release/`, `out/`,
  the test and e2e outputs, the vendored prototype library, the working records — read as rows of this checklist and
  the coverage checklist — and the two asset copies, compared by `cmp`), for "zip", "latest-mac", "update metadata",
  "blockmap", "writeUpdateInfo", "gates DMGs only", "lint skips", "left out of the project's lint"; every hit
  outside this ticket's own changes read at its line.
- **Found beyond the planned rows**: ADR-0032's consequence (row added, done).
- **The remaining hits hold**: the release-cleanup hook's comment (it leaves `latest-mac.yml` and blockmaps alone);
  the NUL and language gates' binary handling of ZIPs; the update source's comment on Squirrel.Mac fetching the ZIP;
  ADR-0032's Context (the updater installs from a ZIP); the spec's REQ-001/AC-02, Failure B4 and Testing Decisions'
  evidence list; a session prototype's quoted conversation.
- **Pending notes in scope**: mac-distribution's header note (a notarized release downloadable) does not fall due
  with this ticket; CON-002's fell due and was resolved (row above).

Step 8 (`/features-catalog`) skipped by its two questions:

- **No sentence in `docs/features/` becomes untrue, and none is missing.** The catalogue describes what the app does
  with updates, not the files a release carries; distribution is outside it by its own rule, and the release line's
  entry is written with the first release (the spec header's Pending note).
- **The search**: the catalogue's languages counted first (Latin 43062, Han 7, the Han in `i18n.md` only); then
  `rg -n -i "zip|metadata|latest-mac|blockmap|download|github release|releases" docs/features` → `app-update.md`'s
  update behaviour (found, downloaded, installed; GitHub Releases as the feed; the disk-image boundary), the features
  index's line for it, and a drawer's "metadata" in `subagents-view.md` — none a statement about the release's files;
  and the Chinese terms for the same (archive, update package, metadata, download) → no output (exit 1).
- **Its control**: "download" matched 20 lines in `app-update.md` (`rg -c -i`). So the search did read the catalogue.

Merge-event scope re-check (2026-10-19, at e13f4ae):

- **The facts the event changed**: #235 is on main (e13f4ae, #267) and closed; zhoulf1006/skillshed#18 has its evidence
  and is closed; O1 has a home (zhoulf1006/skillshed#21).
- **The search**: `rg -n --hidden --no-ignore` over the repository (excluded: `node_modules`, `.git`, `release/`, `out/`,
  the evidence files, which are raw output) for "skillshed#18", "#235", "#267" and "update-zip" → 34 hits in 7 files,
  every one read at its line.
- **Found beyond the three rows**: the coverage checklist's review-table row on CON-002's dependency still said
  "Pending note in the spec" (resolved, as its neighbour on the download host was); the code review's O1 home (rewritten).
- **The remaining hits hold**: the tickets table (no status column); the coverage rows mapping units to #235; #233's
  records of its comment on #18 (a past fact); this ticket's records naming the branch it was built on.
- **skillshed's side**: its own document sync checklist for #18 has two Waiting rows this event fires (the evidence,
  and agentshed's outdated statements); they are skillshed's records, updated in a skillshed records change.
