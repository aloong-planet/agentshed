# Skills install

> Related: [features](../features/skill-install.md) · ADR-0004 (land by copy, symlinks rejected) · ADR-0002 (dual seam) · ADR-0037 (shared skills directory)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01 — the boundary entries were inferred from the existing test cases; the
> trade-offs behind the landing method are in ADR-0004 and are not restated here.

## Problem Statement

Setting up skills for a project meant copying by hand: easy to put in the wrong place (the two sides'
directories differ), easy to trip over a symlink (editing follows through into the global library),
and an interruption leaves a half-finished directory that the next scan mistakes for an installed
skill.

## Solution

Make the global library the only install source and **land a copy** into the chosen project (a
symlinked source lands as a real file), so the project's copy is self-contained; a project-level copy
can be uninstalled. The global library itself is read-only.

## User Stories

1. As a user, I want to pick the target project straight from a global library entry, so that I do
   not have to remember either side's directory structure.
2. As a user, I want the install to be a full copy with symlinked sources dereferenced, so that the
   project's copy is self-contained and editing does not follow through to the global library.
3. As a user, I want to be blocked rather than overwritten when the target already has a
   project-level skill of the same name, so that my customised version is not silently wiped.
4. As a user, I want nothing half-finished left behind on interruption or failure, so that the next
   scan does not mistake a broken directory for an installed skill.
5. As a user, I want to see the full path to be deleted and confirm before uninstalling a
   project-level copy, so that I do not delete the wrong thing.
6. As a user, I want each operation to give an explicit success or failure notice and its result to
   be visible without my refreshing anything, so that feedback is prompt without interrupting my
   browsing elsewhere.

## Failure modes and boundaries

**Sequence A: install**
- A1 Installing on the Claude side → copies into the project's `.claude/skills/`, contents intact.
- A2 Installing on the Codex side → lands in `.agents/skills/`; on the Grok side →
  `.grok/skills/`; on the Antigravity side → `.agents/skills/`, the same directory as Codex's
  (skill-install::REQ-001). A side's skill never lands in a directory that side does not load — the
  mapping is the shared PROJECT_SKILLS_DIR record, so a new side is a compile error rather than a wrong
  landing.
- A3 The source is a symlink → **dereferenced and copied as a real directory** (ADR-0004).
- A4 The target already has a project-level skill of the same name → conflict, blocked with a notice,
  not overwritten.
- A5 The target project directory does not exist (a stale project) → the picker lists it disabled
  (skill-install::REQ-003/AC-01); an install that reaches it anyway — it went stale after the picker was
  drawn — is refused with a notice.
- A6 The source is missing from the global library → missing-source, and **no half-finished directory
  is left** (copy to a temporary name first, then rename; clean up on failure).
- A7 A skill name containing path traversal (`../` and so on) → refused.
- A8 The intersection of the skill's available sides and the project's sides is empty → a notice that
  the project does not belong to that side, no install.
- A9 Several target directories qualify → install to each, each reporting its own success or failure;
  Codex and Antigravity qualifying together are one directory and one landing (skill-install::REQ-001).

**Sequence B: uninstall**
- B1 Deletes the project-level copy; **the global library is unaffected**.
- B2 The target does not exist → report an error rather than throwing (the UI shows a failure notice).
- B3 Name traversal → refused.
- B4 The confirmation dialog must show the full path to be deleted (the user can see what is going).

**Cross-cutting**
- R1 Install and uninstall touch only the global library and the project's skills directory, and
  nothing else (plugin entries have no install/uninstall entry point, plus a level guard as a second
  line of defence).
- R2 An operation triggers no rescan at all, and none is needed (restated 2026-08-23, when the copy
  claiming "only this project was refreshed" was retired): a project's detail — the view an install
  or uninstall changes — is read when the project is opened, and the snapshot holds nothing an
  operation could make stale. Uninstall, which happens with that view already on screen, refetches
  it in place. Measured context for why a rescan is not added "to be safe": a warm rescan of a real
  data set costs ~13s.

## The shared skills directory

### skill-install::REQ-001 One install target for the shared skills directory

Applies to: installing into a project whenever Codex or Antigravity is among the install sides.

- skill-install::REQ-001/AC-01: Codex and Antigravity both load the project's `.agents/skills`, so the
  picker offers it as one target: one outlined mark naming both sides that load it (CX AG), whatever
  the project is registered on (owner's ruling 2026-10-28) — never a Codex target and an Antigravity
  target that land in the same place (ADR-0037).
- skill-install::REQ-001/AC-02: Whether a project offers it follows A8: the skill's sides ∩ the project's
  sides must include Codex or Antigravity. A project whose intersection is empty overall gets the
  existing notice that it does not belong to the skill's sides.
- skill-install::REQ-001/AC-03: The same-name check (A4) against the directory is made once; a conflict
  blocks the one landing.
- skill-install::REQ-001/AC-04: The result is reported once for the directory: success says the skill
  was installed into the project's shared directory, loaded by Codex and Antigravity; a failure is one
  failure notice.
- skill-install::REQ-001/AC-05: Antigravity's global library is an install source like the others; the
  copy installed is the one agy uses ([skills-view::REQ-001/AC-01](skills-view.md)).

### skill-install::REQ-002 Uninstalling from the shared skills directory

- skill-install::REQ-002/AC-01: Uninstalling a skill from the shared directory deletes it from
  `.agents/skills` (B1). The confirmation shows the full path (B4) and states that the directory is
  loaded by Codex and Antigravity, so that once it is deleted none of them has the skill.

Failure modes and boundaries: a skill on Codex and Antigravity both, installed into a project
registered on both, lands once, and a second attempt hits the same-name block (A4); a project registered
only on Antigravity still sees the mark name both loaders, and the uninstall warning names both,
because Codex loads the directory whenever it runs there; the copy-to-temporary-then-rename rule (A6)
and name validation (A7, B3) apply to the one landing unchanged. When Codex and Antigravity both
qualify, the copy landed is the first side's in side order — Codex's (settled 2026-10-29: the rule the
drawer's default side already follows, A1); an Antigravity-only install takes the copy agy uses (AC-05).
A failure in the shared landing names the directory, not a side.

## The install picker's rows

### skill-install::REQ-003 What a target row says before it is chosen

Applies to: every row of the "Install to…" picker (owner's ruling 2026-10-28: the prototype, the
interface baseline, already drew both; the app had neither).

- skill-install::REQ-003/AC-01: A stale project is listed in the picker, disabled and labelled as stale;
  it cannot be chosen (A5).
- skill-install::REQ-003/AC-02: A project where a landing directory of this skill already holds a skill of
  the same name carries a "Same name installed" tag; choosing it shows the existing blocked notice (A4)
  and installs nothing.

Failure modes and boundaries: a project that turns stale or gains the same name after the picker was
drawn is caught by A5's and A4's refusals at install time; a project whose landings include the shared
skills directory is tagged when that directory holds the name (skill-install::REQ-001/AC-03). Choosing a
tagged project installs nothing in any of its landings, a free one included (AC-02's "installs
nothing"). The tags belong to one opening of the picker: a reopened picker draws none until its own
arrive, never the previous opening's (settled 2026-10-29); a target untagged meanwhile is still refused
at install time (A4).

## Implementation Decisions

- **Landing method**: see ADR-0004 (land by copy; copy to a temporary name in the same directory
  first, then rename, cleaning up on failure).
- **Per-side directories**: Claude = `.claude/skills/`, Codex = `.agents/skills/`, Grok = `.grok/skills/`,
  Antigravity = `.agents/skills/`; the install sides = the skill's available sides ∩ the project's sides,
  and the landings are those sides' directories with duplicates merged, so the shared skills directory
  is one landing.
- **Name validation**: path traversal is refused at both the install and uninstall ends (the caller is
  not trusted).

## Testing Decisions

Following ADR-0002's dual seam: the providers layer **measures real filesystem effects** on a
temporary fixture directory (after installing the files are really there, after uninstalling they are
really gone, a symlink is really dereferenced, a failure really leaves no residue) rather than
mocking `fs`. The shared skills directory (skill-install::REQ-001, skill-install::REQ-002) adds a skill
installed for Codex and Antigravity together landing once, with one result, and its same-name block;
e2e reads the picker's one shared mark on a project registered on Antigravity only and the uninstall
confirmation's sentence.

## Out of Scope

- Adding to or removing from the global library via this app (it is read-only).
- Installing or uninstalling plugins (see the plugins-view spec's Out of Scope).
- Checking for divergence between copies when uninstalling (the project's git state is the user's to
  handle).
- Version management and update notifications.
