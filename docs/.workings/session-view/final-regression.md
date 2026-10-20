# Session view — documentation regression

## Ticket #278 — a stripped Codex fork's title on its session page and in project search

- Date: 2026-10-20
- Scope: #278's change only
- Version: branch `fix/stripped-fork-title` on a1b04b5 — fcdb6c7 (the fix and its tests) and the records after it
- Languages in the searched files, counted by writing system: the session-view spec and feature entry, the global
  search entry and the indexes are English, with Han or Cyrillic only in quotations; searches below are English

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| The engine's comments: the shared title function (`strippedForkTitle`) and the session questions' re-title | the code; spec B2 and A4 | True |
| The e2e cases' comments (the fork page's own title; the banner case's pending sample) | the cases | True |

No document under `docs/` other than these working records changed: the spec already requires the re-title (B2,
A4) without limiting it to the list, and the feature entry already says a fork's title comes from its first real
question after stripping.

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/features/session-view.md`: a fork's "title comes from the first real question after stripping (a session name Codex gave itself still takes priority)" | the session page and the project search now show that title | True on every surface now; it was false on those two before the fix |
| `docs/features/session-view.md`: the session page's "title"; project search's group header "(side badge, title, fork status)" | the same | True |
| `docs/features/global-search.md`: a session card shows "the title" | global search's cards take the scan's listed title, re-titled already | True, unchanged |
| `docs/specs/session-view.md` B2 (re-deriving the title after stripping, from the first question, `thread_name` first) and A4 | the engine now applies it to the session questions too | True; no edit |
| Index rows | no document added or renamed | No change |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension changed | none: sides, languages and surfaces unchanged | — |
| Pending notes in scope | `rg -n "Pending:" docs/specs/session-view.md` — none (exit 1) | — |
| A rule written this round | none new; the fix applies B2 | — |
| Work state | #278 closes with the merge; its acceptance items ticked on the tracker after it | Recorded in #278's document sync checklist |

### Convergence

Every row above was processed; no text was changed by the regression.
