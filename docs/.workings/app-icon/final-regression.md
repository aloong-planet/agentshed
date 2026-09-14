# Application icon — final document regression

## 2026-09-14

Scope: the app-icon spec and the complete icon diff against
3a6dca561c34d911a144afd2e9cace828e88747f (uncommitted at verification time).
Requirement evidence is in [checklist](checklist.md), final verification section.

### Phase 1 — changed declarations

| Pair | Check and conclusion |
|---|---|
| app-icon spec ↔ implementation | Cyan native bundle, yellow unpackaged Dock override, fixed local assets and no new controls agree. The spec accurately states packager fallback; no invented failure gate. |
| app-icon spec ↔ feature | Colour, shape, core lighting, transparency and theme independence agree. No distribution claims in the feature. |
| CONTEXT ↔ all changed declarations | Application identity is separated from renderer controls and from distribution trust. Terms agree. |
| approved raster study ↔ final assets | Exterior cleanup only; source core/perimeter RGB unchanged. No HTML prototype was recreated. |
| build README ↔ resources/script | Canonical PNGs, production ICNS and ten regenerated representations match. No image-processing runtime dependency. |

### Phase 2 — related declarations

| Relationship | Check and conclusion |
|---|---|
| new files ↔ feature/spec indices | Both new documents have index rows with matching names and scope. |
| renderer icon convention ↔ native brand | ADR-0018 concerns renderer SVG controls; CONTEXT distinguishes the approved raster application identity. No SVG/control list change. |
| same fact elsewhere | `rg -n 'icon|Dock|reactor|Application icon' README* docs/features docs/specs CONTEXT.md electron-builder.yml build/README.md` read all matching text. Existing renderer icon and appearance statements concern in-app controls; no conflicting native identity found. |
| rules ↔ gates | Project capabilities in CLAUDE.md enable i18n, wording and working-language gates. All pass. These gates do not verify native image appearance; explicit asset/system evidence supplies that boundary. |
| templates ↔ documents | No shared rule/template was changed; new documents state their own meanings without requiring local skills. |

### Phase 3 — events

| Event | Check and conclusion |
|---|---|
| new application identity | No agent-side, language, platform or distribution-channel membership change. Existing enumeration gates still pass. |
| approved background cleanup | User explicitly authorised programmatic removal. Both actual RGB source previews are preserved; final PNGs have real alpha. |
| missing-icon fallback observed | Corrected spec; no assertion that packaging success proves identity. Native resource and NSWorkspace verification are retained. |
| unsigned launch limitation observed | Existing `identity: null` configuration unchanged. Trust distinction recorded in CONTEXT; local ad-hoc verification is not public-release acceptance. Signing remains outside this task. |
| Pending notes | No `Pending:` notes in the new app-icon spec, feature or build README; historical interim review entries remain as records, followed by final results. |
| new rules | No cross-project rule added. The local application-icon meaning and trust boundary are in CONTEXT. |

Queue exhausted after rechecking the corrected spec and CONTEXT statements. Icon implementation and
documentation are ready for PR. Native Dock screenshot remains an explicit evidence limitation;
development setter execution and native production rendering are verified. No release or merge performed.

## 2026-09-14 — dark-background revision

### Stage 1: changed declarations

| Comparison | Result |
| --- | --- |
| Spec AC-01/02 and assets | Six segments and filled radial core retained; cyan/yellow distinction retained. |
| Spec AC-03 and assets | Both prepared PNGs have alpha; exterior checks removed from production; small renders inspected. |
| Spec AC-04, features and glossary | All describe deep-black background and subdued upper support reflections. |
| Approved prototypes and assets | Approved source files replaced by v2; production RGB unchanged during alpha cleanup, development copied unchanged. |
| Build README and preparation | Documents production-only checkerboard removal and existing development alpha. |
| Gate comment, predicate and tests | Text-NUL prohibition with format-based PNG/ICNS recognition; negative source cases remain rejected. |

### Stage 2: related declarations

| Relationship | Result |
| --- | --- |
| Features/spec files and README indexes | Existing app-icon identity, filename and cyan/yellow distinction unchanged; indexes still correct. |
| Icon assets and main/packager references | Existing references use canonical build/icon-dev.png and build/icon.icns; no reconnect needed. |
| ADR-0018 renderer icons vs native artwork | No renderer change; raster application identity remains separate. |
| Text-only gate assumption elsewhere | Reviewed complete gate; obsolete no-binary-assets statement replaced. |
| Capability-gated i18n dictionary check | 按项目能力声明，i18n 未启用，该项跳过。No interface strings changed; the existing full i18n command still runs in the gateway. |

### Stage 3: events

| Event | Result |
| --- | --- |
| User approved replacement artwork | Pending preview status changed to approved/applied; old artwork superseded in the existing visual study. |
| Binary files added to tracked scope | Gate now admits known image formats; new files staged before the final scan. |
| Enumerated product dimensions | No provider, locale, platform or variant added/removed. |
| Pending notes | Scoped search of icon spec/features/prototypes found no Pending: notes. |
| Distribution artifact status | Existing signed DMG/App remain their prior immutable build; no new signing claim. |
| Restart request | Running dev intentionally retained; user is to restart after completion. |

Final gateway: `pnpm verify` exited 0 after staging all new artwork. 708 unit tests passed with one existing skip; all six gate CLI tests and 78 Electron e2e tests passed; static checks and smoke passed. Full log: `/tmp/agentshed-icon-v2-verify-final.log`, also retained in local `e2e-out/app-icon-v2/verify.log`. No unresolved review findings. Existing dev PID 21131 was preserved by the isolated smoke test.
