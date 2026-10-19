# In-app measurements for ADR-0034 — #271

Taken 2026-10-19 on a025015 (the gateway's tree), with `measure.mjs` beside this file:
`node measure.mjs <worktree>`, the built app (`out/`) under Electron 43.2.0, this machine's real agent data, and a
copy of the real userData's own four files (token cache, display cache, usage archive, preferences) in a temporary
directory, so the startup restores and runs its scan. The script prints timings and counts only; the box's
placeholder line is rewritten here in English (the copied preferences pick the interface language). The
keywords, in order: a, e, the, notarize, a two-character Chinese word, and one that matches nothing.

## Run 1 — no scan under way when the page opened (the warm startup scan had finished)

```
{"launchToClickMs":5004,"scanAtOpen":"ready","readingHintShownAfterMs":946,"readingMs":3058,"scanAtReadEnd":"ready","placeholder":"(the box's placeholder, in the copied preferences' language: 113 sessions in 30 projects)"}
{"scanReadyAfterLaunchMs":8079}
{"keywordLength":1,"ascii":true,"medianMs":10.6,"maxMs":14,"hits":2132,"sessions":103,"projects":29}
{"keywordLength":1,"ascii":true,"medianMs":13.9,"maxMs":59.3,"hits":2430,"sessions":108,"projects":30}
{"keywordLength":3,"ascii":true,"medianMs":7.3,"maxMs":11.2,"hits":663,"sessions":66,"projects":21}
{"keywordLength":8,"ascii":true,"medianMs":5,"maxMs":5.3,"hits":14,"sessions":9,"projects":5}
{"keywordLength":2,"ascii":false,"medianMs":4.3,"maxMs":4.5,"hits":17,"sessions":4,"projects":3}
{"keywordLength":18,"ascii":true,"medianMs":3.5,"maxMs":3.7,"hits":0,"sessions":0,"projects":0}
{"con001Samples":25,"filesInRunCopy":["DIPS","DevToolsActivePort","Local State","Network Persistent State","Preferences","Trust Tokens","Trust Tokens-journal","display-cache.json","prefs.json","token-cache.json","usage-archive.json"],"gained":[]}
```

## Run 2 — an automatic rescan every 1.5 s (`AGENTSHED_RESCAN_MS=1500`), alongside the reading and the searches

```
{"launchToClickMs":2351,"scanAtOpen":"ready","readingHintShownAfterMs":67,"readingMs":4749,"scanAtReadEnd":"ready","placeholder":"(the box's placeholder, in the copied preferences' language: 113 sessions in 30 projects)"}
{"scanReadyAfterLaunchMs":7106}
{"keywordLength":1,"ascii":true,"medianMs":9.6,"maxMs":12.1,"hits":2132,"sessions":103,"projects":29}
{"keywordLength":1,"ascii":true,"medianMs":10.2,"maxMs":10.9,"hits":2430,"sessions":108,"projects":30}
{"keywordLength":3,"ascii":true,"medianMs":7.3,"maxMs":7.7,"hits":663,"sessions":66,"projects":21}
{"keywordLength":8,"ascii":true,"medianMs":4.9,"maxMs":5.3,"hits":14,"sessions":9,"projects":5}
{"keywordLength":2,"ascii":false,"medianMs":4.2,"maxMs":4.6,"hits":17,"sessions":4,"projects":3}
{"keywordLength":18,"ascii":true,"medianMs":3.5,"maxMs":3.6,"hits":0,"sessions":0,"projects":0}
{"con001Samples":25,"filesInRunCopy":["DIPS","DevToolsActivePort","Local State","Network Persistent State","Preferences","Trust Tokens","Trust Tokens-journal","display-cache.json","prefs.json","token-cache.json","usage-archive.json"],"gained":[]}
```

## Reading the figures

- `readingMs`: from the click on the Search item to the reading hint leaving the header — the whole first reading.
- `medianMs` / `maxMs`: a search's round trip from the renderer (IPC and both validations included), seven runs.
- `gained`: sampled question texts (not titles, so not in the token cache by design) found more often in the
  run's copy of the userData files than in a pristine copy taken before — empty in both runs (CON-001).
