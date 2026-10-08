# Review — tests (step 6), message language

Date: 2026-10-08 · Scope: how this change is verified. Like the repository's other gate scripts under
`scripts/`, the new code has no unit tests (vitest collects `src/**` only); its behaviour is proved by a
mutation matrix run in throwaway repositories, by probes against the real repository, and by real data.

## Dimension 1 — coverage

Mutation matrix, 22 cases, each in a throwaway git repository with the script and shared module copied in,
exit code taken directly and the expected text required in the output:

| Area | Cases |
|---|---|
| Working language | `zh` and `zh-Hant` skip (0, "does not apply"); `ja` unsupported (1); not declared (1); no `capabilities.toml` (1) |
| Prose rule | English (0); Chinese in subject (1, line 1); in body (1, line 3); inside each of backticks, single, double and corner-bracket quotes (0) |
| Commit file handling | Chinese git comment lines and a Chinese diff below the scissors ignored (0); `core.commentChar = ;` — `;` lines ignored (0), a `#` line checked (1) |
| Inputs | stdin title in Chinese (1, "PR title, line 1"); empty stdin (0); commit range with one Chinese commit (1, naming it); all-English range (0) |
| Fenced blocks | closed backtick block (0); closed tilde block with info string (0); Chinese after a closed block (1); unclosed fence (1); closing fence followed by text (1); shorter closing fence (1) |

Through the real repository: `check-lang` before/after the refactor (rule file counts identical; the
permitted count moved by exactly the three lines that became escapes); `check-lang` probes — a Chinese
comment in a `.ts` (1), a corner-bracket citation in an ADR (0 now, 1 with the pre-change version), a
closed fence in an ADR (0), an unclosed fence (1), a fence inside a code comment (1).

The hook end to end in the worktree: a Chinese commit rejected with HEAD unchanged; an English commit
accepted; `--no-verify` bypasses (documented, the reason the CI layer exists); a commit written through an
editor with a Chinese comment line accepted, stored message without the comment. Test commits removed by
resetting to the recorded base.

CI workflow: YAML parsed; each step's command simulated in a local shell with the same environment
variables, including a title carrying shell metacharacters and a command substitution (checked as text,
nothing executed) and a body with `%` sequences.

**Gaps.** (1) The workflow has not run on GitHub Actions (blocked by billing); closes on the first run
after billing is restored, which is also the precondition for making it required. (2)
`core.commentChar = auto` and `core.commentString` are unsupported by decision (stated in the script and
ADR-0030). (3) Whether git hands the hook the message before or after its own comment cleanup was not
determined; the editor test passes either way, so it does not show that the script's stripping was the
step that removed the line.

## Dimension 2 — case design and fixture independence

- The matrix fixtures are synthetic, built from the same understanding as the code. Two real sources were
  added so the verification does not share the code's blind spots:
  - **`master` history.** The range holding the post-ADR-0017 Chinese commits: 17 commits, 17 with
    Chinese by an independent `grep`, 17 reported by the gate. The 46 commits after it: 0 reported — but
    none of them contains Chinese at all, so this only shows English is not misreported.
  - **The last 100 merged pull requests' titles and bodies** through the stdin path: 111 parts contain
    Chinese, 110 reported, 1 passed (a body whose Chinese is all cited). Of the reported, the two dated
    after the commit subjects switched to English were inspected line by line: both bodies are written in
    Chinese — true positives, not quoting shapes the rule missed. That one passing body is the only real
    sample of cited Chinese; the quoting rule otherwise rests on synthetic cases.
- No implementation-coupling red flags: every case drives the script as a process and reads its exit
  code and output.

## Dimension 3 — false greens

- The first matrix run crashed in the harness (copying `node_modules` into each repository, then failing
  to delete it) before any case ran; the run exited non-zero and printed no PASS lines, so it was not read
  as a result. Fixed by symlinking `node_modules` and ignoring it, then re-run.
- The matrix caught a real defect in its first complete run (corner brackets), which is evidence that its
  quoting cases can go red for the reason they exist.
- Exit codes are taken from the script or `git commit` directly, never after a pipe whose exit code would
  hide them. In the workflow, the `printf … | node …` steps report node's exit code, the last command.
- Probes were removed by deleting the probe file or copying back a backup, never by a version-control
  checkout; the touched tracked file was compared with `git diff --quiet` afterwards.

**Gap (1) closed, 2026-10-08**: CI is running again; on this pull request the `Message language` workflow
ran on Actions and passed (19 s), alongside the existing CI jobs.
