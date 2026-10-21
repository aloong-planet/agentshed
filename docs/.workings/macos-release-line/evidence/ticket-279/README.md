# Evidence — ticket #279

The browser measurement record and the raw outputs behind #279's Evidence items (the landing page's memory and
search steps and its pinned features section). Taken on 2026-10-21 on branch `feat/landing-global-search`, against
a fresh build of `site/` served by `astro preview`, in Google Chrome 155 driven by Playwright. The download's two
reads fail in the browser, so the page is in the list state and nothing reaches the network. The rows M1–M8 and E1
are the test design table's in [ticket-279-review-tests.md](../../ticket-279-review-tests.md).

| File | What it holds |
|---|---|
| [measure.mjs](measure.mjs) | The measurement script: geometry and computed styles, never pixels (landing-page Testing Decisions). How to run it is in its header |
| [results.json](results.json) | Its last run: every measurement with its value and verdict |
| [screenshots/](screenshots/) | The features section at 1280×800 on its first and third steps, in both languages and both appearances, and the stacked steps at 400px |
| [shots-check.txt](shots-check.txt) | The site's fourteen screenshots against the confirmed prototype's: byte-identical, with their sizes and hashes |

## By item

| Item | Measurement |
|---|---|
| landing-page::REQ-004/AC-01, Failure C3 (M1) | At 1280×800 and 1280×560, at 0, 2.5 and 5 turns: the showcase pinned at the header's 58px bar; only the text column and the screenshot stage in it; the column narrower than half the screenshot; the screenshot and the text whole below the header; the third step's count "03 / 06" |
| landing-page::REQ-004/AC-08, Failure C1 (M2) | At 21 scroll positions from 1.5 turns before the pin point to 8 turns after it, the current text and screenshot are the step written out for that position (both sides of every boundary); past the showcase the last step; a jump to the download section and back lands on the step of the new position; a real 300px wheel over the screenshot scrolls the page by 300px |
| landing-page::REQ-004/AC-05, Failure C6 (M3) | Turning through all six steps: the count, the title and the screenshot stage keep their positions; the other five texts and screenshots compute `visibility: hidden`; the point at the stage's centre belongs to the current screenshot; the fade is 0.3s, and 0s under reduced motion |
| landing-page::REQ-004/AC-06 (M4) | At 400px: no showcase; six stacked steps, each with its screenshot; at least 44px between a screenshot and the next title |
| landing-page::REQ-004/AC-07, Failure C5 (M5) | A real click on the other language at each of the six steps keeps the step and the showcase's block within 1px of its place. Control: with session storage blocked the step is lost, so this measurement can fail |
| Failure C2 (M6) | After 1280 → 700 → 1280 wide, and after 800 → 600 tall, the step is the one the position gives by the spec's rule, computed independently of the page's script |
| Failure C7 (M7) | At 1280 without scripts: the showcase hidden, the six stacked steps and their screenshots shown |
| landing-page::QR-001/AC-01, REQ-006, Failure D1 (M8) | At 400, 900, 1280 and 1440px, both languages, light and dark: no sideways scroll; the hero's gutters; the steps' title and text in the app's text colours |
| landing-page::REQ-005/AC-01, AC-02, Failure E2 (E1) | [shots-check.txt](shots-check.txt) |
