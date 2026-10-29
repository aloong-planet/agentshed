# Prototype pages

> Related: none in the feature catalogue (the prototypes are project tooling, not product behaviour). The rules
> applied here come from the prototype skill and the implement skill in the skills repository.

## Problem Statement

A UI prototype page is the baseline the app's interface is built from, so an agent implementing an interface
change reads the page, or the diff a confirmed prototype change made to it. Today a page carries much more than
the interface: the reviewer notes in its header (the question it answers, a dated log of every ruling since the
page was created, the reasons behind them), and comments throughout its markup, styles and scripts recording past
decisions. Measured on 2026-10-29 on the agents page, reading the whole page cost about 38,400 tokens, of which
the header was about 4,100 and the comments in its markup and styles about 2,150 more. What an agent reads stays
in its context and is re-read with every later call: the implementation of the fourth agent side re-read the
prototype diffs it took in at its start about 197 times.

The header log also rots: its entries are appended and never removed, later entries reverse earlier ones, and
some still warn that the data cannot support what the app has since shipped. Reading it in order gives
contradictory answers.

## Solution

Every UI prototype page keeps only one line of header, pointing to a notes file named after the page that holds
the notes the prototype skill requires; past rulings and their reasons are deleted from the page once each is
found in a spec, an ADR or the feature catalogue. Nothing the page shows or does changes. A gate keeps pages in
this shape.

## Functional Requirements

> Pending: the UI prototype pages still carry their reviewer notes and past rulings in their header and inline
> comments, no page has a notes file, and the shared-UI check holds neither rule of prototype-pages::REQ-005.

### prototype-pages::REQ-001 What a UI prototype page's comments hold

- prototype-pages::REQ-001/AC-01: The page's header, before its root element, is at most one comment on one
  line, pointing to its notes file.
- prototype-pages::REQ-001/AC-02: No comment anywhere in the page — markup, styles or scripts — records a
  ruling, its date, its reason, a superseded form or a version history.
- prototype-pages::REQ-001/AC-03: A comment that explains what the code beside it does (a width formula, why a
  rule restores a hidden attribute, the order a list is drawn in) stays.

### prototype-pages::REQ-002 The notes file

Each UI prototype page has one notes file beside it, named after the page with the suffix `.md`
(`prototype-<topic>.md` beside `prototype-<topic>.html`; a candidates page `candidates-<topic>.html` has
`candidates-<topic>.md`). It holds the notes the prototype skill requires of a
page: the question the page answers, the basis for each part whose structure was already decided, the list of
demo scaffolding (marked as not part of the design and not to be implemented, with what decides each state in
the product), the candidates waiting for a choice and their candidates page, the first-draw items pending the
owner's choice, the dimensions the page does not cover, and invalidated conclusions, each named by the region of
the page it concerns.

- prototype-pages::REQ-002/AC-01: Every UI prototype page has its notes file.
- prototype-pages::REQ-002/AC-02: The question states what the page answers now; a question whose premise no
  longer holds is rewritten, not kept beside a correction.
- prototype-pages::REQ-002/AC-03: The notes file records no ruling, date, reason, superseded form or version
  history.

### prototype-pages::REQ-003 Past rulings are deleted only once each has a home

- prototype-pages::REQ-003/AC-01: Before a still-valid ruling is deleted from a page's header or comments, it is
  found as a conclusion in a spec, an ADR or the feature catalogue; one found nowhere is added, as a conclusion,
  to the spec of the feature the page depicts first.
- prototype-pages::REQ-003/AC-02: A statement that no longer holds (a form a later ruling replaced, a warning
  about something the app has since shipped, a count or side list that has since changed) is deleted without
  being carried anywhere.

### prototype-pages::REQ-004 The change alters nothing the page shows or does

- prototype-pages::REQ-004/AC-01: For every UI prototype page, in the default state, in every option of every
  harness group (one option at a time from the default) and in each language the page draws, the rendered page —
  each element's tag, attributes, text and laid-out box, comment nodes left out — is identical before and after
  the change.
- prototype-pages::REQ-004/AC-02: Every page opens on its own from the file system and inside the gallery, as
  before.

### prototype-pages::REQ-005 The gate keeps pages in this shape

The shared-UI check (`pnpm check:ui`) fails when a UI prototype page leaves this shape.

- prototype-pages::REQ-005/AC-01: A UI prototype page without its same-name notes file fails the check.
- prototype-pages::REQ-005/AC-02: A page whose header holds more than one comment of one line fails the check.

## Constraints

### prototype-pages::CON-001 Which pages (direct acceptance)

Applies to: the UI prototype pages, 13 on 2026-10-30. The logic prototypes, the gallery shell, the files copied
from the prototype skill and the shared pieces are not changed by this.

### prototype-pages::CON-002 What stays in the page (direct acceptance)

Applies to: every UI prototype page; its markup, styles, copy tables, mock data and scripts stay where they are,
the demo harness included (its markup, its note lines and the code switching its states). Only comments are
removed or moved.

### prototype-pages::CON-003 Notes files and the language check (direct acceptance)

Applies to: the language check (`pnpm check:lang`); a notes file is exempt like the page it annotates, since both
address the reviewer of a Chinese interface, so a notes file may be written in Chinese. Other Markdown under the
prototypes directory stays checked.

## Failure modes and boundaries

- **Opening a page on its own or in the gallery**: nothing it loads changes, so it opens as before
  (prototype-pages::REQ-004/AC-02).
- **Removing a comment from code**: a comment-like sequence inside a string, a template or a regular expression is
  not a comment; removing it would change what the page renders. Comments are found by parsing each script and
  style block, as the shared-UI check already does, not by matching text (prototype-pages::REQ-004/AC-01).
- **HTML comments are nodes of the page**: removing them changes the document's comment nodes and nothing else;
  the comparison leaves comment nodes out for that reason.
- **The header's mandatory notes**: the notes the prototype skill requires in the header (the question, the
  structure basis, the demo-scaffolding list, uncovered dimensions) move to the notes file, so none is lost when
  the header shrinks to one line (prototype-pages::REQ-002).
- **A demo-scaffolding note**: the note lines shown in the harness stay in the page, so a reader in the browser
  still sees what decides each state; the notes file's list repeats that each element is not part of the design.
- **A page drifting from its notes**: a change to a page updates its notes file in the same change; the gate
  checks only that the notes file exists (prototype-pages::REQ-005/AC-01).
- **A ruling with no home**: it is added to the depicted feature's spec before it is deleted
  (prototype-pages::REQ-003/AC-01); a ruling that turns out to contradict the app is reported, and the page keeps
  drawing what it draws (prototype-pages::REQ-004).
- **A difference between the prototype and the app found during the change**: reported, not fixed — fixing it
  would change what the page shows (prototype-pages::REQ-004).
- **An invalidated conclusion**: it was marked at the region of the page it concerns; in the notes file it names
  that region, since a line number would rot with the next edit.
- **The app's artifacts listing**: it lists prototype pages (`.html`) only, so the notes files do not appear in a
  project's Artifacts tab; the listing of this project is unchanged.
- **Other Markdown under the prototypes directory** (the app icon's README and previews) keeps the language check
  (prototype-pages::CON-003).
- **A notes-named file without its page**: a `prototype-<topic>.md` whose page has been deleted, or whose same-name
  page sits in another directory, is not a notes file; the language check treats it as other Markdown, so a notes
  file left behind by a deleted page surfaces instead of staying exempt (prototype-pages::CON-003).

## Implementation Decisions

- Pairing is by name: `prototype-<topic>.html` and `prototype-<topic>.md` (or `candidates-<topic>.html` and
  `candidates-<topic>.md`) in the same module directory.
- The notes file's sections follow the order of the prototype skill's list of required notes; a section with
  nothing to say is left out.
- The shared-UI check gains the rules of prototype-pages::REQ-005; the language check's prototype exemption is
  extended to the notes files (prototype-pages::CON-003).

## Testing Decisions

- **The shared-UI check's rules** are tested through the check's existing test suite, which runs each rule
  against fixture trees: every new rule gets a fixture that must fail and one that must pass (prior art: the
  existing rules' cases there).
- **The language check's exemption** is tested in the language check's existing suite: a Chinese line in a notes
  file passes, the same line in another Markdown file under the prototypes directory fails.
- **The rendered pages** are compared before and after the change in a headless browser: for each page, the
  default state, every harness option one at a time and each drawn language, each recorded as tag, attributes,
  collapsed text and laid-out box per element, comment nodes left out; the two recordings must be identical
  (prototype-pages::REQ-004/AC-01). The comparison is the evidence for the change, not a standing gate.
- **Screenshots** of each page's default state in Chinese and English, light and dark, before and after, are kept
  for the owner to look over.
- **Sizes**: each page's size before and after is recorded.

## Out of Scope

- Moving mock data out of the page: not done for now; the mock data stays in the page's scripts and markup
  (prototype-pages::CON-002).
- Moving the copy tables or the demo harness out of the page (prototype-pages::CON-002).
- The logic prototypes, the gallery shell, the files copied from the prototype skill and the shared pieces
  (prototype-pages::CON-001).
- A written summary of each page's confirmed form: the conclusions live in the specs and ADRs and the form is the
  page itself, so a summary would be a third copy that drifts.
- Fixing differences between a prototype and the app found during the change.
- Other projects' prototype pages: the prototype skill has each migrated the next time it is changed.

## Further Notes

- The prototype skill's rules are changed in the skills repository to match: the notes it requires of a page go
  to the notes file instead of the page header. The implement skill is changed there to have an implementing
  agent take what to build from the spec and read only the page itself — not its notes file — at the elements the
  change touches.
