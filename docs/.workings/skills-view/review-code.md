# Review — code (step 5), #209: the file table's listing failure wording (2026-10-08)

Scope: `origin/main..HEAD` — two renderer lines (PluginSkillList, SkillExpandBlock), one e2e, specs
A11 / H10.

## ① Underlying premises — no finding

- "The table showed the raw IPC error" — measured, not assumed: the new e2e on the unfixed code
  received `Error: Error invoking remote method 'agentshed:list-skill-files': Error:
  agentshed-error:{"code":"skill-package-unavailable","params":{}}`. The preload passes this channel
  through `ipcRenderer.invoke` with no decoding.
- "The toast's sentence is `t.skills.listFailed(errorText(lang, error))`" — read from the effect
  directly below each changed line; the e2e compares the two rendered texts.
- The new comment states only what the line does and which spec item it follows.

## ② Runnability — no finding

`t` and `lang` are already in scope in both components (`useDict`, `useLanguage`). The table text is
recomputed on render, so it follows a UI language switch, while the toast effect still depends only on
`listResult` (A11's no-second-toast rule untouched). Escape surface: self-harm (one row's file area).

## ③ Security — no finding

The change removes an internal detail from the UI (the encoded error contract), and adds nothing.

## ④ Consistency — class-level check done, no other instance

"A caught error is rendered with String() instead of errorText": enumerated every `String(` and
`.message` in renderer source and every `toast('err', …)`. The two fixed lines were the only
instances; the 22 other error renderings already go through `errorText`; the two toasts without it
pass dictionary sentences, not caught errors. Smell baseline: the two components already duplicate the
toast line; the table line now mirrors it (no new duplication beyond the existing pair).

## Refactor list

None.

## Outside this change (reported, not fixed)

- `SkillFilesTable.tsx:95` formats line counts with `toLocaleString('zh-CN')` whatever the UI
  language, so digit grouping differs from the rest of a French or Russian UI. Needs the user's call
  on where it lives.
