# Skills view

## Overview
In the global Agents · Skills view and in project detail · Skills, an on-disk skill package's files
can be expanded and opened for reading, and either list can be narrowed to the skill you are after by
typing part of its name. No cross-side content diff.

## Capabilities
- A **search box above each list** narrows it to skills whose name contains what you type, ignoring
  case; clearing the box brings the whole list back
- In project detail the one box narrows **all groups at once**: each group heading counts what
  survived the filter, and a group with nothing left disappears heading and all
- When nothing matches, the list says so — a different message from the one shown when there are no
  skills at all, so a full library is never reported as empty
- A skill name too long for its column shows itself **in full on hover**; names that already fit stay
  quiet
- An on-disk skill row always shows its **file count and size**; **clicking the row** collapses or
  expands the package's file table (per-file line count, size, modification date), laid out flat with
  no indentation. Collapsing and reopening the same row shows the table at once, quietly refreshed
  behind the scenes rather than reloaded from a blank state
- Where more than one side has the skill, the expanded area lets you switch sides to see each package
- **Clicking a file** opens a drawer to read it; markdown previews by default (frontmatter keys and
  values on separate lines) and can be switched to raw; non-markdown files show raw only
- **Links inside a previewed markdown work**: a relative link to another file of the same package
  switches the drawer to that file; a link pointing outside the package shows a notice instead;
  external links open in the system browser — none of them ever navigates the app away
- When nesting goes too deep, a notice suggests restructuring the skill rather than listing the deep
  files
- Project detail: **within one side, a same-name pair shows only the project-level entry**; anything
  that exists only globally is still listed
- Plugin-sourced skills (namespaced entries) expand and preview on equal footing with on-disk skills
  (inline counts / file table / drawer; still no install or uninstall)
- The install/uninstall buttons and the expand/preview interaction do not steal clicks from each other

## Boundaries and non-goals
- Typing matches the **name only** — not descriptions or file contents; rows do not show a description,
  so a match you cannot see would look like a malfunction
- Matching is a plain substring, not fuzzy: `gwd` does not find `grill-with-docs`. Matched text is not
  highlighted, and no match count is shown
- The keyword is not remembered: leaving the section or switching project clears it, while a refresh
  while you are still there keeps it
- The full name is revealed by hovering only; there is no keyboard equivalent (the whole name is also
  in the reading drawer's subtitle)
- List rows do not show the description (read the skill's description in the SKILL.md preview)
- No machine diff across agent sides
- Skills are never edited or written back
- Non-text files are not listed
