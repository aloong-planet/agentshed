# Appearance

## Overview
Users who want the app to look the way they are used to can decide its **light/dark mode** and its
**theme** separately. The two are independent and combine freely; a choice applies to the
whole UI immediately and is still there next time the app opens. Nothing is written to the agent
configuration.

## Capabilities
- The "Appearance" section of the settings dimension (the settings entry at the foot of the rail) is one card with two rows: "Mode" on
  top and "Theme" below (the same page also has a "Language" section, see
  [UI language](i18n.md))
- Three **modes**: **follow system** (default), **light**, **dark**
- With "follow system" selected, the UI's light/dark follows the macOS system appearance; change the
  system appearance and the app changes with it
- Choosing "light" or "dark" **locks** it: system appearance changes no longer affect the app until
  you switch back to "follow system"
- Switching from a locked mode back to "follow system" immediately re-decides from the current system
  appearance rather than staying on the previously locked one
- Three **themes**: **purple** (default), **mist blue**, **amber brown**, each card showing a
  swatch and a name
- Swatches are sampled in the currently effective light/dark — what you see in dark mode is the dark
  version, as it will actually look
- Mode and theme do not affect each other: changing one leaves the other alone, and all six
  combinations of 3 themes × 2 modes are valid
- A switch applies to the **entire UI** immediately (lists, detail pages, sessions, toasts, overlays
  and drawers, rendered markdown, and everything else following the theme), with no save button
- The window chrome and the application menu follow the chosen mode too, so there is never a split
  between a dark app and a light window frame
- Both preferences are persisted and survive a restart
- Entering and leaving settings does not lose the currently selected project
- Everywhere markdown is rendered (skill files, memory and configuration documents, the reading
  overlay) headings share **one visual hierarchy**: a ruled first level, a bar-marked second, a
  lighter-accent third, and muted deeper levels — adjacent levels (third vs fourth in particular)
  stay tellable apart in every theme, light or dark
- Code looks the same everywhere too: inline code as a bordered pill, fenced blocks as a bordered
  paper inset — no dark terminal-style block in one place and a light one in another; lists indent
  the same everywhere as well
- Tables render as tables everywhere: a bordered frame with clear column separators, a tinted and
  centred header row that never wraps, striped rows, and column alignment written in the markdown
  (`:-:` / `--:`) is respected in the body — previously they showed as bare unstyled text columns
- Scrollbars are slim everywhere — lists, pages, drawers, code blocks and wide tables: a narrow grey
  thumb with no track behind it, shown whenever there is more to scroll and darker under the pointer.
  It suits light and dark alike (no light strip beside a dark list), stays the same in every theme, and
  looks the same with a mouse or a trackpad

## Boundaries and non-goals
- The side badges and the provider chart's colours are unaffected (semantic colours do
  not change hue with the theme)
- Nothing is written to the agent configuration
- Light/dark does not switch automatically by time of day (no sunrise/sunset, no schedule)
- No custom colours, and no fourth theme
- Scrollbars do not fade out when idle, as macOS's own can on a trackpad: the thumb stays in view
  whenever there is more to scroll
