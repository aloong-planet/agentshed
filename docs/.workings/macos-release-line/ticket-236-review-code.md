# Code review — ticket #236

Ticket: [#236 Mirror formal releases to R2 behind the download host](https://github.com/aloong-planet/agentshed/issues/236)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

- Date: 2026-10-19
- Version: branch `feat/r2-mirror` on 0a5ad4d, uncommitted working tree
- Scope: the `mirror` and `pointer` jobs and the workflow-level `DOWNLOAD_HOST` in `.github/workflows/release.yml`;
  `scripts/mirror-release.mjs` and its tests; `scripts/lib/release-artifact.mjs` (the artifact reading moved out of
  `scripts/publish-release.mjs`); the extended `scripts/release-workflow.test.mjs`; `package.json`'s `test:scripts`

## Underlying premises

- **aws-cli's default settings work against R2**, for a single PUT and for a multipart upload. Observed rather than
  read: Transfer's sync job uploaded v1.2.1 with the same command on 2026-08-22, and the host serves its
  `latest.json` (ETag without a part count, `application/json`, `max-age=300`) and its DMG (ETag `…-12`,
  `application/x-apple-diskimage`, immutable) today.
  - Cloudflare's S3-compatibility table lists CRC32 for multipart uploads only, while aws-cli 2.23+ adds CRC32 to
    every upload; that Transfer's single PUT went through says R2 accepts it.
  - The runner's aws-cli may have moved since August. If it fails, the mirror job fails, and the pointer is left
    as it was (Failure C1). Stated in the runbook's "Not yet observed".
- **The artifact downloads as `<version>/<files>`**: observed on #234's runs, and the shared reading
  (`releaseFiles`) is the one #234's publish step already uses.
- **The download host serves an object as soon as it is uploaded.** R2 is strongly consistent, and an
  unversioned 404 is not cached (`cf-cache-status: DYNAMIC` on the measured 404s). The pointer job still reads up
  to three times, ten seconds apart, before it gives up.
- **A re-run of the failed jobs downloads the gate job's artifact of the earlier attempt.** Not observed here: no
  re-run of a failed mirror has happened. If the artifact cannot be downloaded, the download step fails, the
  pointer is left as it was, and the runbook's re-run advice does not hold; the first failed mirror will show it.
- **The host and the CORS rule**: read from `aloong-planet/infra` (`release-mirrors.tf`, the module) and measured
  (evidence/ticket-236/cors.txt).
- **Comments that state causes**, each checked:
  - "upload-artifact roots it at release/": observed;
  - "fails rather than skips": CON-003, a design statement;
  - "the pointer moves with every formal release, so it is cached briefly": the headers chosen, Transfer's;
  - "a version's URL never changes content": the publish step refuses a published tag, so no second build is
    mirrored under it.

Finding: none in this layer.

## Runnability

- `pnpm test:scripts`: 98 of 98 (the asset's 51; the tag check 4; the publish step 16; the mirror 11; the workflow
  16). `pnpm lint` and actionlint (shown able to fail on #234) pass.
- **Paths through the two jobs:**
  - A missing R2 secret fails each job at its first step, before checkout.
  - The mirror needs the publish job, so it never runs after a refused or failed publish.
  - A failed upload fails the mirror job, and the pointer job, which needs it, is skipped.
  - In the pointer job, a file not served, or served with other bytes, fails the job before `latest.json` is
    written.
  - Escape surface: each path fails its own run and leaves the previous pointer, which is the state the landing
    page already handles (landing-page Failure A3).
- **Re-runs:**
  - "Re-run failed jobs" repeats the mirror with the same artifact, then the pointer.
  - A re-run of the whole workflow stops at publish for a tag already public (#234), so no second build reaches
    R2 (Failure C3).
- **Found and changed during the review**: the pointer took the arch from the name by assuming the prefix
  `Agentshed-<version>-mac-`, while the shared check only guarantees that the name contains `-<version>-mac-`. It
  now reads the arch after that same marker. No behaviour change for today's names; the mirror tests still pass.
- **Also corrected, while checking the staged diff**: the pointer job's comment said re-running it after a failed
  mirror finishes the release. A failed mirror skips the pointer, so it cannot be re-run alone. It is the failed
  jobs that are re-run, the pointer with them. Only the comment changed.
- **Not run here: R2, the host's serving of new objects, the runner's aws-cli.** No manual run can reach these
  jobs (W1). Their first run is the first formal release, Waiting in #236 and in the runbook.

## Security

- **The four R2 secrets** reach only the upload step and the pointer step, each variable holding its one secret
  (W4); the job-level booleans only compare. aws-cli reads the keys from the environment, and the script prints
  aws-cli's output on failure, never its arguments (there are no secrets in them) or its environment.
- **The writer token** can read, write and list objects in this bucket only (Terraform, infra's module).
- **The tag**, used in object keys and URLs, has passed the gate job's tag check (a semver version), because both
  jobs need the gate job.
- **The pointer** carries only the version, names, sizes and URLs under the download host, all derived from the
  gated artifact — what landing-page Failure E1 expects to validate.
- **CORS** allows GET from the landing page's origin only (measured).

## Consistency

- The job names follow the existing lower-case style; neither collides with a required check. Both jobs use the
  pinned actions of the rest of the file (S10 holds).
- The artifact reading moved to `scripts/lib/`, next to `working-language.mjs`, so the publish and mirror steps
  cannot drift apart on what counts as this version's artifact.
- The runbook follows `mac-signing.md`'s form: this project's values, the policy cited.
- **Smells**: the test helper `artifactDir` exists in both the publish and the mirror test files (five lines).
  Kept: each test file stays self-contained, and a shared test module for five lines would be the larger change.

## Findings outside this change

| Finding | Impact | Suggested | Destination |
|---|---|---|---|
| The landing prototype's comment (line 231) and its (f) note (line 438) still said the download host was undecided | A reader of the prototype would think the host could still change | Updated here, since #236 settled the host; the session doing #237 confirmed by a trial merge that #255 still merges cleanly | Done in this change (doc sync) |

## Conclusion

No bug found. One robustness change made in review: the arch is read the way the shared check reads names. Open:
R2 itself, at the first formal release.
