# Review — code (step 5), message language

Date: 2026-10-08 · Scope: the shared module `scripts/lib/working-language.mjs`, the refactor of
`scripts/check-lang.mjs` onto it, `scripts/check-message-lang.mjs`, the husky `commit-msg` hook, the
`Message language` workflow, ADR-0030 and the extension note on ADR-0017. No spec by decision.

## ① Underlying premises — no finding

- Squash merges copy the PR title plus every branch commit message — read from the repository settings
  (`COMMIT_OR_PR_TITLE`, `COMMIT_MESSAGES`) and confirmed on merge commits in `master`.
- husky 9.1.7 behaviour (sets `core.hooksPath` to `.husky/_`, runs `.husky/<hook>` with `sh -e`, no
  executable bit, `init.sh`, `HUSKY=0`) — read from the published package source.
- The corner-bracket defect existed in `check-lang` before this change — reproduced with the `HEAD`
  version on a probe file (exit 1 on a correct citation).
- The escaped CJK class equals the old literal class — compared over all 65 536 BMP code points: 0
  differences. The quoting pairs are the same seven, now as escapes.
- Not established, and not needed: whether git strips comment lines before or after the `commit-msg`
  hook. The script strips them itself, so the outcome is right either way.

## ② Runnability — two findings, both self-contained (one message), for the user's decision

- Paths checked: zh / zh-Hant skip; ja unsupported; undeclared and missing file fail; file, stdin and
  commit-range inputs; comment lines and the scissors line; `core.commentChar` set to `;`; CI checkout
  of the merge ref (both `base.sha` and `head.sha` are ancestors of it with `fetch-depth: 0`); a range
  where master advanced after the PR opened (`base..head` excludes master's commits).
- **Finding 1 — `core.commentChar = auto` and `core.commentString` are not handled.** With `auto`, git
  picks the comment character itself and the hook cannot know which; the script falls back to `#`. A
  localized (Chinese) git template commented with another character would be reported, rejecting that one
  commit. Escape surface: self (one message); `--no-verify` and the CI layer remain.
- **Finding 2 — Chinese inside a multi-line fenced code block is reported.** Quoting spans are per line,
  so the lines between ``` fences are judged as prose. A PR body quoting Chinese output in a code block
  is a citation, and would fail. `check-lang` has the same behaviour on markdown files (consistent, but
  rarer there). Escape surface: self (one message or file).

## ③ Security — no finding

Pull-request title and body reach the script only through environment variables; a title carrying
`"; echo …; "$(touch …)` was checked as text and nothing executed. The commit range comes from SHAs in
the event payload, passed the same way.

## ④ Consistency — one class-level finding, fixed

- **Quote marks that are themselves CJK were reported as Chinese written outside a quote**
  (class-level: "a delimiter that falls inside the CJK class"). All eleven quote characters enumerated:
  only U+300C/U+300D (corner brackets) fall in the class. Fixed in the shared module by counting the marks
  as part of the span; `check-lang`'s result on the repository is unchanged.
- `check-lang`'s permitted-line count moved from 2378 to 2375: exactly the three lines that moved into
  the shared module and became escapes (verified line by line); every rule's file count is unchanged.
- Smell baseline on the new code: no hit.

## Refactor list (for the user)

| # | Item | Escape surface | Recommendation |
|---|---|---|---|
| 1 | Handle `core.commentString` and `commentChar = auto` | self | Not now: `auto` cannot be inferred reliably; state the limit in the script header and ADR-0030 |
| 2 | Treat multi-line fenced code blocks as quoting spans in the shared rule | self | Now: both gates gain it at once, with mutation cases |

**User decision (2026-10-08): 1 not done, 2 done.** Item 1 is stated as a limit in the script header and
in ADR-0030's consequences. Item 2: `fencedLines` in the shared module (closed fences only; backticks or
tildes; info string allowed; the closing fence at least as long and bare); `check-message-lang` applies
it to every message, `check-lang` only to files its parser cannot read, so a fence inside a code comment
still exempts nothing. `check-lang`'s result on the repository is unchanged (2375 permitted lines).
