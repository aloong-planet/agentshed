# Evidence — ticket #232

`native-menu.png`: the owner's screenshot, 2026-10-14, of the application menu as macOS draws it
(app-update::REQ-005's Evidence — the picture automation cannot read). The build is a local
`pnpm dist:mac:local` package of branch `feat/menu-check-updates`, built from the tree committed as 2b1b703
(no source or build file changed after the build; 03e4847 changes only a record), launched with a temporary
userData of its own while the development instance ran on the shared one.

What it shows:

- The "Agentshed" menu: "About Agentshed", then "Check for Updates…" directly below it and enabled (under the
  pointer); then a separator, "Settings ⌘,", a separator, "Hide Agentshed", "Hide Others", "Show All", a
  separator and "Quit Agentshed" — the order of the template's application submenu.
- The copy is English, and the interface language behind the menu is "Follow system", resolved to English.
- A toast "Couldn't check for updates" at the bottom of the window. The only toast with this copy is a menu
  check's failed outcome (settings checks report in their line), so it is a menu check against the real
  feed, made while the repository has no release yet. The settings line shows the same outcome of an earlier
  "Check now".
- Around the menu: part of the terminal the build was launched from (tab titles, the launch command,
  fragments of the conversation). Not part of the evidence.

Not shown here: the menu after a language switch (read by e2e from the installed menu) and the item greyed in
a development run (the template unit and e2e).
