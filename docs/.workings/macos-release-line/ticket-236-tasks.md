# Ticket #236 — task list

Mirror formal releases to R2 behind the download host. Working record, not a requirement authority (the spec is
`docs/specs/mac-distribution.md`). Checkpoints are what proves each step done.

Done in the same session as #234, on the owner's instruction of 2026-10-19. Prerequisites, checked 2026-10-19
against `aloong-planet/infra` (`stacks/apps/README.md`, `release-mirrors.tf`, `modules/release-mirror/main.tf`):
the bucket `agentshed-releases`, its writer token, the CORS rule (GET from `https://agentshed.aloongplanet.com`,
max-age 3600) and the custom domain `dl.agentshed.aloongplanet.com` (TLS 1.2+) exist through Terraform; the four
`R2_*` secrets are in this repository (2026-10-17); the host's certificate was checked from outside Cloudflare on
2026-10-17 (Google Trust Services, valid until 2027-01-15), so ADR-0031's fallback host is not used.

Decisions taken here, each derived from the spec (no new requirement):

- **Layout and pointer follow Transfer's** (spec Implementation Decisions): files at `releases/v<version>/<file>`,
  the pointer `latest.json` at the bucket's root. The pointer departs from Transfer's in one way the spec requires:
  each file carries its download URL (mac-distribution::REQ-004/AC-02). Shape:
  `{ "version": "0.2.0", "files": [{ "name": …, "arch": "arm64", "size": …, "url": "https://dl.agentshed.aloongplanet.com/releases/v0.2.0/…" }] }`.
  This is the contract #238 reads.
- **Uploads use the runner's aws-cli with Transfer's settings** (cache headers: the DMGs `public, max-age=31536000,
  immutable`, the pointer `public, max-age=300`). Observed working against R2 on Transfer's v1.2.1 (2026-08-22): its
  `latest.json` (single PUT, `application/json`, `max-age=300`) and its DMG (multipart, ETag with `-12`,
  `application/x-apple-diskimage`, immutable) are served with those headers today.
- **Reachability** (REQ-003, policy §8): every mirrored file is fetched through the download host and its size and
  sha256 compared with the gated file before the pointer is written; a missing or different file fails the job.
- **Two jobs**: `mirror` needs the gate and publish jobs (the GitHub release goes up first, Failure C1); `pointer`
  needs the gate and mirror jobs. Both run only for formal tags, by their own condition on the real event and ref.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | CORS measured with both origins (REQ-004/AC-03) | evidence/ticket-236/cors.txt | done: GET and preflight from the landing origin allowed (GET only), another origin refused; the pointer absent (404) |
| 2 | Test design review | `ticket-236-review-tests.md`, design section | done |
| 3 | Shared artifact reading for publish and mirror | publish tests still green | done: `scripts/lib/release-artifact.mjs`; the publish step's 16 cases unchanged and green |
| 4 | `scripts/mirror-release.mjs`: upload, pointer, adapters, entry point | its tests red then green | done: 11 cases; M7 green on first run, proven by mutation |
| 5 | `release.yml`: mirror and pointer jobs; the static test extended | `scripts/release-workflow.test.mjs` red then green | done: 16 cases; actionlint 0; 22 mutations caught (evidence/ticket-236/mutations.txt) |
| 6 | Full verification gateway | `pnpm verify` exit 0 | done once before the review; rerun on the final tree, result in the checklist's Current verification |
| 7 | Step 5 `/review-code`, step 6 `/review-tests`, spec final check, step 7, step 8 | records | done: `ticket-236-review-code.md`, `ticket-236-review-tests.md`, the two sections below, step 8 in `ticket-236-doc-sync.md` |
| 8 | R2 runbook, ADR-0031, the specs' host notes, checklist, doc sync, the issue, PR; stop for the owner | PR link | pending |

## Spec final check (2026-10-19, code read against the spec on the uncommitted tree)

Each unit #236 delivers, against the spec's text:

- **US-002/AC-01** ("copies the files to R2, and updates the latest pointer last"): the mirror needs publish, the
  pointer needs the mirror (W2). Real run Waiting.
- **US-002/AC-02** ("touches neither R2 nor the latest pointer"), **CON-004**, **Failure C5**: both jobs' condition
  excludes `-` tags (W1), and the script refuses a pre-release tag (M6).
- **US-002/AC-03** ("no mirrored file and no pointer change" when a gate fails): both need the gate job under the
  implicit success (W2).
- **US-002/AC-04**, **REQ-002/AC-02**, **Failure C4** ("a manual run cannot reach them under any input"): the
  condition reads the real event; dispatches on a tag and pull requests evaluate false (W1).
- **REQ-002/AC-03**: W1, W2.
- **REQ-003** ("rewritten only after every mirrored file has been checked reachable at its R2 URL, file by file"):
  every file is read through the download host and compared by size and sha256 before `latest.json` (M2–M5).
- **REQ-004/AC-01** ("one directory per version, under the custom download host"): `releases/v<version>/` (M1),
  the host (W5). The bucket's name comes from `R2_BUCKET`, written by Terraform as `agentshed-releases`. Real run
  Waiting.
- **REQ-004/AC-02** ("names the current formal version and its download URLs"): M2. Real run Waiting.
- **REQ-004/AC-03**: measured, `evidence/ticket-236/cors.txt` and the runbook.
- **CON-003** (R2): W3.
- **CON-006** (R2): W4 and the review's security layer. The run logs come with the first formal release.
- **Failures C1, C2**: M7 with W2; M3, M4.
- **Failure C3** (the mirror): a whole re-run stops at publish (#234's cases); re-running failed jobs reuses the
  run's artifact.

- **Nothing missing.**
- **Scope beyond the spec**: the shared artifact reading, which serves REQ-004 (the mirror reads what publishing
  read), and the retry with its pause, an implementation detail of REQ-003.
- **No departure.**

## Step 7

- **ADR**: ADR-0031 promoted from Proposed to Accepted, with its evidence appended. No new decision: the layout,
  the pointer and the two jobs follow the spec.
- **CONTEXT.md**: no new term. "Download host", "latest pointer" and "formal release" are the specs' own terms,
  used unchanged; CONTEXT.md holds the app's vocabulary.
- **Retrospective**: none. No pitfall here meets the three conditions. The TLS retry for large downloads is
  recorded in memory, outside the repository.
