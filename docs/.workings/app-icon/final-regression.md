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
