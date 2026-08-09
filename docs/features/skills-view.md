# Skills view

## Overview
In the global Agents · Skills view and in project detail · Skills, an on-disk skill package's files
can be expanded and opened for reading. No cross-side content diff.

## Capabilities
- An on-disk skill row always shows its **file count and size**; **clicking the row** collapses or
  expands the package's file table (per-file line count, size, modification date), laid out flat with
  no indentation
- Where more than one side has the skill, the expanded area lets you switch sides to see each package
- **Clicking a file** opens a drawer to read it; markdown previews by default (frontmatter keys and
  values on separate lines) and can be switched to raw; non-markdown files show raw only
- When nesting goes too deep, a notice suggests restructuring the skill rather than listing the deep
  files
- Project detail: **within one side, a same-name pair shows only the project-level entry**; anything
  that exists only globally is still listed
- Plugin-sourced skills (namespaced entries) expand and preview on equal footing with on-disk skills
  (inline counts / file table / drawer; still no install or uninstall)
- The install/uninstall buttons and the expand/preview interaction do not steal clicks from each other

## Boundaries and non-goals
- List rows do not show the description (read the skill's description in the SKILL.md preview)
- No machine diff across agent sides
- Skills are never edited or written back
- Non-text files are not listed
