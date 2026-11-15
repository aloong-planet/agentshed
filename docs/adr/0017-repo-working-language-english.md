# ADR-0017: The repository's working language is English, for its files and for the text beside them, checked at commit and in the pull request

- Status: Accepted (2026-10-08)

## Context

Comments, documents and tests carry reasons a contributor who reads no Chinese cannot rebuild from the code, and a
squash merge commit carries the pull request's title and every commit message on the branch. The working language
is declared in `capabilities.toml` (`working-language`), so a check follows the declaration.

## Options

1. **English for the files and the text beside them, held by a writing rule, a gate over the tracked files, a
   `commit-msg` hook and a pull-request check, each following the declared working language**
2. `docs/` kept in Chinese — rejected: its reason weighed translating into every UI language, which one working
   language does not involve, and it shuts out contributors who read no Chinese.
3. Terminal output only — rejected: a half-converted repository is harder to maintain than either single language.
4. `docs/` only — rejected: comments carry the causes, so a reader of the conclusions alone walks into the traps
   the comments warn of.
5. Both languages side by side — rejected: two copies drift, and which is the truth becomes a dispute.
6. Developer logs left in Chinese — rejected: it puts one Chinese-reading developer's debugging above contributors
   reading the repository at all.
7. A writing rule alone — rejected: Chinese commit subjects kept landing with nothing to stop them.
8. A hook alone — rejected: `git commit --no-verify` bypasses any local hook unnoticed.
9. CI alone — rejected: feedback comes only after the push, from the layer most easily unavailable.
10. A hook through `core.hooksPath` with no dependency — rejected: it is skipped with one hint when it loses its
    executable bit, and has no recovery point where `node` is not on `PATH` (nvm, GUI clients).
11. simple-git-hooks — rejected: git ignores `.git/hooks` once any `core.hooksPath` is set, so the hook can go
    inert without a message.
12. lefthook — deferred: parallel and staged-file runs are not needed for one hook. Reopen with a second hook,
    above all one on staged files.
13. A workflow on `issues` events — rejected: GitHub cannot stop an issue from being opened, so it could only
    comment afterwards, and agents writing issues follow the writing rule.
14. A Japanese working language skipped as Chinese is — rejected: the check tells Chinese by code point and Japanese
    uses Han characters too, so a skip would check nothing while looking checked.

## Decision

We adopt **option 1**.

- **Scope**: source comments, the engineering documents under `docs/`, test names and descriptions, terminal
  output, commit messages, pull-request titles and bodies, and issues and their comments.
  Outside it are release notes and the copy written for the product's readers in their own language: the app's
  source dictionary (ADR-0014), the landing page, the prototypes' mockups and the Chinese README.
- **The rule**: Chinese may be cited, inside backticks, quotes, corner brackets or a closed fenced code block, and
  never written.
- **By declaration**: a Chinese `working-language` turns the checks off, and they say so; a Japanese one, or none
  declared, fails them; any other language is checked.
- **Layers**: the writing rule; `scripts/check-lang.mjs` over every tracked file, whose exemptions are shapes, never
  counts; a husky `commit-msg` hook; and the `Message language` workflow over a pull request's title, body and every
  commit, a required check ([the CI runbook](../ops/ci.md)). Issues have the writing rule alone.

## Consequences

- Positive: a contributor who reads no Chinese can read why, not only what, and the boundary is decidable:
  everything but the product's copy is English.
- Positive: gates hold the boundary rather than vigilance, sharing one definition of Chinese and of a citation, and
  what reaches `main` is checked twice: before the commit exists, and in the pull request.
- Negative: no gate can tell whether the English is correct.
- Negative: the owner writes their own engineering documents in a second language, at some cost in precision.
- Negative: `--no-verify` bypasses the hook, and a worktree that predates `.husky/` or has not run `pnpm install`
  has none; the required pull-request check catches both before merge.
- Negative: issues are not checked mechanically.
- Negative: the hook knows comment lines by `core.commentChar` alone, falling back to `#` under `auto` or a
  multi-character `core.commentString`, so a git template commented otherwise can reject that one commit.
- Neutral: Chinese commit subjects already in history stay as they are.

## Sources

The owner's decisions of 2026-08-09 (the working language) and 2026-10-08 (the text beside the files). The squash
composition, from the repository settings: `squash_merge_commit_title: COMMIT_OR_PR_TITLE`,
`squash_merge_commit_message: COMMIT_MESSAGES`. husky 9.1.7's source: the `sh -e` wrapper and
`~/.config/husky/init.sh`. Why the exemptions are shapes and not counts is in the header of `scripts/check-lang.mjs`.
