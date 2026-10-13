# Document sync checklist — #233

Ticket: [#233 Package through the electron-scaffold asset](https://github.com/aloong-planet/agentshed/issues/233) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the project's macOS signing runbook: identity, secret names, artifact naming, the two profiles; it points to the policy rather than copying it | docs/ops/mac-signing.md (new) | Pending: not started |
| Declare `macos-distribution` enabled with its two profiles and its source (mac-distribution::CON-007) | [capabilities.toml](../../../capabilities.toml) | Pending: not started |
| Check every statement about packaging and the retired identity check script: the packaging configuration's comments, the build directory's README, the READMEs' build sections, the security checklist's fuse check | [build/README.md](../../../build/README.md), the six READMEs, [electron-security](../../ops/electron-security.md) | Pending: not started |
| If the implementation departs from the spec, rewrite the spec in the same change; when the ticket is delivered, remove this row with a note if nothing departed | [mac-distribution spec](../../specs/mac-distribution.md) | Pending: not started |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Pending: not started |
