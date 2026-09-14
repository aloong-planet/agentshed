# Application icon — coverage and acceptance

Spec: [app-icon](../../specs/app-icon.md)
Source commit: 3a6dca561c34d911a144afd2e9cace828e88747f; spec and implementation are uncommitted.
Scope: application identity only. Existing page behaviour is regression-only.

## Sources → spec

| Source and supporting words | Disposition | Spec coverage | Semantic check |
|---|---|---|---|
| User requests an arc-reactor-like icon and slightly different dev/prod variants | Effective | app-icon::REQ-001, app-icon::REQ-002 | Cyan production and yellow development retained |
| User removes dev corner dot and makes the surroundings yellow | Effective | app-icon::REQ-003/AC-01 | No dot or badge |
| User asks for matching core lighting and even gradients in every radial direction | Effective | app-icon::REQ-003/AC-02 | Later smooth gradient supersedes plasma/flare concept |
| User approves the two standalone images, then says to apply to the project | Effective | app-icon::REQ-003/AC-03, app-icon::CON-001 | Apply selected artwork; no redesign or unrelated UI work |

## Spec → implementation → verification

| Coverage | Delivery | Planned boundary |
|---|---|---|
| app-icon::REQ-001 | Direct implementation | Evidence: packaged bundle declaration/resource and native rendering |
| app-icon::REQ-002 | Direct implementation | Evidence: real development process and Dock |
| app-icon::REQ-003/AC-01 | Direct implementation | Evidence: compare both assets with approved images |
| app-icon::REQ-003/AC-02 | Direct implementation | Evidence: retain approved core pixels; rendered preview |
| app-icon::REQ-003/AC-03 | Direct implementation | Evidence: alpha measurement and small-size preview |
| app-icon::CON-001 | Regression | Gate: pnpm verify; diff review |

## Verification history

2026-09-14, base commit above plus uncommitted changes: `pnpm typecheck` passed.
`pnpm verify` exited 0: 708 unit tests passed, one existing skip, all 78 Electron end-to-end tests
passed, all UI/language/i18n/NUL checks passed, and smoke passed (startup 1217 ms, scan 18143 ms,
orphan exit 781 ms). Log: `/tmp/agentshed-icons-verify.log`.
This run exercises the missing-development-image fallback: final image files are not prepared yet.
It is regression evidence for app-icon::CON-001, not evidence of either icon being displayed.

Artwork, native icon conversion, packaging and visual acceptance remain unverified pending the user's
choice of background-removal method. Do not open a PR or report application complete in this state.

## Bidirectional design review

All current source decisions have coverage. Plasma light threads and the blue dev centre were
superseded by later user decisions. No new product controls or distribution channels are introduced.
Both visible points (cyan production and yellow development) are covered by the user-approved images.
Transparent-background cleanup is pending the user's selected method; no dependent image edit yet.

## Tasks

- [x] Inspect current startup, packaging and approved visuals; record spec and source coverage.
- [x] Prepare transparent PNGs and native packaging icon; wire startup and packaging.
- [x] Validate assets, real startup, package and full project gate.
- [x] Step 5: critical code review.
- [x] Step 6: review verification and test limitations.
- [x] Step 8: feature documentation and cross-document regression.
- [ ] Commit, push and open a PR; do not merge without confirmation.

## Final verification — 2026-09-14

Version: base commit above plus the complete uncommitted icon implementation and assets.
The user explicitly allowed programmatic background cleanup and asked to continue.

| Coverage unit | Result and evidence | Conclusion |
|---|---|---|
| app-icon::REQ-001 | Fresh macOS package declares `icon.icns`; its resource SHA-256 is `038ee504869d4660f166711dd13f2e210e6853b97e94d8c773e02c310aef06dc`, identical to the source. NSWorkspace reads the bundle and renders the cyan icon (`e2e-out/app-icon/finder-native.png`). | Native bundle identity verified; Dock screenshot unavailable |
| app-icon::REQ-002 | Real Electron startup from `/tmp` passes a nonempty 1254×1254 yellow NativeImage to the actual Dock setter; the resulting capture retains the source core/perimeter RGB and alpha. `e2e-out/app-icon/dev-dock.json`. | Native API success path verified |
| app-icon::REQ-003/AC-01 | Both final PNGs compared with approved sources; casing and six segments retained; no dev corner indicator. | Passed |
| app-icon::REQ-003/AC-02 | The enclosed 835×835 core/perimeter region remains fully opaque and RGB-identical to the approved artwork. | Passed |
| app-icon::REQ-003/AC-03 | PNG alpha spans 0–255, all four corners transparent. Reviewed 256/64/32/16-pixel renderings on light and dark backgrounds (`e2e-out/app-icon/preview.png`). | Passed |
| app-icon::CON-001 | Final `pnpm verify` exit 0: 708 unit cases passed, one existing skip; 78 e2e passed; all static gates passed; smoke startup 1225 ms, scan 17810 ms, orphan exit 521 ms. `e2e-out/app-icon/verify.log`. | Passed |

The actual setter left quiet mode unchanged: Dock and window both hidden. The prior run without the
PNG covered missing-image startup. Conversion was decoded back into all ten iconset representations.
The application name, storage, single-instance lock, renderer layout and preferences have no diff.

### Evidence limits and corrected assumptions

- Computer-use Dock capture timed out. Native API/image evidence is retained, not called a Dock screenshot.
- The first temporary probe using `--require` and `app.getFileIcon` terminated Electron with SIGTRAP;
  no root cause is established. A main-entry observer and NSWorkspace render replaced that probe;
  neither required application-code changes. The final full gate passes the uninstrumented app.
- Sandboxed iconutil rejected the iconset; the identical command succeeded in the system environment.
  A sandboxed NSWorkspace render was blank; it was rejected as evidence. The system render is nonempty
  and visually cyan. Command exit success alone was not used as proof.
- An explicit nonexistent icon passed to the packager converter falls back to the default build icon.
  The spec was corrected to require checking actual bundle identity rather than promise a fail-closed
  packager that the installed dependency does not provide.
- The unchanged `mac.identity: null` package is killed on this arm64 host; codesign reports
  `code has no resources but signature indicates they must be present`. This is a local-package
  trust limitation, not an icon-rendering pass. A separately built, temporary ad-hoc-signed copy is
  used for launch verification. No signing policy or publication flow is changed.

## Confirmed code evidence before implementation

- `electron-builder.yml:9`: build resources are in `build`; the mac section declares no icon.
- `src/main/index.ts:584`: the readiness handler runs before creating the main window.
- `node_modules/electron/electron.d.ts:8092`: Dock accepts a NativeImage or path.
- `sips -g hasAlpha` reports **no** for both approved standalone previews: checkerboard is image data.
- Capabilities are declared in tracked `CLAUDE.md`: i18n and language/UI gates enabled. No root AGENTS.md.
- UI anchors inspected: renderer `icons.tsx` and `theme.css`, shared `i18n/index.ts`; no renderer edits.
- No outside-scope character-icon audit of the entire renderer was performed; no such slots touched.

The temporary ad-hoc-signed packaged copy completed startup and scan and remained alive (pid 22466),
then the test closed it. Default project signing settings were not changed.
Final code review, verification review and three-phase document regression are complete.
Tasks through step 8 are complete; next action is commit/push/PR, not merge.
