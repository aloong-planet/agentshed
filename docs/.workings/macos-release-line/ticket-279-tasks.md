# Ticket #279 — task list

The landing page mentions global search. Working record, not a requirement authority: the requirements are
[the landing-page spec](../../specs/landing-page.md); the coverage checklist is [checklist.md](checklist.md). Branch
`feat/landing-global-search`, in its own worktree, cut from `origin/main` at 9b7bb13 (no commits ahead when cut).

## Facts found before deciding (2026-10-21)

- The features section's step count is fixed at four in three places: the copy dictionary's type
  (`site/src/i18n/ui.ts:47`), the screenshot list (`site/src/shots.ts:7`) and the built-site check
  (`site/test/built-site.test.ts:136–179`). The scroll script works for any number of steps
  (`site/src/scripts/features.ts`).
- Only the hero screenshot shows the app's rail, and its rail has Agents and Projects but no Search item
  (`site/public/shots/hero-en.png`); the four feature cuts leave the rail out.
- The site is live: `https://agentshed.aloongplanet.com/` answers 200 and its English page shows the four steps.
  The spec's opening Pending note ("the landing page is live … Until it is there is no feature entry to link")
  has therefore expired.
- The screenshots were taken from the built app over the owner's own agent data and approved for publication on
  2026-10-13 (landing-page::REQ-005/AC-01); any new or retaken screenshot needs the owner's approval again.

## Decisions (step 1, 2026-10-21, the owner's answers)

| # | Decision | Answer |
|---|---|---|
| D1 | How global search appears in the features section | A fifth step with its own screenshot of the search page (not folded into the sessions step) |
| D2 | The hero's whole-window screenshot, whose rail lacks the Search item | Retaken in both languages, so the rail shows Search |
| D3 | The spec's expired Pending note | Deleted; no feature entry for the landing page (the feature catalogue covers in-app behaviour, and a distribution channel stays out of it) |
| D4 | Where the fifth step goes | Last, after "Sessions, revisited" |
| D5 | Whether the fifth step's copy names the ⌘⇧F shortcut | No |
| D6 | The sessions step's "or search" | Becomes "search within the project", in both languages |
| D7 | The search page screenshot's keyword | Replaced by D26. Was: the implementing agent tries keywords on the owner's data and shows candidate shots; the owner picks one and approves it for publication |
| D8 | Candidate shots over the owner's data (the Chinese words for release, icon, prototype and design) showed texts the agent tools inject listed as questions | Ticket [#290](https://github.com/aloong-planet/agentshed/issues/290), fixed first; #279's search screenshot is taken after it. #279's spec and prototype go ahead with a stand-in screenshot |
| D9 | A hit whose keyword lies past the line's cut shows no highlight | Ticket [#291](https://github.com/aloong-planet/agentshed/issues/291), after #290 |
| D10 | The prototype's first revision (the fifth step's copy, the sessions step's wording, the retaken heroes) | Confirmed by the owner, and the retaken heroes approved for publication ("confirmed", in Chinese, 2026-10-21) |
| D11 | The features section's form | The layout of a reference page the owner supplied ("vertical card stack"): pinned under the header, a narrow column on the left with the current step's text, its screenshot large on the right in the page's own window frame; the downloads stay in the hero and the bottom section. Its cards stacked in depth were tried and dropped the same day: only the layout is taken |
| D12 | How the steps follow the scroll | Natural scrolling: each stretch of scroll switches to the next step, its text and screenshot cross-fading in place together with the current ones, nothing moving; every step's text starts on the same line; nothing captures the wheel. A slide up and in from below was tried and dropped the same day: it made the screenshot jump |
| D13 | Colours | The app's purple palette, no coloured background |
| D14 | Phones (below 760px) | The current stacked steps, each with its own screenshot |
| D15 | Progress dots and a "scroll for the next" hint | Neither; the text carries a count, "01 / 05" |
| D16 | The prototype's pinned features section (D11, D12) | Confirmed by the owner ("prototype confirmed", in Chinese, 2026-10-21) |
| D17 | The page's description of the app | Rewritten in #279: the hero's paragraph, to describe the app as it now is ("the description has to change", in Chinese, 2026-10-21); the wording is confirmed on the prototype |
| D18 | A full README, which the owner asked for at the same time | A ticket of its own, done now rather than waiting for #290 (owner's answer, 2026-10-21) |
| D19 | The page's summary | The README's opening summary, word for word, naming plugins and memory and leaving documents out (owner's answers, 2026-10-21; the README is #292) |
| D20 | A memory step | Third, after "What each project has" |
| D21 | Its screenshot | The Agents page's Memory section with a memory file open in the drawer |
| D22 | Its data | Replaced by D25. Was: the owner's, candidates picked from projects with few, technical memory files and published only once approved; a made-up stand-in until then |
| D23 | The hero's heading, "tool shed" | Replaced, as in the READMEs: "Your coding agents, in full view" and its Chinese counterpart (owner's choice, 2026-10-21) |
| D24 | The memory drawer shows raw text, not rendered Markdown (the app's own behaviour, not the screenshot's) | Ticket [#294](https://github.com/aloong-planet/agentshed/issues/294) gives it a Markdown preview first; #279's memory screenshot is retaken once it ships (owner's answer, 2026-10-21) |
| D25 | The memory screenshot, retaken over the new drawer after #294 merged | Taken over a made-up home whose projects and memory files have the real files' shape, not over the owner's data: a shot over the owner's data showed a memory file quoting the owner and the owner's project names (owner's answer, 2026-10-21). Replaces D22 |
| D26 | The search page's screenshot | Also over a made-up home, the same projects as the memory screenshot, so #279 no longer waits for #290; #290 and #291 stay as the app's own defects (owner's answer, 2026-10-21). Replaces D7, and D8's hold on the screenshot |
| D27 | The prototype's last revision: the hero's heading and summary (D17, D19, D23), the memory step with its made-up screenshot (D20, D21, D25), so six steps counted "01 / 06", and the made-up search screenshot (D26) | Confirmed by the owner ("confirmed", in Chinese, 2026-10-21). Earlier confirmations: D10 (02:36 UTC) and D16 (03:17 UTC); this revision was added after them and had not been confirmed until now |
| D28 | D3's "no feature entry" | Overtaken: #297 (merged for #239) gave the landing page its feature entry and removed the Pending note. #279 updates that entry at step 8 |


## Tasks

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Step 1: facts and decisions | this record | done |
| 2 | Screenshots: the hero retaken in both languages; the memory and search steps over a made-up home | the owner's approval (heroes) | done: heroes approved (D10); memory and search over made-up data (D25, D26), retaken on the build after #294 |
| 3 | Step 2: the landing-page spec and its prototype (the memory and search steps, the copy, the screenshots, the pinned features section); the owner confirms the prototype | the confirmed prototype | in progress: the prototype confirmed (D10, D16, D27); the spec next |
| 4 | Steps 4–8 (`/implement`, `/features-catalog`); PR; stop for the owner | PR link | pending |
