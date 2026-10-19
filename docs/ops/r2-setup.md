# R2 mirror · this project's runbook

This runbook holds **Agentshed's own values and steps** for the R2 mirror of formal releases. The rules — mirror
and pointer on formal releases only, the pointer moved last and only after every file is reachable — are
electron-scaffold's `macos-signing.md` §5 and §8, cited here and not copied. Decisions: ADR-0031. Requirements:
`docs/specs/mac-distribution.md` (REQ-003, REQ-004). The release workflow as a whole: `docs/ops/mac-signing.md`, "CI".

## What exists, and where it is managed

Every resource below is managed with Terraform in the public repository
[`aloong-planet/infra`](https://github.com/aloong-planet/infra), stack `apps` (`stacks/apps/release-mirrors.tf`, module
`modules/release-mirror`). A change goes through a pull request there; one made by hand is overwritten by the next
apply.

| What | Value |
|---|---|
| Bucket | `agentshed-releases`, standard storage, kept apart from Transfer's (ADR-0031 option 5) |
| Download host | `https://dl.agentshed.aloongplanet.com`, the bucket's custom domain, TLS 1.2 or later |
| Certificate | Checked from outside Cloudflare on 2026-10-17: issued by Google Trust Services, valid until 2027-01-15, the host in its SAN, hostname verification passing; ADR-0031's fallback host is not used |
| CORS | `GET` only, from `https://agentshed.aloongplanet.com` only, preflight cached 3600 s |
| Writer token | `agentshed-releases-writer`: object read, write and list in this bucket, nothing else |
| Repository secrets | `R2_ACCOUNT_ID`; `R2_ACCESS_KEY_ID` (the token's ID); `R2_SECRET_ACCESS_KEY` (the lowercase hex SHA-256 of the token's value); `R2_BUCKET`. Written by Terraform; the S3 endpoint is `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto` |

## Layout

| Object | Content type | Cache-Control |
|---|---|---|
| `releases/v<version>/Agentshed-<version>-mac-<arch>.dmg` | `application/x-apple-diskimage` | `public, max-age=31536000, immutable`: a version's URL never changes content |
| `latest.json` | `application/json` | `public, max-age=300`: it moves with every formal release |

`latest.json` is what the landing page reads (mac-distribution::REQ-004/AC-02, landing-page::REQ-001):

```json
{
  "version": "0.2.0",
  "files": [
    {
      "name": "Agentshed-0.2.0-mac-arm64.dmg",
      "arch": "arm64",
      "size": 127807045,
      "url": "https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg"
    }
  ]
}
```

The layout and the cache headers follow Transfer's mirror. The pointer departs from Transfer's in carrying each
file's URL. Until the first formal release there is no `latest.json`, and reading it gives 404.

## How a formal release reaches it

Two jobs of `.github/workflows/release.yml` run `scripts/mirror-release.mjs`. Both run for a formal tag only, by
their own condition on the real event and ref; a pre-release tag is refused by the script as well. Both fail at
once when an R2 secret is missing.

1. **mirror the release to R2** needs the macOS gate job and the publish job, so the GitHub release is public
   first. It uploads each DMG of the gate job's artifact with aws-cli.
2. **point latest at the release** needs the mirror job. It reads every DMG back through the download host, up to
   three times ten seconds apart, and compares its size and sha256 with the gated file. Only then does it write
   `latest.json`.

## When something fails

- **The mirror fails partway**. The GitHub release is already public, and `latest.json` still names the previous
  formal release or is absent, so the landing page offers that release or GitHub's (mac-distribution Failure C1).
  Re-run the failed jobs: the mirror uploads the same artifact's files again, then the pointer runs.
- **The pointer finds a file missing or different**. `latest.json` is left as it was (Failure C2). Find out why
  the host does not serve the uploaded file (`curl -I` on its URL), then re-run the pointer job.
- **A second build never lands in a published version**. Re-running the whole workflow for a tag whose GitHub
  release is public stops at the publish job, so the mirror never runs for it (Failure C3).

## Checking by hand

```bash
curl -sS https://dl.agentshed.aloongplanet.com/latest.json
curl -sSI https://dl.agentshed.aloongplanet.com/releases/v<version>/Agentshed-<version>-mac-arm64.dmg
gh release view v<version> -R aloong-planet/agentshed --json assets --jq '.assets[] | "\(.name) \(.digest)"'
```

The mirrored DMG's sha256 equals the digest GitHub shows for the same file. Download it and compare with
`shasum -a 256`.

## CORS, measured

On 2026-10-18 the mirror was checked from outside Cloudflare, with the bucket still empty. Each line is
`curl -sS -o /dev/null -D - [-X OPTIONS] -H 'Origin: …' [-H 'Access-Control-Request-Method: …'] https://dl.agentshed.aloongplanet.com/latest.json`.
This is the evidence for mac-distribution::REQ-004/AC-03:

| Request | Origin | Answer |
|---|---|---|
| `GET` | `https://agentshed.aloongplanet.com` | 404 (no pointer yet), `access-control-allow-origin: https://agentshed.aloongplanet.com`, `vary: Origin` |
| `GET` | `https://example.com` | 404, no CORS header |
| preflight `GET` | `https://agentshed.aloongplanet.com` | 204, `access-control-allow-methods: GET`, `access-control-max-age: 3600`, the origin allowed |
| preflight `GET` | `https://example.com` | 403 |
| preflight `PUT` | `https://agentshed.aloongplanet.com` | 403 |

The raw output is kept with the ticket's records.

## Not yet observed

The mirror and pointer jobs have not run: only a formal tag runs them, and the first release is a pre-release. The
first formal release is their first real run. Keep its pointer job's log — the line for each file it read back —
as the evidence of mac-distribution::REQ-003 and REQ-004/AC-01, AC-02.
