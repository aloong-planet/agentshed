# Evidence — ticket #238

The browser measurement record and the raw outputs behind #238's Evidence items. Taken on 2026-10-19 on branch
`feat/landing-download` (cut from 690ad2d, uncommitted), against a build of `site/` served by `astro preview`,
in Google Chrome 155 driven by Playwright 1.62. Except in `real-network.txt`, the two reads were answered in the
browser by the site's test fixtures (the pointer as the release script's own `pointRelease` writes it;
Transfer's public releases answer renamed to this repository), so nothing reached the network. Chinese is
written as `\uXXXX` escapes (ADR-0017).

| File | What it holds |
|---|---|
| [measure.mjs](measure.mjs) | The measurement script; how to run it is in its header |
| [results.json](results.json) | Its last run, on the final tree: 212 measurements, all passing |
| [screenshots/](screenshots/) | Each new state's hero and download section, in English light and Chinese dark at 1280px, and the download section at 400px |
| [ac07-late-control.txt](ac07-late-control.txt) | The language switch while a state lands late, with each mechanism that keeps the place switched off in turn |
| [keep-place-mutations.txt](keep-place-mutations.txt) | Two mutations of the place-keeping rule, each failing the measurement exactly where it gets the rule wrong |
| [prototype-geometry.txt](prototype-geometry.txt) | Section heights of the confirmed prototype and of the site in each new state, at 1280 and 400px |
| [con-003-search.txt](con-003-search.txt) | Every request API and every host in the site's source |
| [real-network.txt](real-network.txt) | The built page on the real network from a local origin, every request recorded (preflights included), and a control that shows a preflight |
| [mutations-site-tests.txt](mutations-site-tests.txt) | The site tests' mutation runs: each mutation's definition, the cases it turned red, the controls |

## By item

| Item | Result |
|---|---|
| landing-page::US-001/AC-02, REQ-001/AC-01, REQ-002/AC-01 | Pointer served: "Download Agentshed 0.2.0" downloads the R2 DMG in place (no target); "See every version on GitHub"; "Current version 0.2.0"; Download (R2, in place) and GitHub (the same DMG on GitHub, new tab). The GitHub button at rest on the card ground with the strong line, on hover the accent border on the soft accent ground |
| landing-page::REQ-001/AC-02, REQ-002/AC-02 | No pointer, a formal release on GitHub: every link on GitHub in a new tab, one Download button |
| landing-page::US-001/AC-03, REQ-002/AC-03 | Only pre-releases: "Download test version 1.2.0-beta" to the pre-release's page, the "Test version" pill on the platform line, the note, the pill before "Only a test version so far: 1.2.0-beta", one button |
| landing-page::US-001/AC-04, REQ-001/AC-03 | Neither read answers: the page stays as served, the release list. On the real network today: the pointer refused by CORS from a local origin, GitHub's `[]`, the list state (Failures A5, A1) |
| landing-page::REQ-002/AC-05 | GitHub links carry a new-tab target in every state; the R2 links none |
| landing-page::REQ-006 (the warning colours) | The pill and the note in the app's warning pair, light (`#fdecdc`/`#b3552f`) and dark (`#3c2417`/`#f0a884`), in both languages at every width |
| landing-page::QR-001/AC-01 (the other three states) | At 400, 900, 1280 and 1440px, both languages, both appearances: no sideways scroll, every download button inside its card, the hero's parts inside the gutters; 144 of 144. Below 760px the row's buttons wrap by design (as in the prototype), so "inside the card" is decided by the wider widths. Section heights identical to the confirmed prototype's in each state at 1280 and 400px |
| landing-page Failure A5 | A pointer read that never answers: the list state at 4s, the test state from GitHub once the read is given up at 5s (landed 5.05s after navigation) |
| landing-page Failure A7 | The reads answered after 1.5s: the list state first, then the test state in place, no reload. A state landing after a language switch, with the hero's bottom at nine positions from above the window to its middle, with and without scroll anchoring: whenever the hero's download block is above the view (under the header included) what the visitor sees stays within 1px; when the block is in view it changes in view and the page does not scroll. Both branches reached; each half of the rule shown to matter by a mutation (`keep-place-mutations.txt`) |
| landing-page::REQ-004/AC-07 with a late state | The language switched while the test state's reads were still out: step 2 stays current and within 0.4px of its place after the state lands. With both the browser's scroll anchoring and the page's own correction off it moves 33.4px (`ac07-late-control.txt`) |
| landing-page::CON-003 | The requests leaving the page in each state: the pointer, then GitHub's API only when the pointer offers nothing (with the pointer served, GitHub is never asked). On the real network the two reads go out as plain GETs, with no preflight (`real-network.txt`). The source holds one request call site and no other request API (`con-003-search.txt`) |
| Copy | The state copy of both dictionaries equals the confirmed prototype's table (20 of 20) |
