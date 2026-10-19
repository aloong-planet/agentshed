# Document sync checklist — #236

Ticket: [#236 Mirror formal releases to R2 behind the download host](https://github.com/aloong-planet/agentshed/issues/236) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the R2 runbook: bucket, token, CORS, layout, pointer, re-running the mirror | [r2-setup](../../ops/r2-setup.md) (new) | Done: what exists and where Terraform manages it, the layout and the pointer's shape, the two jobs, failures and re-runs, checking by hand, the CORS measurement, what is not yet observed. The signing runbook's CI section points to it |
| After the certificate check: ADR-0031's status, the spec's download-host Pending note, the landing spec's host note, and every other place that says the host is undecided | [ADR-0031](../../adr/0031-macos-release-line.md), [ADR index](../../adr/README.md), [mac-distribution spec](../../specs/mac-distribution.md), [landing-page spec](../../specs/landing-page.md), [landing prototype](../../prototypes/landing-page/prototype-landing.html), [checklist](checklist.md) | Done: ADR-0031 Accepted with its evidence appended (the check of 2026-10-17, recorded in the infrastructure repository); the index row; the spec's note now plain text, its header and Further Notes no longer call ADR-0031 Proposed; the landing spec's last note names the host and the pointer; the prototype's comment and (f) note (handed over by the session doing #237, which confirmed by a trial merge that #255 still merges); the checklist's source row and audit row on the host |
| Record the real-run evidence of the mirror and the pointer | [checklist](checklist.md), [r2-setup](../../ops/r2-setup.md) | Waiting: the first formal release; whoever cuts it keeps the pointer job's log (one line per file read back) as the evidence and records it here and in the checklist's Current verification |
| Write back where the implementation departed from or added to the spec | [mac-distribution spec](../../specs/mac-distribution.md) | Done: Implementation Decisions (the layout, the pointer's shape and its departure from Transfer's by carrying URLs, the mirror needing the publish job, the read-back before the pointer, the resources managed with Terraform); Testing Decisions (the mirror and pointer seams) |
| Mention the mirror and pointer in the signing runbook's CI section | [mac-signing](../../ops/mac-signing.md) | Done: the jobs, and the formal tier's row |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done: the #236 row (2026-10-19), from the gateway on the final tree, the mutations and the CORS measurement; the real run stays Waiting there |
| Tick the issue's acceptance items this ticket's evidence supports, once the change is on main | [#236](https://github.com/aloong-planet/agentshed/issues/236) | Waiting: the merge of this ticket's pull request, which the owner confirms; the session that delivers #236 ticks every item backed by a test or by evidence already taken, and annotates the rest with their trigger (US-002/AC-01, REQ-003, REQ-004/AC-01 and AC-02 wait for the first formal release; CON-006's run logs for the R2 steps likewise), as #234 did |

Pre-delivery scope re-check (2026-10-19, on 0a5ad4d with the uncommitted change):

- **The facts this ticket changed**: the download host is settled and ADR-0031 Accepted; R2 holds formal releases
  under `releases/v<version>/` with `latest.json` in a defined shape; two new jobs; the R2 runbook; the artifact
  reading shared between publish and mirror.
- **The search**: the whole repository with `rg --hidden --no-ignore` (git-ignored working records included;
  excluded: `node_modules`, `.git`, `release/`, `out/`, the lockfile), for "dl-agentshed", "still being decided",
  "download host", "latest pointer", "latest.json", the runbook's name, "mirror job", "pointer job", "Proposed",
  the certificate check's wording and the R2 secret names. 164 hits, every hit outside this ticket's own new files
  read.
- **Found beyond the planned rows**:
  - the ADR index;
  - the spec's header and Further Notes;
  - the prototype's two lines;
  - the checklist's source and audit rows on the host.

  The remaining hits hold: the specs' REQ-002–004 and Failure C1 wording, ADR-0031's Context and Consequences,
  other ADRs' "Proposed" in their own history.

Step 8 (`/features-catalog`) skipped by its two questions:

- **No sentence in `docs/features/` becomes untrue, and none is missing.** No feature statement mentions R2, the
  mirror, the download host or `latest.json`, and the release line's feature entry is written with the first
  release (the spec header's Pending note).
- **The search**: `grep -rniE "r2|mirror|download host|latest\.json|dl\.agentshed|cloudflare" docs/features/
  README*.md` → no output (exit 1).
- **Its control**: "agentshed" in 9 of those files, "release" 5 times in `app-update.md`. So the search did read
  them.
