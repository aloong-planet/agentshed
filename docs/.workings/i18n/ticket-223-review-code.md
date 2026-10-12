# Review — code (step 5), ticket aloong-planet/agentshed#223

- Date: 2026-10-12
- Version: branch `fix/gallery-shell-language` on `1d28be8`, working tree including the review fix below
- Scope: `scripts/check-lang.mjs` (`mockupOnly` and the new `GALLERY_SHELL`), `docs/prototypes/index.html`
  (replaced by a byte copy of the prototype skill's `gallery-template.html`, identical to skillshed
  `origin/master`, last changed in `ad496fd`)
- Review path: tracker ticket without a feature checklist; artifacts under `docs/.workings/i18n/` with the
  `ticket-223-` prefix (code review, test review, document sync checklist). The slug follows
  `docs/specs/i18n.md`, whose Further Notes hold the working-language gate's exemption rules.

## ① Underlying premises — one finding, fixed

- "The shell differs from the template only in the five Chinese lines and comment wording": `diff`
  against the template showed exactly that, and no logic difference. Holds; the copy is byte-identical
  (`cmp`).
- "`manifest.js` addresses the reviewer": its names are the sidebar entries and its questions are the
  prototypes' questions (seen in the rendered gallery). Holds; it stays exempt, as the ticket asks.
- **Finding (new comment overclaimed):** the first version of the comment said the file type tells a
  mockup from tooling "everywhere but one place" and spoke of "five Chinese UI strings". The first is a
  negative claim that a full enumeration refutes (see ④: the three logic pages and `vendor/`), and one of
  the five lines is a comment, not a UI string. The comment now says only that the file type approximates
  the line, and states the mechanism the red step showed (the shell was exempt, so the gate never reported
  its Chinese). Self-harm only (a misleading comment); fixed.

## ② Runnability — no finding

- Red first: with the predicate narrowed and the old shell in place, `check:lang` exited 1 with exactly
  five problems, `docs/prototypes/index.html` lines 4, 51, 54, 55 and 83, and nothing else.
- Green: after the copy, exit 0; the prototype rule covers 34 files (35 before, the shell no longer has
  Chinese).
- Mutations, each confirmed in the file before the run and restored from a copy (re-run on the final code):

  | Mutation | Expected | Result |
  |---|---|---|
  | shell collapse-button title back to its old Chinese text | red | exit 1, one problem at `index.html:49`, the mutated line |
  | Chinese comment appended to a mockup page (`shell/prototype-app-shell.html`) | green | exit 0, permitted lines 2373 → 2374 |
  | Chinese comment appended to a logic page `project-list/visibility/index.html` (same basename as the shell) | green | exit 0, 2374 |
  | Chinese comment appended to `manifest.js` | green | exit 0, 2374 |
  | shell mutation again, with the `GALLERY_SHELL` exclusion removed from the predicate | green | exit 0, 2374 |

  The 2374 count shows each green run read the mutated line and permitted it, rather than not scanning
  the file. The last row shows the narrowing is what turns the first row red.
- The gallery renders and works from `file://` (Chrome via Playwright): 16 sidebar entries for 16
  manifest entries, every entry opens its page in the iframe with the item selected, button titles
  `Collapse (S)` / `Expand (S)`, empty text `Select a prototype on the left`, folding with `S` shows the
  expand button, no page errors. Screenshots were taken of the empty state, the first entry and the
  folded state.

## ③ Security — no finding

No new input or output path. The shell's `innerHTML` use of manifest fields is unchanged from before and
reads only the repository's own manifest.

## ④ Consistency — one finding, fixed; one class-level result

- **Finding (doc comment attached to the wrong declaration):** the constant was first placed between
  `mockupOnly`'s JSDoc block and the function, so the block documented the constant. The constant now has
  its own one-line doc above the block. Fixed.
- Matching an exact path follows the file's existing rules (`README.md`, `scripts/check-shared-ui.mjs`).
  A red on the shell prints the prototype rule's reason, "the tooling beside it gets no exemption", which
  is the reason that applies.
- `docs/specs/i18n.md` Further Notes describe this exemption as "mockup content but not the tooling beside
  it"; the change makes the gate match that sentence, so no spec text becomes false.
- Smell baseline: no hit.
- **Class-level check** ("an exemption keyed on file type also exempts tooling of that type"). All 39
  files under `docs/prototypes/` with an exempt extension were enumerated from
  `git ls-files --cached --others --exclude-standard` and read (byte counts recorded):
  - 33 are prototype content: 13 mockup pages, 8 shared mockup components in `_shared/`, the skills
    fixture, `manifest.js`, and the logic prototypes' `logic.js`, `.mmd` and derived `model.mmd.js` files;
  - 1 is the gallery shell, fixed here;
  - 2 are third-party tooling (`vendor/marked.umd.js`, `vendor/mermaid.min.js`) with no Chinese; exempting
    vendored code is right in effect, since it cannot be translated here;
  - 3 hit: the logic pages `project-list/visibility/index.html`, `skill-install/install-flow/index.html`
    and `token-stats/scan-cache/index.html` are filled-in copies of the skill's `logic-page-template.html`
    and still carry its chrome in Chinese (header comment, "drive it yourself" heading, receipts, the stress
    toggle and hint, the empty-diagram notice, the reset-view title, the unreachable tooltip prefix) beside
    their Chinese prototype content. One file holds both, so no file-level predicate can separate them,
    and the pages have diverged from the template, so they cannot be re-copied. Outside this ticket; see
    below.

## Outside this ticket (reported, owner to decide)

| Finding | Impact | Recommendation |
|---|---|---|
| Logic pages carry the logic template's chrome in Chinese (3 files) | Only the prototype reviewer sees it, when opening those three logic prototypes. `check:lang` cannot see it, so nothing will ever report it | A separate issue: rewrite the chrome strings to the template's current English wording and keep the prototype content as it is, with a render check of each page. Not in this PR, which would grow to three more hand-edited files |
| The gallery shell's fold controls use character icons (`⟨⟨`, `☰`); the logic template does too (`⌂`, `↺`) | Prototype tooling only, never the product. Both come from the skill templates, so a change belongs to skillshed, not to agentshed's copies | Do not change |
