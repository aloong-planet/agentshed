# Document sync checklist — #238

Ticket: [#238 The landing page offers the release that exists](https://github.com/aloong-planet/agentshed/issues/238) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| If the implementation departs from the spec, rewrite the spec in the same change; when the ticket is delivered, remove this row with a note if nothing departed | [landing-page spec](../../specs/landing-page.md) | Pending: not started |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Pending: not started |
| Before the UI admission check for the test state: set the landing prototype's dark `--warn-bg`/`--warn-fg` (`#3a2516`/`#f6b48a`) to the app's purple dark values (`#3c2417`/`#f0a884`). The page must use the app's palette (landing-page::REQ-006), and the site's palette test holds every shared token to the app's value, so the prototype would otherwise disagree with the page. Found in #237's code review; the owner chose to fix it here (2026-10-18) | [landing prototype](../../prototypes/landing-page/prototype-landing.html) | Pending: not started |
