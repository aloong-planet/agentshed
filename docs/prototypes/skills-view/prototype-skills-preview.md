# Reviewer notes: prototype-skills-preview.html

## Question

How the two Skills lists let the user read a skill package (Skills view): the agents page's Skills section
(the global library, one row per name across every side) and a project's detail Skills section
(grouped by side and level, the plugin-bundled group last). A row expands into the package's flat file
table, with a side switcher when more than one side holds the skill and the depth notice when references
nest too deep; clicking a file opens the file drawer with its markdown preview; each list narrows by name
through its own search box, project detail's group counts following the filter and an emptied group
disappearing; and a name truncated by its column shows in full on hover. The mock spans the four agent sides
(CC, CX, GK, AG): an Antigravity global library entry, the shared `.agents/skills` group in project detail,
plugin rows that expand like on-disk rows, and a plugin row whose package cannot be found.

## Structure basis

- The window frame and the navigation rail, with Agents current, follow the prototypes' shared app window
  and app rail.
- The file drawer's frame follows the prototypes' shared file drawer, the one form the memory drawers of the
  agents page and project detail prototypes and the plugin skill drawer of the Plugins prototype also draw;
  its body is the shared markdown preview.
- The side badge slots (CC, CX, GK, AG in that order, a dashed 「—」 for a side without the skill) follow the
  agents page prototype's Skills section.
- The search box follows the sessions section's search box (the app's, also drawn on the project detail
  prototype), with the input only and without that section's scope toggle.
- The no-match empty state follows the app's existing no-match empty state.
- Project detail's grouping — a heading with a count above one card per group — follows the app's project
  detail Skills section.
- The row (expansion arrow, name, side badges, source / level / symlink pills, inline package stats,
  install and uninstall buttons), the flat expanded area, the drawer's title and subtitle, the search boxes
  and the hover tooltip are the confirmed direction of the Skills view.
- Colours come from the prototypes' shared theme; each of the page's own tokens maps to a theme token.

## Demo scaffolding

- The page has no demo bar: every state is reached through the design itself — typing in a search box,
  clicking a row, a side or a file.
- The annotations around the lists — the page heading 「Skills 包预览」, the three explanatory paragraphs
  under it, the section headings 「全局 · Agents Skills」 and 「项目详情 · Skills（同名只见项目级）」, and the
  palette note with its swatches at the bottom — not part of the design; do not implement. They stay in
  Chinese whatever the interface language. In the product the first list is the agents page's Skills
  section and the second a project's detail Skills section; the palette and light/dark are the appearance
  settings.
- The toasts 「已记录:安装到…」 and 「已记录:卸载」 (English 「Recorded: Install to…」, 「Recorded: Uninstall」)
  that 「安装到…」 and 「卸载」 show — not part of the design; do not implement. In the product 「安装到…」
  opens the install popover and 「卸载」 the uninstall confirmation, both drawn on the skill-install
  prototype (Agents·Skills 装卸交互).

## Uncovered dimensions

- Agent side, in the side switcher: no mock skill is held by all four sides' global libraries, so the
  switcher in the global list shows at most three sides (Claude, Codex, Grok) and never Antigravity.

## Invalidated conclusions

- The shared group in the project detail list, 「共享 · .agents/skills(CODEX · ANTIGRAVITY)」: its heading
  names the two sides in text rather than carrying their badges, its row's expanded area shows a Codex /
  Antigravity side switcher (the Antigravity side showing 「无包数据（antigravity:github-ops）」), and its
  drawer's subtitle names one side. Authoritative: the skills-view spec — skills-view::REQ-002/AC-01 (the
  heading "Shared · .agents/skills" carries the CX and AG badges), B6 (a project detail row has no side
  switcher) and the Antigravity failure modes (a shared entry's drawer subtitle names both sides).
- The second explanatory paragraph under the page heading, the walkthrough for 「d」: it says
  「CC 项目级与 CX 项目级整组消失」, but the page has no 「CX 项目级」 group — the project's `.agents/skills`
  is the shared group (skills-view::REQ-002/AC-01). Typing 「d」 empties the Claude Code project-level, shared
  and Antigravity global-level groups; what the lists show is authoritative.
- **Code in the rendered Markdown preview** (the shared preview piece): its keywords, strings and comments are
  coloured; they cannot be trusted. Authoritative: the appearance spec, E7e — code takes one text colour, with
  no syntax colouring.
