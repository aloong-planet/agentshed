# Memory view — Coverage and acceptance checklist

Spec: [memory-view](../../specs/memory-view.md)
Source commit: 9b7bb13, with the spec update uncommitted (branch feat/memory-md-preview)
Scope: the memory file drawer (memory-view::US-001, memory-view::CON-001) and the boundaries it changes
or adds (C7, C8, D2, D6, sequence E). Not affected this round: C1–C6, C9, D1, D3–D5, R1, R2 and the
Codex toggle states — the change touches only how an opened file is shown, not what is listed or read.

Migration of labels: the older lettered items keep their labels. The drawer obligations they carried
now live in memory-view::US-001: C7's "a drawer with the content" → memory-view::US-001; C8's
first-read failure → memory-view::US-001/AC-07; D2's "shared artifact drawer" → memory-view::US-001 and
memory-view::CON-001; D6's "open a drawer" → memory-view::US-001/AC-05.

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| Owner, 2026-10-21, answer to the raw-text drawer question (translated): "give the memory drawer a Markdown preview, and do it first" | Confirmed and in force | memory-view::US-001/AC-02 | Preview is the default on every memory drawer; "do it first" is sequencing, kept out of the spec |
| Owner, 2026-10-21, drawer form (translated): "the same as the skill file drawer" — preview by default, front matter as a card, switch to raw | Confirmed and in force | memory-view::US-001/AC-01, memory-view::US-001/AC-02, memory-view::US-001/AC-03, memory-view::CON-001 | Form, preview default, card, raw switch all carried; "the same" written as one form (CON) |
| Owner, 2026-10-21, links (translated): "the drawer switches to that file" — in-directory link switches; external → system browser; anything else → explicit notice | Confirmed and in force | memory-view::US-001/AC-05, memory-view::US-001/AC-06 | Switch, external and notice branches each carried; the notice is the error toast the app already uses |
| Owner, 2026-10-21, `[[name]]` (translated): "shown as plain text, no jumping for now" | Confirmed and in force | memory-view::US-001/AC-04; Out of Scope | Plain text carried; links left for a later change, in Out of Scope |
| Owner, 2026-10-21, "confirm, continue" on P1: title = the memory's owner, meta = side · file · modified time, bar = the file | Confirmed and in force | memory-view::US-001/AC-01 | All three parts carried, with the Codex placeholder name |
| Owner, 2026-10-21, P2: one shared frame for the skill, plugin and memory drawers; width by the content-area formula; bar fade | Confirmed and in force | memory-view::CON-001 | Width and fade stated; the plugin drawer is the skill file drawer in the app |
| Owner, 2026-10-21, P2's bold colour (deep accent) | Superseded by a later decision | — | The owner chose the same day to keep bold in the body colour on every surface (CONTEXT one-rule-set invariant); CON-001 says "the same content rules" |
| Owner, 2026-10-21, P3: read states inside the frame | Confirmed and in force | memory-view::US-001/AC-07 | Loading, failure, empty and truncation carried |
| Owner, 2026-10-21, P4: a switched-to file opens in preview at the top | Confirmed and in force | memory-view::US-001/AC-05 | Carried |
| Owner, 2026-10-21, P5: in project detail a topic's link to the main file opens it in the drawer; the main file's unlisted links show the toast | Confirmed and in force | memory-view::US-001/AC-05, D6 | Main file in project detail's listed files; D6 now names the toast |
| Owner, 2026-10-21, D5 (after the independent test check): `[[…]]` is literal on every rendered surface, a remark written straight after it included | Confirmed and in force | memory-view::CON-002, memory-view::US-001/AC-04 | The remark case and every-surface reach carried |
| Owner, 2026-10-21, D6: a tag-like `<name>` that is not an HTML element shows as written on every rendered surface; real HTML keeps rendering | Confirmed and in force | memory-view::CON-002 | Both branches carried, and the element-named placeholder exception stated |
| Existing spec C8 / D2 / D6 (already-read body, caps, main-file links) | Background | E1, D2, D6 | Kept; the drawer obligations moved per the migration note |

## Spec → tickets → verification

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| memory-view::US-001/AC-01 | Title = the memory's owner (project name / Codex placeholder); meta = side · file · relative time; bar = file name + switch | #294: implementation and user-path acceptance | Test (e2e, built app): global Memory → expand a row → click a file: title, meta (exact, `Claude · pitfalls.md · today`), bar name, switch; the Codex row's title and `Codex` meta; a project detail topic's title |
| memory-view::US-001/AC-02 | Opens in preview through the shared carrier; front matter card; nested key folds into its parent | #294: implementation and user-path acceptance | Test (e2e): the preview body is the shared md-body; the card's rows include `metadata` · `type: feedback`; the switch present |
| memory-view::US-001/AC-03 | Raw shows the text as read, front matter included; back to preview | #294 | Test (e2e): click raw → body text starts with the front matter; click preview → card back |
| memory-view::US-001/AC-04 | `[[name]]` is plain text, a remark written straight after it included | #294 | Test (e2e): `[[other-note]](read-the-index-first)` present as text, not inside a link |
| memory-view::US-001/AC-05 | In-directory link switches: title stays, meta and bar name the new file, preview, top; global = the row's files, detail = main file + topics | #294 | Test (e2e): global — sibling link switches (scroll first, top after); detail — a topic's link to MEMORY.md opens it; the main file's link opens the topic in this drawer |
| memory-view::US-001/AC-06 | Other links: http(s) → system browser; anchor scrolls; unlisted or other protocol → error toast; no navigation; drawer stays | #294 | Test (e2e): unlisted link → toast, drawer on the same file, URL unchanged; external link with the browser hand-off stubbed → handed off, URL unchanged |
| memory-view::US-001/AC-07 | Loading / read failure / empty / truncation inside the frame, bar and switch stay | #294 | Test (e2e): delayed read → "Loading…"; a file removed after listing → "File cannot be read" with the switch present; empty file → "Empty file"; a 522,000-character file ends with `…(truncated)` in preview and raw |
| memory-view::US-001/AC-08 | Esc, close button, overlay each close | #294 | Test (e2e): each of the three closes the drawer |
| memory-view::CON-001 | One form with the skill file drawer: frame, preview frame, content rules; width min(720, 80%); bar fade | #294: implementation; regression for the skill and plugin drawers | Test (e2e): the memory drawer's width rule and the same computed frame and bar styles as the skill drawer; the skill drawer's existing tests stay green |
| memory-view::CON-002 | Every rendered surface keeps `[[…]]` (with what follows) and non-element tags as written; real HTML still sanitised | #294: implementation in the one carrier; regression for every surface | Test (unit, the carrier): remark, alone, in a code span and a fence, ordinary link, placeholders inline and on their own line, `<b>`, `<script>`, `<input>`; e2e: the memory drawer shows both shapes |
| memory-view E1 | Restored body opens in preview | #294 | Test (e2e, startup restore): the saved body shows in the preview body |
| memory-view E8 | The Subagents drawer keeps its form and min(680) width | #294: regression | Test (e2e): the existing width check, kept for the Subagents drawer |
| memory-view E2, E4–E7 | Race, unclosed front matter, large files, content capabilities, language switch | #294 | E4: Test (unit, unclosed front matter → no card); E5: Test (a 307,000-character file under the cap in e2e: rendered in full, prose wraps, the body and the fence scroll sideways — style and position both checked); E6: by construction (the shared carrier and link interception, tested); E2, E7: gaps recorded in the e2e file header with their reasons |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-21; spec and implementation at 8d241d0 (rebased; 67a31bc before) | memory-view::US-001/AC-01; #294; global Memory, a project's topic, the Codex row | e2e F3 (`app.spec.ts`, "F3 plus the new sections…"): exact title and meta for a Claude topic and the Codex file, bar name, switch; full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::US-001/AC-02, AC-03; #294 | F3: preview by default, front matter card with the nested key folded, raw shows the front matter, preview returns; full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::US-001/AC-04, memory-view::CON-002; #294; the drawer and the one carrier | F3: `[[other-note]](read-the-index-first)` and `docs/.workings/<slug>/` as written; `md.test.ts` "renderMarkdown keeps written text" (red on the pre-fix renderer for the remark and the placeholder); full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::US-001/AC-05; #294; global row, project detail main file and topic | F3: sibling switch to a cached, scrollable file lands at the top (mutation without the key: 420.5 px); the index link opens MEMORY.md; project detail main-file link and topic-to-main link; the late main file (mutation without the registration: refused); full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::US-001/AC-06; #294 | F3: unlisted link → error toast, drawer stays; external link handed to the browser (hand-off recorded), window does not navigate; full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::US-001/AC-07; #294 | F3: empty file, file removed after the scan, truncation pinned to the 500,000 cap in raw (mutation at 320,000: fails); "reopening an artifact": Loading… inside the frame; full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::US-001/AC-08; #294 | F3: Esc, close button, overlay each close; full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view::CON-001; #294; memory, skill and plugin drawers | F3: memory drawer width rule at 1400 and 900, frame and fade equal to the plugin skill drawer, fade colours exact; Skills view and plugin preview e2e unchanged and green; full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view E1, E4, E5, E8 | startup restore: restored body in preview; `md.test.ts` unclosed front matter; F3: the large under-cap file (last line, prose wraps, body and fence scroll; table squeezed: fails); Subagents drawer width min(680); full gate at 8d241d0, rebased onto main 4d21538 (`verify exit=0`, clean tree; e2e 144 passed) | Verified |
| 2026-10-21; 8d241d0 | memory-view E2, E7 | Not tested: gaps recorded in the e2e header with the condition for adding a case | Unverified (gap) |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Source → spec, 2026-10-21: every confirmed source above has a coverage unit | rows above | No gap |
| Spec → source, 2026-10-21: memory-view::US-001/AC-08 (Esc, close button, overlay) | Implementation Decisions "Esc and clicking the overlay are equivalent"; P1/P2 frame (close button) | Existing behaviour plus the confirmed frame's close button; no new scope |
| Spec → source: sequence E (E1–E8) | C8, D2, skills-view D1b, real-data shapes, CONTEXT link and carrier invariants | Boundaries derived from confirmed behaviour and existing rules; E5 states layout only (an unconfirmed performance target was removed) |
| Conflict found while writing: P2's bold colour against CONTEXT's one-rule-set invariant and appearance E7c | CONTEXT.md; docs/specs/appearance.md E7c | Raised with the owner; resolved to body colour on every surface; prototype frame updated |
