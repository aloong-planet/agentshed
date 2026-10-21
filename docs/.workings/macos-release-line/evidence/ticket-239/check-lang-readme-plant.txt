# check:lang reads README.en.md: a Chinese word planted in its install steps, then restored (at 3064371, 2026-10-21T12:06:10.021Z); CJK in the output is escaped

## planted at README.en.md line 15
$ node scripts/check-lang.mjs
✗ Working language: found 1 problem(s)

    README.en.md:15  3. Open Agentshed from Applications. The first time, macOS asks once whether to open an app download
    ↳ not permitted by: the language switcher rows and the selector list — a language is named in its own script

The repository’s working language is English (ADR-0017). Translate the Chinese above, or, if it genuinely has to stay,
widen a rule in scripts/check-lang.mjs — stating what shape of Chinese is permitted, and why. Never a line count:
a count records what is true today, not why it is allowed.
(exit 1)

restored identical: true

## restored
$ node scripts/check-lang.mjs
✓ Working language: 2251 line(s) of Chinese, each permitted by a stated rule
    rule · 1 file(s) · side-count detection patterns quote the languages they scan; pattern literals only, not prose
    rule · 1 file(s) · the source-language dictionary — the values are the copy itself, while the comments are English like the rest of the repository
    rule · 1 file(s) · the landing page’s two-language dictionary (landing-page::CON-002) — the Chinese values are the page’s copy, while the comments are English
    rule · 16 file(s) · code that asserts against, or explains, Chinese copy — the Chinese is the thing under test or the thing being quoted, never prose
    rule · 3 file(s) · documents quoting Chinese values, patterns and superseded code as evidence
    rule · 38 file(s) · UI prototypes — the mockup shows a Chinese interface to a Chinese-reading reviewer; the tooling beside it gets no exemption
    rule · 1 file(s) · the Chinese README — a localisation is written in the language it localises into
    rule · 2 file(s) · the language switcher rows and the selector list — a language is named in its own script
(exit 0)
