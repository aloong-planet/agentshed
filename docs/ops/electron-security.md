# Electron security checklist · this project's status ledger

An **item-by-item ruling** against Electron's official "Checklist: Security recommendations"
(20 items). The checklist itself and the criteria live in the `electron-scaffold` skill's
`electron-security.md`; this file records only **what this project does, where, and how it is
verified**.

- Full pass date: **2026-08-02** (Electron 43.2.0)
- When to redo: changing the main process's window / session / protocol / IPC configuration, upgrading
  Electron's major version, or introducing a new "render someone else's content" capability

| # | Item | Status here | Location / verification |
|---|---|---|---|
| 1 | Only load secure content | **Not applicable** | Purely local app, loads no remote content |
| 2 | No nodeIntegration for remote content | ✅ Default + no remote content | `createWindow` webPreferences |
| 3 | contextIsolation | ✅ Explicitly on | As above |
| 4 | sandbox | ✅ Explicitly on | As above |
| 5 | Permission requests | ✅ Requests and checks **all denied** | `security.ts installPermissionGuards` |
| 6 | Do not disable webSecurity | ✅ Default untouched | — |
| 7 | CSP | ✅ Injected as a response header, two profiles | `security.ts cspFor/installCsp`; unit tests pin that prod has no unsafe-eval and that `img-src` excludes http(s) |
| 8 | allowRunningInsecureContent | ✅ Off by default | — |
| 9 | experimentalFeatures | ✅ Off by default | — |
| 10 | enableBlinkFeatures | ✅ Unused | — |
| 11 | webview allowpopups | ✅ No webview used | — |
| 12 | webview validation | ✅ Pre-emptively intercepted | `will-attach-webview` in `installNavigationGuards` deletes preload, disables node, and calls preventDefault |
| **13** | Restrict navigation | ✅ `will-navigate` **+ `will-frame-navigate`**, hung off `web-contents-created` | `security.ts`; `isAppUrl` compares origins rather than using startsWith; unit tests cover prefix-lookalike bypasses |
| **14** | Restrict new windows | ✅ Unconditional deny, allow-listed URLs handed to the system browser | As above |
| **15** | openExternal validated | ✅ `new URL()` + **a protocol allow-list** | `externalOpenTarget`; unit tests cover casing / userinfo / dangerous protocols |
| 16 | Stay on a current Electron | ✅ **43.2.0** (upgraded from 35.7.5 on 2026-08-02) | Full verify + packaging + fuse validation re-run after the upgrade. **Correction**: the fuse wire grew from 8 to 9 (Electron 41 appended `wasmTrapHandlers` at index 8), but the first 8 **did not move**, so the 6 assertions still hold; fuses.json5 states explicitly that it is "append-only, never reordered", so reading by index is safe long-term |
| **17** | IPC sender validation | ✅ Every handler goes through the `handle()` wrapper | `index.ts handle()` + `assertTrustedSender`; **the wrapper guarantees a new handler is validated automatically** |
| **18** | Avoid file:// | ✅ The renderer page runs on `app://bundle` | `app-protocol.ts`; unit tests cover encoded traversal; e2e asserts the packaged build's URL starts with `app://` |
| **19** | Fuses | ✅ **7 of them** (including disabling `grantFileProtocolExtraPrivileges`) | `electron-builder.yml electronFuses`; `scripts/check-fuses.mjs` validates by **reading the built binary** |
| 20 | No raw API exposure in preload | ✅ Exposes wrapper functions, discarding `IpcRendererEvent` in callbacks | `preload/index.ts` (verified, no changes needed) |

## The gates put in place (the tools are unreliable — these are the defence)

| Layer | Content |
|---|---|
| Unit tests | `src/main/security.test.ts` (15 cases: navigation allow/deny, external-link allow-list, IPC sender, four CSP profiles), `src/main/app-protocol.test.ts` (7 cases: path resolution and encoded traversal) |
| e2e | The packaged build's URL must be `app://`; clicking a link inside a document leaves **the window URL unchanged**; a full pass through the new sections produces no main-process errors |
| Packaging | `node scripts/check-fuses.mjs` reads the Electron Framework binary's fuse wire and compares it against the expected values in `electron-builder.yml` |

## Backlog (outside the current change surface, destination already assigned)

- **A forward-looking hit for Electron 44**: the renderer's `clipboard` module is going away
  (deprecated in 40). This project does not currently use clipboard in the renderer; if a "copy
  content" feature is added later, it will go through preload + contextBridge or the W3C Async
  Clipboard API.

## Known trade-offs

- **The CSP's dev profile is relaxed** (`unsafe-inline` / `unsafe-eval` / `ws:`): required by vite
  HMR, applies only in dev, and the packaged build uses the strict profile.
- **`isAppUrl`'s prod branch accepts both `app:` and `file:`**: the latter covers edge loads such as
  devtools and internal pages, which do not carry this app's IPC surface.
- **`grantFileProtocolExtraPrivileges` is disabled** (measured 2026-08-02): what it constrains is the
  extra privileges of **pages loaded from `file://`**, whereas `net.fetch(file://…)` reading from disk
  inside the main process is a different path — with it disabled, e2e passed 11/11 (`app://` page
  loads and on-demand reads of artifact and memory files both work), so the inference is confirmed by
  measurement.
- **`will-frame-navigate` is a gap in the official checklist** (which mentions only `will-navigate`,
  and that only covers the main frame); this project hangs both.
