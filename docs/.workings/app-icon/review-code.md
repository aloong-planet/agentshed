# Application icon — interim code review (2026-09-14)

Base: 3a6dca561c34d911a144afd2e9cace828e88747f plus uncommitted changes.

## 1. Underlying premises

Both source previews were inspected and `sips` reports no alpha. The checkerboard cannot be treated as
transparency. Both variants require cleanup; the user has been asked to choose the processing method.

## 2. Runtime behaviour

The real Electron declarations accept a NativeImage in Dock.setIcon. The path is relative to the
built main module, independent of cwd. The current full gate passes with the asset absent, exercising
the empty-image fallback. No native-icon call happens in that case. Success-path visual evidence is
still outstanding. Packaged builds skip the development branch.

## 3. Safety and correctness

The asset path is fixed and local, with no renderer-controlled inputs or remote loading. No data path,
application name, IPC contract or lock changes. Quiet mode does not call show or activate.

## 4. Consistency

The native application brand is separate from ADR-0018's renderer SVG controls. No renderer icon,
style or dictionary changes. The conversion script uses macOS system tools and fails on command error.
Packaging is intentionally not marked complete until icon.icns has been generated and inspected.

Final asset and packaging review is pending; this interim review is not a delivery approval.

## Final review — 2026-09-14

### 1. Underlying premises

Reviewed both prepared images and the decoded ICNS. Both source images had the same painted-background
defect; both are fixed by boundary-connected removal without altering the enclosed artwork. Alpha
and core/perimeter bytes were measured, not inferred from the checkerboard preview. Corrected the
spec's assumed packager failure: the installed converter can fall back to a default icon, so actual
bundle identity is the acceptance boundary.

### 2. Runtime behaviour

A real unpackaged Electron process launched from a different cwd calls the real Dock setter with a
nonempty yellow 1254×1254 NativeImage. Quiet Dock/window visibility remains false. The final full gate
passes with the asset present. The initial missing-image gate passed too. The production bundle's
icon declaration and resource agree, and NSWorkspace renders the cyan icon. The separate temporary
ad-hoc-signed package starts, completes its scan and remains alive. The project's unsigned package
has a pre-existing signature-validity limitation; signing policy remains outside this icon change.

### 3. Safety and correctness

Asset selection is main-process-only with a fixed path, after readiness and after the instance lock.
Production never enters the development override. No network content, renderer input, storage change,
permission expansion or security-fuse change. The conversion script's `set -euo pipefail` stops on
failed conversion. All temporary verification processes are closed; the original development server
was restarted once because its main process did not reload automatically.

### 4. Consistency

Code diff is one macOS packaging field and the small startup branch. Brand bitmaps are distinguished
from renderer SVG controls in CONTEXT; no unrelated controls, styles, translations or dead code were
modified. Canonical PNGs, generated ICNS and a system-tool regeneration command are committed together.
No new abstraction or runtime dependency. No further icon-code bugs found. Dock screenshot capture
remains unavailable; API and native asset rendering evidence are explicitly labelled.

## 2026-09-14 — dark-background revision

- **1. Underlying facts:** production preview is RGB with painted exterior checks; development is RGBA. Production preparation changes only alpha (RGB byte equality asserted); development is copied byte-for-byte. Decoded ICNS contains all ten standard representations; 1024px output exactly equals the sips-resized new production source.
- **2. Runtime:** startup icon resolution and packaged/unpackaged selection are unchanged. User requested a restart notification, so the running dev instance is intentionally untouched. No signed distribution is rebuilt in this revision.
- **3. Security/correctness:** found the raw-NUL gate treated native image bytes as forbidden source. Fixed its format predicate using extension plus PNG signature / ICNS signature and declared file length. Text renamed to PNG/ICNS still fails. Gate scope remains all tracked files. No runtime permissions, paths or IPC changed.
- **4. Consistency:** approved artwork, canonical PNG/ICNS, spec, feature and glossary all describe the same deep-black casing and subdued upper supports. Renderer SVG controls are outside this asset change and were not exhaustively audited. No unrelated control-icon changes.

The first previous icon gate ran before new binaries were tracked; its green did not cover those files. New files are now staged before the final gate, and actual image fixtures are exercised through real temporary Git indexes.
