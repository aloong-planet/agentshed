# Project capabilities

Skills branch on this table; the convention that defines it lives in the global AGENTS.md.
**A capability belongs here only if some skill's rule takes "is it enabled" as a precondition**;
facts that merely shape how this project writes code, with no skill branching on them, do not.

| Capability | State | Detail |
|---|---|---|
| i18n | enabled | Six languages (Simplified Chinese / English / French / Russian / Spanish / Japanese), source language Simplified Chinese, dictionaries in `src/shared/i18n/`. Missing translations are caught by the type alignment, unextracted copy by `pnpm check:i18n`. |
| Enumeration wording gate | enabled | `pnpm check:ui`'s agent-side name and count rules over the dictionaries; exemptions are listed in the script by dictionary key, each with its reason and the condition that retires it. |
| Working-language gate | enabled | `pnpm check:lang` — the repository's working language is English (ADR-0017); exemptions are shape predicates, never line counts. |
