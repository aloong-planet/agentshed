# ADR-0030: Commit messages and pull-request text follow the working language

- Status: Accepted (2026-10-08)
- Relation: **extends ADR-0017**, whose scope (comments, `docs/`, test names, terminal output) did not name
  the text that lives beside the code. ADR-0017's decision and exemptions are unchanged.

## Context

ADR-0017 made English the repository's working language and `check-lang` enforces it, but only over the
files in the repository. Commit messages, pull-request titles and bodies, and issues were covered by
neither the decision nor any check. In the week after ADR-0017 was accepted, 17 commits on `master` still
had Chinese subjects; English took over from habit after that, with nothing to keep it there. Pull-request
bodies lagged further: two merged after the commit subjects had switched were still written in Chinese.

What lands in `master` is not only the code: with the repository's squash setting, a merge commit is the
pull-request title followed by every commit message on the branch. Those are read by the same
contributors ADR-0017 was written for.

The working language is declared in `capabilities.toml` (`working-language`), and the check has to
follow that declaration rather than assume English.

## Options

1. **Writing rule plus two mechanical layers, conditional on the working language** — the GitHub
   writing rule tells agents which language to use; a `commit-msg` hook rejects a message at commit
   time; a CI workflow re-checks the pull-request title, body and every commit in its range. Issues
   rely on the writing rule alone. The check runs only when the working language is not Chinese.
2. Writing rule only — rejected: that is the state that let 17 Chinese subjects through after ADR-0017.
3. Hook only — rejected: `git commit --no-verify` bypasses any local hook, and nothing would notice.
4. CI only — rejected: feedback arrives after the commit is made and pushed, and CI is the layer most
   easily unavailable (Actions has been blocked by billing on this account since before this decision).
5. A hook installed by setting `core.hooksPath` to a committed directory, with no dependency — rejected:
   a hook file that loses its executable bit is skipped with a single hint and the commit succeeds, and a
   hook run from an environment without `node` on `PATH` (nvm, GUI clients) has no recovery point. husky
   runs the hook through `sh`, needs no executable bit, and reads `~/.config/husky/init.sh` for `PATH`.
6. simple-git-hooks — rejected: it writes into `.git/hooks`, which git ignores entirely once a
   `core.hooksPath` is configured anywhere, so the hook can go inert without a message.
7. lefthook — deferred: its parallel commands and staged-file runs are not needed for one hook.
   Reopen when a second hook is added, especially one that runs on staged files only.
8. Checking issues with a workflow on `issues` events — rejected: GitHub cannot stop an issue from being
   opened, so the workflow could only comment afterwards; issues are mostly written by agents that
   already follow the writing rule.
9. For a Japanese working language, skipping the check as for Chinese — rejected: the check tells
   Chinese by code point, Japanese is written with Han characters too, and a silent skip would leave a
   Japanese repository unchecked while looking checked. The check fails loudly instead.

## Decision

We choose **option 1**.

- **Scope.** The working language also governs commit messages, pull-request titles and bodies, and
  issues and their comments. Release notes are not covered: they are written for end users.
- **The rule** is the one `check-lang` applies to prose: Chinese may be **cited** — inside backticks,
  quotes, corner brackets or a closed fenced code block, e.g. a UI string or a log line under
  discussion — never **written**. An unclosed fence exempts nothing, so a stray fence cannot turn the rest
  of a message into a citation. Both gates take the rule from one shared module, so they cannot drift
  apart; `check-lang` applies the fence rule only to files its parser cannot read (markdown), leaving code
  to the parser's literals.
- **When it applies**, by `working-language` in `capabilities.toml`: a Chinese tag (`zh`, `zh-Hans`, …)
  → the check does not apply and says so; Japanese → the check fails as unsupported; not declared → the
  check fails, because a config value has no default; any other language → checked.
- **Layers.** The GitHub writing rule (agents); a husky `commit-msg` hook (every commit made locally);
  a `Message language` workflow on pull requests (title, body, and each commit from base to head).
  Issues: writing rule only.
- The workflow becomes a required check only after it has run successfully once; a check that has never
  run cannot be shown to work, and requiring it would block every pull request.

## Consequences

- Positive: what reaches `master` is checked twice — at commit time and again in the pull request —
  and the commit-time check fails before the commit exists, where fixing it costs nothing.
- Positive: the two working-language gates share one definition of "Chinese" and of "cited", so a fix to
  one is a fix to both. Writing the message gate exposed that corner brackets — themselves CJK
  punctuation — were reported as Chinese written outside a quote; the shared rule now counts the marks as
  part of the span, for both gates.
- Negative: `core.hooksPath` is repository configuration, shared by every worktree. A worktree whose
  checkout predates `.husky/`, or that has not run `pnpm install`, has no hook and commits unchecked
  without a message; the CI layer is what catches those commits.
- Negative: any local hook can be bypassed with `--no-verify`; the CI layer exists for that, and until
  CI runs again on this account the bypass is unguarded.
- Negative: issues are not mechanically checked.
- Negative: the hook recognises comment lines by `core.commentChar` only; with `commentChar = auto` or a
  multi-character `core.commentString` it falls back to `#`, and a localized git template commented
  otherwise can reject that one commit. Inferring `auto` reliably is not possible from inside the hook.
- Neutral: the existing Chinese commit subjects in history are not rewritten; the checks cover new
  commits only.

## Sources

Decided by the user on 2026-10-08. Commit-subject counts measured with `git log` over `master` from
ADR-0017's acceptance. Squash-merge composition read from the repository settings
(`squash_merge_commit_title: COMMIT_OR_PR_TITLE`, `squash_merge_commit_message: COMMIT_MESSAGES`) and
confirmed against the merge commits on `master`. husky's behaviour read from its 9.1.7 source (the
`core.hooksPath` it sets, the `sh -e` wrapper, `init.sh`, `HUSKY=0`). The corner-bracket defect was
reproduced against `check-lang` as it stood before this change.
