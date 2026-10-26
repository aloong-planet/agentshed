# Code review — #316

Ticket: [#316](https://github.com/aloong-planet/agentshed/issues/316) · work directory `prototype-baseline` ·
requirement source: #316's body with the owner's decisions of 2026-10-26, no spec. Task list:
[ticket-316-tasks.md](ticket-316-tasks.md).

## Layered review (2026-10-26, implementation e7d6f5a, range e926e38..e7d6f5a)

Scope: `scripts/check-shared-ui.mjs` (the mirrored lists, `SOURCE_PROBLEMS` and its rule, and the brand, accent, chip,
dictionary, README, ticket-number, rail and swatch rules reading them) and `scripts/check-shared-ui.test.mjs` (two
trees, copied READMEs, an empty `docs/.workings`, global plants, the copy guard's nearest-ancestor check).

**① Underlying premises — finding 1.**
- The new comments' causal claims, each checked: the ticket-number walk's hidden-entry skip is what leaves
  `docs/.workings` out (a copy of the gate without it turns only K4 red, `evidence/ticket-316/mutants.txt`); the
  mirrored lists' rule is what makes a renamed source red (a copy whose rule returns nothing turns X1–X10 red); the
  swatch rule's stop keeps the gate running (without it, X0 red); the chip rule's stop — an empty alternation matches
  an empty string literal, run with node (`/['"`>]()['"`<]/` matches `const a = ''`); `constValue` reads a nested
  declaration (app-rail.js's `ITEMS`, read: Ra1 green, X7 red when emptied).
- Finding 1: the comment on `SIDE_NAMES` says the names are sorted "the longest first, so "Claude Code" is one name,
  not two". The count is one per side's pattern, whatever the order inside it, so the sort does nothing and the
  comment names a cause that is not one.
- "Only hex values" in `themeHexValues`: all 34 values are hex today (`ticket-316-tasks.md`, facts). Its stated reason
  holds (a `var(--x)` value would report every component using that token); the comment does not say that a colour in
  another notation goes unsearched — added with finding 1's fix.

**② Runnability — finding 2.**
- Finding 2: a member of a source that the reader cannot read is dropped in silence. `constValue` returns `undefined`
  for anything but a string, array or object literal, and `mirrored` filters non-strings out: `LANGUAGES = ['zh',
  ...EXTRA]` yields `['zh']` (run with the TypeScript parser on that line: the element is a `SpreadElement`), and a
  record value that is an identifier drops that side. The source rule stays green, and the dropped member's checks are
  gone — the gate's verdict is wrong for every file holding it. Escape: upper (the gate's overall verdict). Class-level:
  every list read through the reader — `LANGUAGES`, `APPEARANCE_THEMES`, `ITEMS` (arrays), `SIDE_FULL_NAME`,
  `SIDE_SHORT_NAME`, `SIDE_CHIP_LABEL` (records); `DEFAULT_THEME`, a single value, already reports an unreadable value
  as empty. Six of seven hit.
- Other paths: a missing source is reported and its rules skip or check nothing (X0–X10); `DEFAULT_THEME` naming no
  theme maps every theme to `data-theme`, and the swatch rule reports the default's block as missing — loud. A missing
  `src/renderer/src` makes `readdirSync` throw, as the accent and chip rules already did; loud.
- Test harness: both trees are built at import and removed in `finally`; a setup assertion fails the import, so every
  case fails. The copy guard walks up to an existing ancestor: a new file under a linked directory resolves into the
  repository and is refused, as before.

**③ Security — no finding.** The gate reads the repository's own files; the TypeScript parser builds a syntax tree and
evaluates nothing. The patterns built from source strings escape them (`escapeRegExp`) and are alternations of
literals.

**④ Consistency — finding 3.**
- Finding 3: `rendererSources` (new) and `appSources` (existing) list only the files directly in `src/renderer/src/`,
  so a component in a new subdirectory is outside the brand, accent and chip rules and `<TrendChart>`'s required prop
  — a scope that does not follow the code, the class #316 is about, and D4 says every `.ts` and `.tsx` in that
  directory. Class-level: every file listing in the gate — `prototypeHtmls` and the ticket-number walk (recursive),
  `sharedBlocks` (flat by the shared-block layout), the dictionaries and READMEs (by their sources), `rendererSources`
  and `appSources` (flat): two of seven hit. No subdirectory exists today (`find src/renderer/src -mindepth 1 -type d`:
  0), so nothing changes on main.
- Rule names: the README rule and the chip rule are renamed (the chip rule's old name listed the sides); no tracked
  file outside `docs/.workings` quotes either old name (`git grep`, exit 1).
- Smells, on the code this change brings: duplicated listing of the renderer's files (finding 3, merged by its fix);
  `constValue` against the project column rule's own `PROJECTS` visitor (existing code, read below).

Refactor list:

| Item | Reason | Impact | Recommendation |
|---|---|---|---|
| The project column rule reads `project-side.js`'s `PROJECTS` with its own visitor, beside `constValue` | Duplicated code (existing code, outside this change) | Self: two parsers of literal declarations in one script | No change: the rule reads two fields per entry and reports its own "has it changed shape?" message; folding it in rewrites a working rule for no behaviour |

### Findings

1. **The side-name pattern's comment names a cause that is not one** (① , instance). Fix: the sort removed and the
   comment rewritten to say why a side counts once (its one pattern); `themeHexValues`' comment says a colour in
   another notation is not searched for. No behaviour change; no test.
2. **A source member the reader cannot read is dropped in silence** (②, class: six lists). Fix: every list goes through
   one check that reports `<path>: <name> has a member this script cannot read — …` when some member is not a string;
   cases on an array (`LANGUAGES` with a spread) and a record (`SIDE_FULL_NAME` with an identifier value), red first on
   e7d6f5a.
3. **The renderer rules read only the top level of `src/renderer/src/`** (④, class: two listings). Fix: `rendererSources`
   reads the directory recursively and `appSources` is its `.tsx` files; cases on a component in a new subdirectory —
   a provider colour and a `<TrendChart>` without `archivedDays` — red first on e7d6f5a.

### Fixes and the rescan (2026-10-26)

- Finding 1: the sort is gone and the comment says a side counts once because it has one pattern; `themeHexValues`'
  comment says a colour in another notation is not searched for.
- Finding 2: `mirrored` takes a list's members as read and reports `has a member this script cannot read` when one is
  not a string; `constValue` keeps an object's spread or shorthand member as an entry with no value, which it had
  skipped. All seven lists read through it go through the check: `LANGUAGES`, `APPEARANCE_THEMES`, `DEFAULT_THEME`,
  `ITEMS` (an element that is not an object with a string `id` counts), `SIDE_FULL_NAME`, `SIDE_SHORT_NAME`,
  `SIDE_CHIP_LABEL`. Cases U1 (an array's spread), U2 (a record value that is a constant's name), U3 (a record's
  spread), red on e7d6f5a (`evidence/ticket-316/red-first-2.txt`, `red-first-3.txt`).
- Finding 3: `rendererSources` reads `src/renderer/src/` with its subdirectories, sorted; `appSources` is its `.tsx`
  files, keeping its stop when the directory is missing. Case Sub, red on e7d6f5a.
- After the fixes: 58 cases green, and the gate green on the repository (`red-first-3.txt`'s second run; `green-2.txt`
  before U3).

Rescan of ③ and ④, findings 1 and 2 being in the fact layers: ③ — no finding; the fix builds no pattern and reads no
new input. ④ — no finding: `elementsOf` and `entriesOf` name what they return; `mirrored`'s one check now serves every
list, which removes the side names' own copy of it; `appSources` keeps its existing stop while `rendererSources` throws
on a missing directory, as the accent and chip rules did before this change. Refactor list unchanged.

### Found after the review, at step 8's searches (2026-10-26)

4. **New names use a term the glossary avoids** (④, class). CONTEXT's **Side colour** entry avoids "brand colour"
   ("these are ours, not the vendors'"); this change named its list `BRAND_COLOURS` and its report "the brand colours
   come from them", and kept the provider colour rule's name "provider brand colours". Class check: every `_Avoid_`
   term in CONTEXT (46 entries) against the lines this change adds to `scripts/`: "brand colour" in those three places;
   `Locale` (the dictionaries' own type name, copied from `en.ts`) and `symlinkSync` (the file system's call, not a
   project install) are not the avoided senses. Fix: `PROVIDER_COLOURS`, "the provider colours come from them", the
   rule named "provider colours must not be hard-coded in components"; X8's expected line follows.
5. **The side-enumeration rule's comment, and CONTEXT's invariant, describe a field the allow-list lost** (①, missed
   in the review's comment check, which took only the comments this change wrote). Both say each allow-listed key
   carries "the ticket that retires it"; the entries named #126 when written (63a6c23) and name spec agents-overview G2
   or nothing since (98b56ef, `git log -S`). Fix: "each entry carrying the reason it may name them", in the comment
   and in `CONTEXT.md:580`.

Self-check before handing over the fixes for the post-implementation check's findings 1–3 (2026-10-27), item 1: no
product code changed; the gate is HEAD's (723db11), the fixes are test cases only (`evidence/ticket-316/red-first-4.txt`
records its hash equal to HEAD's).
