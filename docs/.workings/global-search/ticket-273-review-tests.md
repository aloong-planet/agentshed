# Test review — #273

Ticket: [#273](https://github.com/aloong-planet/agentshed/issues/273) · feature `global-search` · branch
`feat/global-search-shortcut`. Scope: the application menu's new item (a unit at the template's seam) and the way
it opens the search page with the focus in its box (e2e through the application menu).

## Design review

Checked 2026-10-20. Implementation version: 84d5ae0 (main, where the work began). Requirement source: the
global-search spec (US-004/AC-01, AC-02, J10, CON-004 for the menu item) and the i18n spec's application menu, as
quoted in #273.

### Test design table

Seams: the menu template, a pure function of the language and the injected actions (`app-menu.test.ts`, the
precedent for every menu item); and e2e under the built app over #271's fixture home, where the native menu is
reached as the application-menu e2e reaches it — the installed item taken by its id in the main process and its
own click called, which runs the handler a click runs. Focus is asserted with Chromium's focus emulation turned on
through CDP, as `token-span.spec.ts` does, since the test window is never shown.

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| U1 (new) | app-menu.test · "Search Sessions…" in the Edit menu | US-004/AC-02 (place, accelerator, copy); CON-004 for the item | the template | each of the six languages | the Edit menu's last three entries are the select-all role, a separator and the item (`id` `searchSessions`, `accelerator` `CmdOrCtrl+Shift+F`); its label is the language's own and differs between languages; English "Search Sessions…" and French "Rechercher dans les sessions…" as literals; no other item in the menu carries the accelerator | none | none |
| U2 (changed) | app-menu.test · the injected actions | US-004/AC-02 ("does what the shortcut does": the item calls the action, it touches no window) | the template | every item's click called in menu order | the actions called, in order: updates, settings, search — literals | none | none |
| E12 (new) | global-search.spec · ⌘⇧F through the application menu | US-004/AC-01 (from settings, from a session page, from the search page itself); US-004/AC-02 (the installed item and its copy after a language switch); J10 | e2e; the item's own click; focus emulation | the installed Edit menu read; a keyword typed on the search page, then settings and the item; a hit's session page, then the item; the search page with the focus moved to its sort switch, then the item; the language switched to French in settings, then the item | the installed Edit menu ends with a separator and the item ("Search Sessions…", `CmdOrCtrl+Shift+F`); each time the search page shows with the keyword as left and its box focused; after the switch the installed item reads "Rechercher dans les sessions…" (polled) and opens the page, titled "Recherche", its box focused — literals | #271's home | one launch |
| Header (changed) | global-search.spec · its known-gaps note | — | — | — | the note that focus is not asserted goes, as E12 asserts it; a note for the keystroke itself comes in (below) | — | — |

The keystroke itself. Measured 2026-10-20 on this branch's base build with the existing ⌘, item: in the test's
window, neither Playwright's key press nor Electron's `webContents.sendInputEvent` reached the application menu — the
page stayed on Agents (why is not established here; the observation is what the design rests on)
([probe](evidence/ticket-273/probe-accel.spec.ts), [output](evidence/ticket-273/probe-accel-output.txt)). So the
binding is asserted on the installed item, the handler through the item's click, and the key press itself is not
automated; the test file's header states it.

Capability: per the project's capability declaration, `mutation-testing` is not enabled, so mutation testing is
skipped. Red first is required only of a test reproducing a bug; none of these does.

### Dimension 1: Coverage

The spec units this ticket owns, against the table: US-004/AC-01 E12 from settings, from a session page and from the
search page itself ("from any page"); US-004/AC-02 U1 (place, accelerator, copy in each language), U2 (the action),
E12 (the installed item, its copy after a switch, and the item doing what the shortcut does); J10 E12; CON-004 for
the item, the gates (`pnpm typecheck` fails on a key missing in a language, `pnpm check:i18n`) and U1. The i18n
spec's application menu line is AC-02.

Derived boundary, from "from any page": the search page itself, with the focus elsewhere — the page does not
remount there, so its box's own autofocus does not run; E12 drives it by moving the focus to the sort switch
first.

Each claimed boundary names its input: settings is reached by the rail's settings item; the session page by a hit;
the focus elsewhere by a click on the sort switch; the language by the settings page's selector.

Not covered, and stated: the key press itself (above); which language macOS draws the menu in (the i18n spec's
known gap — the installed item's label is asserted, not what is drawn).

Fixture: #271's home, unchanged; nothing here reads a data shape of its own.

### Dimension 2: Case design

No red flag. No module of the project is replaced (U1, U2 call the template; E12 runs the built app). Nothing private
is read; the installed menu is read through Electron's own menu API in the main process, the precedent's way. No
state is written around the window: the item's own click is the menu's path, and every other step is a click or a
keystroke in the window. No call count; U2's order is the menu's own order, the thing the test names. Focus
emulation changes how the hidden window reports focus, not which element the page focuses.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: the focus assertion follows a step that moves the focus away (the sort switch) or a page switch,
  so a box that keeps a stale focus cannot pass it; U1's "no other item" needs the whole menu read.
- Tautology: the expected values are literals (the English and French copy, the accelerator, the id, the order);
  U1's per-language label is compared with the dictionary and, separately, between languages, so a hard-coded label
  fails it.
- Stale path: the assertions read the menu the main process installs today and the page the rail shows today.

### Dimension 4: Resource reuse

The build, once per `pnpm e2e`; E12 one launch through the file's `launch`, with its own home and userData, as every
case here does; U1 and U2 none.
