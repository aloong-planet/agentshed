# Skills install

> Related: ADR-0004 (land by copy, symlinks rejected) · ADR-0038 (test layers) · ADR-0049 (shared skills directory)

## Problem Statement

Setting up skills for a project meant copying by hand: easy to put in the wrong place (the two sides'
directories differ), easy to trip over a symlink (editing follows through into the global library),
and an interruption leaves a half-finished directory that the next scan mistakes for an installed
skill.

## Solution

Make the global library the only install source and **land a copy** into the chosen project (every
symlink in the skill lands as a real file or directory), so the project's copy is self-contained; a
project-level copy can be uninstalled. The global library itself is read-only.

## User Stories

1. As a user, I want to pick the target project straight from a global library entry, so that I do
   not have to remember either side's directory structure.
2. As a user, I want the install to be a full copy holding no symlink (skill-install::REQ-004), so that
   the project's copy is self-contained and editing does not follow through to the global library.
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
- A2 Installing on the Codex side → lands in `.agents/skills/`; on the Grok side → `.grok/skills/`;
  on the Antigravity side → `.agents/skills/`, the same directory as Codex's
  (skill-install::REQ-001). A side's skill never lands in a directory that side does not load.
- A3 The source, or anything in it at any depth, is a symlink → skill-install::REQ-004.
- A4 The target already has a project-level skill of the same name → conflict, blocked with a notice,
  not overwritten.
- A5 The target project directory does not exist (a stale project) → the picker lists it disabled
  (skill-install::REQ-003/AC-01); an install that reaches it anyway — it went stale after the picker was
  drawn — is refused with a notice. A directory that cannot be reached is not stale
  ([projects-list](projects-list.md) A6): the picker offers it and the install fails as A10.
- A6 The source is missing from the global library → missing-source, and **no half-finished directory
  is left** (ADR-0004).
- A7 A skill name containing path traversal (`../` and so on) → refused.
- A8 The intersection of the skill's available sides and the project's sides is empty → a notice that
  the project does not belong to that side, no install.
- A9 Several target directories qualify → install to each, each reporting its own success or failure;
  Codex and Antigravity qualifying together are one directory and one landing (skill-install::REQ-001).
- A10 The copy fails (a project that cannot be written or reached, a source file or a symlink's target that
  cannot be read, a full disk) → one failure notice naming the skill, the project and the side or shared
  directory, saying the copy failed and was cleaned up, in the current UI language. It carries no system
  error; that goes to the log.
- A11 "Install to…" is offered on each row of the Agents page's Skills section and opens a target
  project picker sorted by activity; each target row shows where the skill would land.
- A12 The picker stays open while it is looked through: scrolling its list reaches targets below the
  fold, and resizing the window moves it along with its button rather than closing it. It closes
  when a target is picked, when the page behind it scrolls, or when typing starts in its filter box
  — in each of those the row it was opened from has moved or gone.

**Sequence B: uninstall**
- B1 Deletes the project-level copy; **the global library is unaffected**. A symlink in the copy is deleted
  as a link, and what it points to is left in place (measured, Electron 43).
- B2 The target does not exist → report an error rather than throwing (the UI shows a failure notice).
- B3 Name traversal → refused.
- B4 The confirmation dialog must show the full path to be deleted (the user can see what is going).
- B5 The delete fails (a directory that cannot be written) → one failure notice naming the skill and the
  copy's path, in the current UI language, saying it could not be fully deleted: a directory's contents go
  before the directory itself, so the copy can be empty already and gone from the list (measured
  2026-11-05). It carries no system error; that goes to the log. The empty directory still holds the name,
  so a later install of that skill is blocked by A4 until the directory is removed.
- B6 Uninstall is offered on a project-level entry in project detail's Skills section, behind a
  confirmation (B4).

**Cross-cutting**
- R1 Install and uninstall touch only the global library and the project's skills directory, and
  nothing else (plugin entries have no install/uninstall entry point).
- R2 An operation triggers no rescan at all, and none is needed: a project's detail — the view an
  install or uninstall changes — is read when the project is opened, and the snapshot holds nothing
  an operation could make stale. Uninstall, which happens with that view already on screen,
  refetches it in place.
- R3 An install or uninstall goes only into a project the app's snapshot lists, named by the exact path it
  is listed under: any other target, another spelling of a listed path included, is refused with a notice
  that it is not one of the app's projects, and nothing is written or deleted (R1). A target the snapshot
  lists as stale is refused with A5's notice, even if its directory is back. Before the first scan
  completes, the snapshot is the restored one the window shows.

## The shared skills directory

### skill-install::REQ-001 One install target for the shared skills directory

Applies to: installing into a project whenever Codex or Antigravity is among the install sides.

- skill-install::REQ-001/AC-01: Codex and Antigravity both load the project's `.agents/skills`, so
  the picker offers it as one target: one outlined mark naming both sides that load it (CX AG),
  whatever the project is registered on — never a Codex target and an Antigravity target that land
  in the same place (ADR-0049).
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
registered on both, lands once, and a second attempt hits the same-name block (A4); a project
registered only on Antigravity still sees the mark name both loaders, and the uninstall warning
names both, because Codex loads the directory whenever it runs there; the
copy-to-temporary-then-rename rule (A6) and name validation (A7, B3) apply to the one landing
unchanged. When Codex and Antigravity both qualify, the copy landed is the first side's in side
order — Codex's (the rule the drawer's default side already follows, A1); an Antigravity-only
install takes the copy agy uses (AC-05). A failure in the shared landing names the directory, not a
side.

## The install picker's rows

### skill-install::REQ-003 What a target row says before it is chosen

Applies to: every row of the "Install to…" picker.

- skill-install::REQ-003/AC-01: A stale project is listed in the picker, disabled and labelled as stale;
  it cannot be chosen (A5).
- skill-install::REQ-003/AC-02: A project where a landing directory of this skill already holds a skill of
  the same name carries a "Same name installed" tag; choosing it shows the existing blocked notice (A4)
  and installs nothing.

Failure modes and boundaries: a project that turns stale or gains the same name after the picker was
drawn is caught by A5's and A4's refusals at install time; a project whose landings include the
shared skills directory is tagged when that directory holds the name (skill-install::REQ-001/AC-03).
Choosing a tagged project installs nothing in any of its landings, a free one included (AC-02's
"installs nothing"). The tags belong to one opening of the picker: a reopened picker draws none
until its own arrive, never the previous opening's; a target untagged meanwhile is still refused at
install time (A4).

## Links in the skill

### skill-install::REQ-004 The project's copy holds no symlink

Applies to: every landing of an install (A9).

- skill-install::REQ-004/AC-01: Every symlink in the skill, at any depth and the skill's own entry
  included, lands as a real file or directory holding what it points to, wherever that is, inside the
  skill's directory or outside it. The project's copy holds no symlink at any depth, so writing into it
  changes nothing in the global library or behind a link (ADR-0004).
- skill-install::REQ-004/AC-02: A symlink in the skill that leads nowhere (what it points to does not
  exist, or it is one of a chain of links that never reaches a file or a directory) fails the install:
  nothing lands (A6), and the failure notice is A10's with its reason replaced: it names the link's path
  inside the skill and says the link leads nowhere and nothing was installed.
- skill-install::REQ-004/AC-03: A symlink to a directory the copy is already inside, by whatever route,
  to a directory that holds the skill (its library entry or its real directory), or to the copy being
  landed or a directory holding it (the project and its skills directory included), fails the install as
  AC-02 does, its notice saying the link leads back into the skill. A directory holds them along their
  paths as written and where a link on those paths leads.

Failure modes and boundaries: the install stops at the first problem met in path order, paths inside the
skill compared segment by segment in byte order, and its notice is that problem's: AC-02's or AC-03's for a
link of their kind, A10's for a file or directory that cannot be read. A project that cannot be written
fails before the skill is read, and one inside the skill's own directory, by whatever route, before
anything is written (A10). An entry that is neither a file nor a directory (a pipe, a socket, a device),
behind a link or not, is left out of the copy, whose contents are otherwise intact (A1), and its path
inside the skill goes to the log; the install succeeds.

## Implementation Decisions

- **Landing method**: see ADR-0004 (land by copy; copy to a temporary name in the same directory
  first, then rename, cleaning up on failure).
- **Notices**: an install's or uninstall's success and failure notices differ only in their colour;
  their text carries no mark such as ✓ or ⚠. A failed uninstall's notice names the skill whatever
  the reason. A landing's failure notice and the same-name notice share one sentence shape, with
  each language's own punctuation.

## Out of Scope

- Adding to or removing from the global library via this app (it is read-only).
- Installing or uninstalling plugins (see the plugins-view spec's Out of Scope).
- Checking for divergence between copies when uninstalling (the project's git state is the user's to
  handle).
- Version management and update notifications.
- Finding or rewriting a project-level copy that already holds a symlink (one copied by hand, or landed by
  a build that kept the links below a skill's own entry): the app writes to a project's copy only to
  install or uninstall it, and uninstalling it (B1) and installing again lands a copy without one.
