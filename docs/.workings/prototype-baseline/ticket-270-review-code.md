# Code review — #270

Ticket: [#270](https://github.com/aloong-planet/agentshed/issues/270) · work directory `prototype-baseline` · task list:
[ticket-270-tasks.md](ticket-270-tasks.md).

## Layered review (2026-10-26, on branch `fix/check-ui-comment-refs` over ef5e4cb, uncommitted)

Scope: `git diff ef5e4cb` — `scripts/check-shared-ui.mjs` (the shared-block check's four searches and the tab identity
rule's `<head>` searches read the page through `stripComments`), `scripts/check-shared-ui.test.mjs` (new), and
`pnpm check:ui` running the test before the gate. No prototype page or product code changes.

### Underlying premises

- **The defect's cause**: the shared-block check searched the raw page, where a comment that names an asset reads as
  the asset's reference. Shown, not inferred: on ef5e4cb the global search page without its `app-window.css` link
  passes (`evidence/ticket-270/loop-before.txt`, P1), and with the check reading through `stripComments` it is reported
  (`loop-after.txt`); the new test's six cases are red on the unfixed gate and green after (`red-first.txt`, `green.txt`).
- **`stripComments` removes no real reference on today's pages**: with every search changed, `node scripts/check-shared-ui.mjs`
  passes on the repository (`green.txt`), so every declaring page's assets and mount points, and every page's tab
  identity tags, are still found outside comments. The same function already reads whole pages for four other rules.
- **The test's harness**: the gate takes its root from its own file, so a copy of it under a temporary `scripts/` checks
  the temporary tree. The test header's cause — a symbolic link to a directory is not a directory to
  `readdirSync(…, { withFileTypes: true })`, so a linked prototype folder would be skipped — is measured:
  `isDirectory=false isSymbolicLink=true` for such a link (`evidence/ticket-270/symlink-facts.txt`). So the prototypes
  are copied and the rest linked. The new comments in the gate state what the change does; the one cause they give (a
  commented-out tag is not on the page) is how a browser reads HTML.

### Runnability

- The test file runs in 1.3 s (`green.txt`): one copy of `docs/prototypes/` (16 MB) and one gate run, shared by the
  seven cases. A plant whose target string is not found exactly once throws while the tree is built, so the file fails
  to load rather than passing with a case that planted nothing.
- Clean-up: `rmSync(root, { recursive: true })` removes the links, not what they point to (`symlink-facts.txt`: the
  target exists after the tree is removed); the repository's tree is unchanged after every run (`git status`).
- On CI the temporary directory is on another filesystem than the workspace (ubuntu-26.04, #253): the test copies with
  `cpSync` and links with `symlinkSync`, both of which cross filesystems, and moves nothing with a rename.
- `pnpm check:ui`, `pnpm lint`, the two tests that read `package.json`, `check:lang` and `check:nul` pass
  (`evidence/ticket-270/targeted.txt`). The first lint run failed on 151 type errors, all in `site/`, because the new
  worktree had no `site/node_modules`; after `pnpm install` in `site/`, as CI does before lint, it passes.

### Security

Test-only and gate-only code. The test writes only inside its temporary directory and removes it; it reads the
repository through links and never writes through them (the plants write to the copied pages). No finding.

### Consistency

- **Class-level check: every search of a prototype page in the gate that reads raw text.** Enumerated from the file
  (`grep -n "read(f)" scripts/check-shared-ui.mjs`: 15 reads, 7 of them of a prototype page, at lines 519, 551, 589,
  626, 686, 740 and 798 after the change): the shared-block check's four searches (798) — changed; the tab identity
  rule's three (686) — changed; the rail and project column rules read the page with JSDOM, which ignores comments, and their
  ordering searches already use `stripComments`; the demo dimensions and theme rules already use it; the chart container
  rule counts raw `class="…chart…"` and `data-shared-block=` — left by decision D1, since its comparison of chart
  containers with every declaration on the page lets the Agents page's `skChart` pass without a declaration today, a
  separate defect reported to the owner; the ticket-number rule reads documents on purpose, comments included.
- The test follows the gate tests' form (`check-raw-nul.test.mjs`: spawn the gate's command line on a temporary tree)
  and its place in the package script (`node --test <test> && node <gate>`, as `check:lang` and `check:nul`).
- Smells on the changed lines: none. The test's plant table and the evidence script `plant.mjs` overlap in two plants;
  the script is a kept record of the feedback loop, not code that runs in a gate.

### Refactoring list

None.

## Layered review — the parser's comment stripping (2026-10-26, decision D3, on 30a2fee, uncommitted)

Scope: `stripJsComments` (new) and the step of `stripComments` that applies it to each inline `<script>`; the test's
cases G and H and its set-up assertion (reviewed in the test review).

### Underlying premises

- The parser's comment ranges are where the comments are: `ts.getLeadingCommentRanges` and `getTrailingCommentRanges`
  at every node of the parsed script, the way TypeScript itself attaches trivia. On today's pages they find 355 ranges
  in 33 inline scripts, 38 of them after code on the same line, none overlapping (`evidence/ticket-270/comment-ranges.txt`).
  A `//` inside a string is not trivia, so it stays: case H, red under a stripping that ends a line at any `//`.
- Self-check before handing the fix over, item 1 (the change against its requirement): #270's acceptance — removing a
  page's real reference goes red "whether or not a comment on that page names the asset". With the fix, the comment
  forms the pages use are each removed: HTML, `/* */`, a whole-line `//`, a `//` after code (cases A–G).

### Runnability

- `check:ui` passes on main with the parser in every rule that reads pages without comments (`green-2.txt`); its run
  time rose from about 1.05 s to 1.6 s, each page's scripts being parsed once per such rule (`comment-ranges.txt`).
- An inline script the parser cannot fully parse still yields a tree, and its comment ranges; a `</script>` inside a
  string ends the match early, as it ends the script in a browser.

### Security

No finding: gate code, reading the repository's own pages.

### Consistency

- `stripComments` serves the page reads of six call sites; each now reads inline scripts without their JS comments,
  which is the rule's intent for all of them (its doc comment: only markup and code count). After the incremental test
  check's finding 3 it is one pass: HTML comments in the markup, the parser in scripts, CSS comments in style blocks,
  nothing elsewhere; the theme rule's linked CSS files go through `stripCssComments`.
- Smells: none. The `pos < at` guard is defensive, unreached on today's pages (the test review's self-check).

### Refactoring list

None.

Self-check before handing over finding 3's fix (2026-10-26), item 1: the gate against D3 as worded — a `//` after
code goes; a `//` or `/*` inside a string, a template or a regular expression stays, with the code after it (cases
G–J); HTML comments in the markup and CSS comments in style blocks as before. The gate's run time is unchanged by this
fix (about 1.6 s, against 1.05 s on main; interleaved runs under one load, `green-3.txt`).
