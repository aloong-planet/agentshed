# Evidence — ticket #237

The browser measurement record and the raw outputs behind #237's Evidence items. Taken on 2026-10-18 on
branch `feat/landing-page` (cut from 26b9216), against a build of `site/` served by `astro preview`, in
Google Chrome 155 driven by Playwright 1.62. Chinese characters in these files are written as `\uXXXX`
escapes: the repository's working language is English (ADR-0017).

| File | What it holds |
|---|---|
| [measure.mjs](measure.mjs) | The measurement script: geometry and computed styles, never pixels (landing-page Testing Decisions). How to run it is in its header |
| [results.json](results.json) | Its last run: 216 measurements, each with its value and verdict, all passing |
| [screenshots/](screenshots/) | The hero, the features section and the install and download sections in both languages and both appearances at 1280×900, and each page whole at 400px |
| [ac04-prototype-vs-site.txt](ac04-prototype-vs-site.txt) | Click offsets of the four feature steps on the confirmed prototype and on the site, four window sizes |
| [ac07-control.txt](ac07-control.txt) | The language switch with session storage blocked: the place is not kept, so the AC-07 measurement can fail |
| [mutations-site-tests.txt](mutations-site-tests.txt) | The mutation runs that show each site test written after its code can fail |
| [check-lang-mutations.txt](check-lang-mutations.txt) | The working-language gate with its two new rules: green, then red for a Chinese comment in the site's dictionary and for Chinese written into a component |
| [theme-vars.txt](theme-vars.txt) | `/ui-design`'s palette measurement over the site's stylesheet |
| [shots-sha256.txt](shots-sha256.txt), [approved-sha256.txt](approved-sha256.txt) | The site's ten screenshots and the approved set of 2026-10-13: identical hashes |

## By item

| Item | Result |
|---|---|
| landing-page::US-001/AC-01 | The hero's parts in both languages (`screenshots/*-hero.jpg`); built-site check |
| landing-page::US-003/AC-01 | Four steps in order with their screenshots (`screenshots/*-features.jpg`, `*-400-full.jpg`); built-site check |
| landing-page::REQ-003 | Navigation hidden at 400px and shown from 900px; the toggle at the bar's right edge (within 1px) at every width; the header at the top after scrolling 3000px; 34 of 34 |
| landing-page::REQ-004/AC-01 | At 1280 and 1440 in both languages, every 60px through the section: the frame shows the step nearest its middle, the steps come in order, and the frame stays put at its sticky offset (286px at 900px tall; its middle 1.3px from the middle of the space below the header) |
| landing-page::REQ-004/AC-02 | Computed: the current step's bar is the accent at 3px with the text colour title, the others the line colour with grey titles; a hovered step the strong line colour and the text colour; the current step keeps the accent while hovered |
| landing-page::REQ-004/AC-03 | Each step 0.34 of the window's height; with the second step current, the first and third partly in view |
| landing-page::REQ-004/AC-04 | The middle two steps land within 0.3px of the frame's middle on a click and on Enter. The first and last stop 41.3px short at 900px tall, with the frame at the section's start and end, as AC-04 now says (the owner's call, 2026-10-18); the confirmed prototype has the same offsets (`ac04-prototype-vs-site.txt`). Keyboard focus: a 2px ring at −2px offset, inside the step's box |
| landing-page::REQ-004/AC-05 | A cross-fade (both screenshots partly opaque 120ms into a switch); after it, one screenshot visible, hit by the pointer and alone in the frame's accessibility tree; under reduced motion no transition and the new screenshot opaque at once |
| landing-page::REQ-004/AC-06 | At 400px: no frame, each screenshot 18px under its text, a 44px gap before the next title |
| landing-page::REQ-004/AC-07 | Switching language in both directions keeps the current step at the same height (within 1px), from the features section, from the install section and at 400px; blocked storage defeats it (`ac07-control.txt`) |
| landing-page::REQ-005/AC-01 | The ten shots are byte-identical to the approved set |
| landing-page::REQ-005/AC-02 | The hero 2560×1536, the whole window; every feature cut 1840×1035 (16:9). Reviewed: each cut ends on a row boundary, and the token cut stops at the per-model list, without recent sessions |
| landing-page::REQ-005/AC-03, Failure C4 | With the screenshots held back, every displayed one already has its declared height, at 400 and 1280px in both languages |
| landing-page::REQ-006, Failure D1 | Light computed values are the app's purple light values; switching the system appearance with no reload gives the dark ones; the screenshots carry no filter and full opacity in dark; the hero icon's shadow follows its outline in both (the owner's call, 2026-10-18); `theme-vars.txt`: 14 tokens, all varying with the appearance only |
| landing-page::QR-001/AC-01 (list state) | At 400, 900, 1280 and 1440px, both languages, both appearances: no sideways scroll (a control 2000px wide is caught), the download button inside the card's content box, the hero's parts inside its 24px gutters; 49 of 49 |
| landing-page Failures B1, B2 | `/en/` is English with the toggle on EN, and the toggle goes to `/`; the navigation's GitHub link opens the repository in a new tab; a section link scrolls within the page |
| landing-page Failures C1–C3 | A jump to the download section and back, and a wheel scroll, leave the nearest step shown; narrowing below 760px and widening again leaves no stale step; at 1280×560 the current step's text stays visible |
| Copy | Both dictionaries equal the confirmed prototype's copy table, item by item (28 of 28) |
