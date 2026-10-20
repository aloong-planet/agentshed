# Code review — #273

Ticket: [#273](https://github.com/aloong-planet/agentshed/issues/273) · feature `global-search` · branch
`feat/global-search-shortcut`. Checked 2026-10-20 on 2882abc against 84d5ae0: the Edit menu's item and its action,
the menu event through the shared IPC names, the main process and the preload, the renderer opening the search page
and focusing its box, the six dictionaries, the menu unit and the e2e case.

## Underlying premises

- The key press. The first draft of the test file's header, the test review and the coverage checklist said why a
  synthetic key press does not reach the menu ("macOS hands it to the menu only for a key event the system
  delivered"). Only the observation is measured — neither Playwright's key press nor `webContents.sendInputEvent`
  turned the existing ⌘, into a page switch ([probe](evidence/ticket-273/probe-accel.spec.ts),
  [output](evidence/ticket-273/probe-accel-output.txt)) — so the three now state the observation and no cause.
- Focus in a window that is never shown: `token-span.spec.ts` turns on Chromium's focus emulation for it; E12 does
  the same, and its step that moves the focus to the sort switch, asserted not focused before the item, shows the
  emulated focus can be lost as well as gained.
- The page remounts on a page switch (it is drawn only while the search dimension is on) and its box's `autoFocus`
  runs then; on the search page itself nothing remounts, which is why the focus request exists. Read in `App.tsx`
  and `GlobalSearchPane.tsx`; E12's last two steps drive both.
- The copy: each of the four languages beyond the prototype's two follows the wording of the dictionary's own
  question search placeholder (French "Rechercher dans les …", Spanish "Buscar en las …", and the Russian and
  Japanese placeholders' own construction) and its word for sessions, read from the dictionaries.
- New comments: the App's and the preload's notes now speak of the menu's entry points without a count (the
  preload's said "two"); the rest state what the code does.

## Runnability

- The listener is removed with the others when the effect cleans up. The menu is rebuilt on a language switch
  with fresh actions, as before; E12 clicks the rebuilt item.
- Like the rail and the Settings item, the handler drops a pending jump from a hit (`jumpSeq`), so a menu choice made
  while a hit's session is still loading keeps the search page — the same as choosing Search on the rail.
- The focus effect runs on every mount as well as on each request; on mount it repeats what `autoFocus` does.
- Keyboard: no handler in the renderer reacts to ⌘⇧F (the window-level handlers take Escape; the language selector
  and the expandable blocks take Enter, Space and the arrows), so nothing competes with the accelerator.
- No error path is added: the main process sends with no payload to a window that may be gone (`mainWindow?.`),
  as the Settings item does.

## Security

One new event from the main process to the renderer, carrying nothing; the preload exposes a listener only, as for
the Settings item. Nothing to report.

## Consistency

- The item follows the Settings item's whole path — the template's injected action, an event name in the shared IPC
  table, the main process's `send`, the preload's listener, the renderer's subscription next to the Settings one.
- Duplicated Code: the preload's two menu listeners differ only in their event name. Exempt: the preload spells out
  each listener (the update and settings-check ones too); a shared helper would reshape the existing ones.
- Dictionaries: the new key sits with the Edit menu's items in all six; `check:i18n`, `check:ui` and typecheck green.
- No bug; no refactor item.
