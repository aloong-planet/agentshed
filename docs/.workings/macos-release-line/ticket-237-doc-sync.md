# Document sync checklist — #237

Ticket: [#237 The landing page in Chinese and English](https://github.com/aloong-planet/agentshed/issues/237) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the site's README: how to build, test and preview it | [site/README.md](../../../site/README.md) | Done: commands, where the copy, palette, icons and screenshots live, the tests, and the settings a Pages project needs (root directory, build command, output, `NODE_VERSION` of 22.22.0 or later) |
| The implementation departed from the spec: rewrite the spec in the same change | [landing-page spec](../../specs/landing-page.md) | Done: REQ-004/AC-04 amended (the owner's call of 2026-10-18 on the first and last steps); Implementation Decisions gain the app icon and the tab, and the language toggle; Testing Decisions the fresh build and the palette test; Further Notes the prototype-gate confirmations of 2026-10-18 |
| Declare the site's dictionary and palette in the project capabilities (found in the code review) | [capabilities.toml](../../../capabilities.toml) | Done: `i18n` and `theming` each gain the site's source and `pnpm test:site` as an enforcing command |
| Revise the landing prototype's hero icon before implementing it (found while rendering), for the owner's confirmation | [landing prototype](../../prototypes/landing-page/prototype-landing.html) | Done: the real artwork and a shadow on its outline, confirmed by the owner on 2026-10-18 |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification | [checklist](checklist.md) | Done: #237's row of 2026-10-18 |
| Once the pull request's CI has shown the checks job red on a deliberately broken site check and green after the restore: record the runs in #237's checklist row | [checklist](checklist.md) | Done: runs 39126198647 and 39126646942 on the throwaway #256 (closed, never merged) and 39126081368 on #255, in the row and in [evidence/ticket-237/ci-gate.txt](evidence/ticket-237/ci-gate.txt) |
| Tick #237's acceptance items that are verified, once the CI demonstration is recorded | [#237](https://github.com/aloong-planet/agentshed/issues/237) | Done: every item ticked on 2026-10-18; #237's own part of the two shared items is what was checked (mac-distribution::REQ-001/AC-04's comparison is #241's, landing-page::CON-001's live URL #239's) |

Pre-delivery scope re-check, 2026-10-18 on branch `feat/landing-page`, re-checked on 2026-10-19 after main (#257, #259) was merged into it: the specs (landing-page rewritten;
the statements about the page's copy in mac-distribution REQ-001/AC-04 and Failures D1–D4 and in app-update
Failure B3 hold for the built page), `docs/features/` (nothing there describes the landing page; its entry is
written when the page goes live, as the specs index says), ADR-0031 (`site/`, Astro, Pages, two languages:
consistent), `CONTEXT.md` (no term or invariant touched; the outbound-request invariant governs the app, not
the site), `docs/ops/mac-signing.md` (its "the landing page says the same" about macOS 12 now holds),
`docs/prototypes/` (the landing page revised; its manifest entry unchanged), the root READMEs (the download
instructions are #239's), `capabilities.toml` (`i18n` and `theming` now list the site's sources, the row above), `site/` and
this directory. One stale statement was found outside this ticket's items, the landing spec's note that the
download host was still being decided; #236 (#259) rewrote it to name the host and the pointer, and that
rewrite merged into this branch without conflict.
