# Reviewer notes: prototype-install.html

## Question

How installing a global skill into a project, and uninstalling a project-level copy, read in the Skills install
feature. The page answers the form and timing of:

- the "Install to…" (「安装到…」) picker, opened from a row of the Agents page's Skills section, which is the
  install source: its target rows, each with one mark per directory the copy would land in — CC for
  `.claude/skills`, GK for `.grok/skills`, and for the shared skills directory `.agents/skills` one outlined mark
  naming the sides that load it (CX AG); a stale project listed disabled; a project that already holds a skill of
  that name where it would land tagged "Same name installed" (「已装同名」);
- the notice an install gives: installed, installed into the project's shared directory, blocked by the same
  name, or the project not on the skill's sides;
- the uninstall confirmation: the full path to be deleted and, for a copy in the shared directory, the sentence
  that every side loading it loses the skill.

Where each case is drawn: every picker lists "New project" disabled as stale; `tdd` into Transfer is tagged and
blocked by the same name; agy-demo, registered on Antigravity only, still shows the shared mark naming CX AG;
`decision-form` (Codex only) or `release-notes` (Antigravity only) into agentshed or openclaw-v3 (registered on
Claude Code and Grok) has no landing and gives the not-on-the-skill's-sides notice; the two "Uninstall"
(「卸载」) buttons under the project-level copies open the confirmation for a `.claude/skills` copy and for a
shared-directory copy.

## Structure basis

- The app window and the navigation rail, with the Agents entry current: as every prototype page draws them (the
  shared app window and rail pieces).
- The global skills list stands for the Agents page's Skills section: one merged column with the side badge slots
  CC CX GK AG, as on the Agents page prototype; the "Install to…" button on a row is the one the skills view
  prototype draws on its rows. The side badges and their colours are the Agents page's.
- The project-level copies stand for project detail's Skills section: the groups 「项目级 · .claude/skills」 and
  「共享 · .agents/skills」 with the CX AG badges, as the project detail prototype heads them.
- The shared skills directory as one landing with one result, marked once with both sides that load it whatever
  the project is registered on: the direction the owner confirmed, stated in the skill-install spec (REQ-001,
  REQ-002).

## Demo scaffolding

The page has no demo harness. The interface language, light/dark and colour scheme follow the gallery's settings
and the settings prototype; the page has no switch for them.

- The heading 「Agents · 全局 Skills(安装源 · 合并单列 · 只读,内容变更不经 app)」 and the line under it
  (「徽标 = 该侧全局库是否存在;…」): reviewer annotations — not part of the design; do not implement. They stay in
  Chinese in every language. In the product the list sits in the Agents page's Skills section, under that page's
  own chrome.
- The heading 「Transfer · 项目级副本(演示卸载,实际入口在项目详情 ↗ Skills 分栏)」, its 「项目详情 ↗」 link to the
  project detail prototype, and the remarks after the two group labels (「(仅项目级可卸;全局层 skill 无卸载入口)」,
  「(一处落地,两侧都加载)」): reviewer annotations — not part of the design; do not implement. They stay in Chinese
  in every language.
- The project-level copies section on this page: a stand-in set beside the library only to open the uninstall
  confirmation — not part of the design; do not implement on the Agents page. In the product an uninstall button
  sits on each project-level entry in the Skills section of that project's detail page.

## Invalidated conclusions

- The global skills list's rows (name, side badges, 「软链」 pill, description, "Install to…"): the row's form is
  not this page's to settle. The skills view prototype and the skills-view spec's UI decisions are authoritative: a
  row shows no description and carries the expansion arrow, the package stats and the install button.
- The notice at the bottom centre: this page shows one notice at a time and hides it after 2.6 s. Its timing and
  stacking are the shared toast's, which the Agents page, project detail and session view prototypes draw: notices
  stack and each leaves after 3.2 s.
