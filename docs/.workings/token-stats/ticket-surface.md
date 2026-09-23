# Change surface enumeration

Every listed file is assigned to draft ticket 01 for impact inspection and implementation or regression verification as appropriate; listing is not an instruction to edit every file.

Command: `rg -l 'TrendChart|TrendSpan|TREND_|trendSpan|trend-span-|TotalsCards|useWindowLabel|UsageWindow|USAGE_WINDOW|sliceUsage|inWindow|StartupSkeleton|winD30' src e2e scripts docs/prototypes`

```text
docs/prototypes/_shared/trend-chart.js
docs/prototypes/agents-page/prototype-agents-skeleton.html
docs/prototypes/agents-page/prototype-agents.html
docs/prototypes/_shared/trend-chart.css
scripts/check-shared-ui.mjs
e2e/app.spec.ts
src/shared/trend.test.ts
src/shared/usage.ts
src/main/index.ts
src/shared/i18n/ja.ts
src/shared/usage.test.ts
docs/prototypes/project-detail/prototype-detail.html
src/shared/i18n/en.ts
src/shared/i18n/ru.ts
src/renderer/src/StartupSkeleton.tsx
src/shared/i18n/fr.ts
src/renderer/src/theme.css
src/shared/i18n/es.ts
src/shared/i18n/zh.ts
src/shared/trend.ts
src/renderer/src/AgentsPane.tsx
src/renderer/src/App.tsx
src/renderer/src/TokenViz.tsx
src/renderer/src/DetailPane.tsx
```

Command: `rg -l '\bPrefs\b|parsePrefs|getPrefs|backfillPrefs|PrefsStore' src e2e`

```text
src/preload/index.ts
src/main/prefs-handlers.ts
src/main/appearance-mode.test.ts
src/main/index.ts
src/main/prefs-store.test.ts
src/main/prefs-store.ts
src/shared/ipc.ts
src/shared/prefs.test.ts
src/shared/appearance.test.ts
src/shared/prefs.ts
src/main/prefs-handlers.test.ts
src/renderer/src/prefs-backfill.ts
src/renderer/src/App.tsx
src/renderer/src/prefs-backfill.test.ts
```

Documentation ownership: ticket 01 covers `docs/specs/token-stats.md`, `docs/features/token-stats.md`,
Time window/Trend span in `CONTEXT.md`, the existing cross-side gate, this checklist and the three
prototype mounts enumerated by their shared-block declaration. Applicable startup constraints are
regression-only; no unrelated feature documentation is rewritten. Enumeration commands should be
rerun before implementation to detect checkout drift. Typecheck exhausts consumers of changed
preference/window types; textual enumeration alone is not a substitute for contract checking.
