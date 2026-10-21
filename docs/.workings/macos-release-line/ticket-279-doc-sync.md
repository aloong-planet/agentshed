# Document sync checklist — #279

Ticket: [#279](https://github.com/aloong-planet/agentshed/issues/279) (the landing page's memory and search steps,
and its pinned features section). Records: [task list](ticket-279-tasks.md) · [checklist](checklist.md) (rows marked
#279) · final regression: [final-regression.md](final-regression.md).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The spec carries the confirmed increment; implementation-time boundaries and decisions are written back at the spec check before step 7 | [landing-page spec](../../specs/landing-page.md) | Done — rewritten in 80f2968 (US-003, REQ-004, REQ-005, REQ-007, Sequence C, E2); written back in 7af1220 (Failure C7, the features section's built form) and after the post-implementation check (REQ-007 defines the summary, F1); spec check in `ticket-279-tasks.md` |
| The confirmed prototype shows what the site implements; any implementation-time change goes to the prototype first | `docs/prototypes/landing-page/` | Done — the revision confirmed on 2026-10-21 (D27) and its screenshots committed in 80f2968 |
| The coverage checklist maps #279's units and records their current verification | [checklist.md](checklist.md) | Done — the mapping in 80f2968, amended after the post-implementation check (F1, F4, F9); the current verification row records the final run on b59009a |
| #290 no longer gates #279 (D26) | [#290](https://github.com/aloong-planet/agentshed/issues/290) | Done — its body's note rewritten on 2026-10-21 |
| Step 8: the feature entry says what the features section now shows and how it turns | [landing-page features](../../features/landing-page.md) | Done — final-regression.md, #279 Stage 1 |
| Step 8: the other statements of the page's copy, screenshots and features section stay true: the site's README, the root READMEs' summary the hero repeats, CONTEXT | [site README](../../../site/README.md), [README](../../../README.md), [README.en](../../../README.en.md), [CONTEXT.md](../../../CONTEXT.md) | Done — the site README rewritten; the READMEs agree with the hero (built-site check); CONTEXT unchanged (final-regression.md, #279 Stages 1 and 2) |
| Step 8 report | [final-regression.md](final-regression.md) | Done — the #279 section, three stages (2026-10-21) |

Pre-delivery scope re-check (2026-10-22, on b59009a): the spec, the feature entry and both indexes, the prototype and
its gallery entry ("scroll-linked features section", still true of the pinned showcase), the coverage checklist, the
site's README, the root READMEs (equal to the hero, by the built-site check) and CONTEXT agree with what the site does
at b59009a; #290's note is current. No item missing, none stale. After the merge, the tracker only: #279's acceptance
items ticked and a comment with the merge commit.
