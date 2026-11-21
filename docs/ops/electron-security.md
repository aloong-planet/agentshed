# Electron security checklist · this project's status ledger

An **item-by-item ruling** against Electron's official "Checklist: Security recommendations"
(20 items). The checklist itself and the criteria live in the `electron-scaffold` skill's
`electron-security.md`; this file records only **what this project does, where, and how it is
verified**.

- Full pass date: **2026-08-02** (Electron 43.2.0)
- Partial re-pass: **2026-10-14**, for app updates (ADR-0032) — the main process's first outbound request
  and two new IPC channels; items 1, 7, 17 and 20 re-checked
- Partial re-pass: **2026-11-05**, for launch inputs (ADR-0042) — item 21 added
- Partial re-pass: **2026-11-06**, item 21 again (ADR-0042 amended): a switch after whitespace got past the guard of
  v0.1.0-beta.7, so arguments are now compared as given
- Partial re-pass: **2026-11-20**, item 22 added: a page could name any directory as the target of a skill install or
  uninstall, the global library included
- Partial re-pass: **2026-11-21**, item 22 again, and item 17 for one new IPC channel: an install or uninstall into a
  listed project could still land in a global library, through a project that is the home directory, lies inside a
  library or has a skills directory leading into one
- Partial re-pass: **2026-11-21**, items 17 and 22 again (#405): each IPC channel's argument check and admission moved
  out of `index.ts` into `ipc-guards.ts`, and the `handle()` wrapper now takes the channel's guard; every request is
  refused or admitted as before
- Partial re-pass: **2026-11-21**, items 23 to 27 added (#515): no item covered the guards that decide which files and
  directories a page may have the main process read, or show in Finder, and item 27 records that a project's directory
  has no such guard
- Partial re-pass: **2026-11-21**, item 19 (#404): every packaging now reads the built app's fuses back and fails on one
  that differs from `electronFuses`; the hand-run `scripts/check-fuses.mjs`, which no packaging ran, is gone
- Partial re-pass: **2026-11-21**, item 27 guarded (#526): a project's detail is read, and a project counts as opened,
  only for a directory the snapshot lists; item 25 follows
- Partial re-pass: **2026-11-21**, item 21 again (#530): `--type=relauncher --- <program>`, read by Chromium before any
  JavaScript, was measured to run the program past the guard; it is attributed to the caller or the program itself, not
  the signed app, so it gains none of the app's granted permissions, and is an accepted trade-off, so item 21 is now ⚠️
- When to redo: changing the main process's window / session / protocol / IPC configuration, the main process
  reading a new environment variable or switch, upgrading Electron's major version, introducing a new
  "render someone else's content" capability, or adding a packaging platform

| # | Item | Status here | Location / verification |
|---|---|---|---|
| 1 | Only load secure content | **Not applicable** | The renderer loads no remote content. The app's one outbound request is the main process's update check and the download it finds, over HTTPS to GitHub Releases (ADR-0032); the package is applied only after the system updater checks its signature |
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
| 16 | Stay on a current Electron | ✅ **43.2.0** (upgraded from 35.7.5 on 2026-08-02) | Full verify + packaging + fuse validation re-run after the upgrade. **Correction**: the fuse wire grew from 8 to 9 (Electron 41 appended `wasmTrapHandlers` at index 8), but the first 8 **did not move**, so each of the 7 fuses `electronFuses` sets, all among the first 8, is read at the same index; fuses.json5 states explicitly that it is "append-only, never reordered", so reading by index is safe long-term |
| **17** | IPC sender validation | ✅ Every handler goes through the `handle()` wrapper | `index.ts handle()` + `assertTrustedSender`; **the wrapper guarantees a new handler is validated automatically**, and it takes the channel's argument guard from `ipc-guards.ts`, so a registration with no guard fails typecheck |
| **18** | Avoid file:// | ✅ The renderer page runs on `app://bundle` | `app-protocol.ts`; unit tests cover encoded traversal; e2e asserts the packaged build's URL starts with `app://` |
| **19** | Fuses | ✅ **7 of them** (including disabling `grantFileProtocolExtraPrivileges`) | `electron-builder.yml electronFuses`; every packaging, in both profiles, validates by **reading the built binary** (`build/mac-packaging.cjs`, the Packaging layer below) |
| 20 | No raw API exposure in preload | ✅ Exposes wrapper functions, discarding `IpcRendererEvent` in callbacks | `preload/index.ts` (verified, no changes needed) |
| **21** | No launch input steers a packaged build (beyond the official list) | ⚠️ Exit code 64 before anything loads, on any argument other than the exact spelling of an accepted one, the development server's URL or an `AGENTSHED_*` seam in any case. One input the guard cannot reach: Chromium runs `--type=relauncher --- <program>` before any JavaScript — an accepted trade-off, since the started program is held responsible to the caller or to itself, not the signed app, so it gains none of the app's granted permissions (ADR-0042, mac-distribution F10; Known trade-offs below) | `launch-inputs.ts` (decision) and `launch-guard.ts` (first import of main); unit tests cover the bypass vectors; the packaging asset launches the built app in both profiles |
| **22** | No page names where the main process writes or deletes (beyond the official list) | ✅ A skill install or uninstall, the only calls that write or delete at a path the page gives, goes only into a project the main process's snapshot lists, by its exact path (skill-install R3), and never changes a global library (skill-install R4) | `security.ts skillOpTarget` and `skillOpLibrary` (decisions), called through `install.ts` by the two handlers in `index.ts`; unit tests cover the bypass vectors; e2e has a page ask to uninstall from the home directory and install into an unlisted one, and to install into and uninstall from the home directory listed as a project |
| **23** | No page names a session file the main process reads (beyond the official list) | ✅ Only a path in the session allow-list, compared as given (session-view R1): the exact paths the main process's own scan produced, or the restored ones until the first scan. It admits a session's page, its turns and its freshness check; the page and turn reads wait for the first scan, judge again against the allow-list of that moment, and once more before they answer | `security.ts sessionReadTarget` (decision), called through `ipc-guards.ts listedSessionArg` and `sessionTurnArgs`, with the recheck `listedSession`; unit tests in `security.test.ts` cover traversal, prefix lookalikes, encoded traversal and Unicode normalisation, and `ipc-guards.test.ts` each channel's refusals; e2e sends a path outside the allow-list to the session page and to the freshness check over the real channel |
| **24** | No page has Finder show a path beyond a listed session (beyond the official list) | ✅ The one call that shows a path the page gives admits only what item 23 admits, then only while the file is there, and an entry restored before the first scan only while it is a regular file (session-view::US-001/AC-07, AC-10) | `security.ts sessionRevealTarget` (decision, taking the handler's probes), called through `ipc-guards.ts revealSessionArg`; unit tests in `security.test.ts` cover another type, empty, traversal, a prefix lookalike, an encoding and another case against real files, and `ipc-guards.test.ts` a gone file and a restored link; e2e has a restored session replaced by a link refused |
| **25** | No page names a memory file, plugin package root or skill file the main process reads beyond what it registered (beyond the official list) | ✅ The read registry: exact paths, by kind, that the main process's own enumerations registered, namely the scan (memory files, plugin roots), an opened project page (its memory files and plugin roots, and the project) and a skill file listing (the files it listed). Until its owner registers again, a memory file or skill file restored from the last launch admits only while it is a regular file and a restored plugin root only while it is a directory, never a link; a project, restored or registered since, admits only while the snapshot lists it (item 27; agents-overview::CON-002, skills-view C8, C9, plugins-view H8). A scan or a project page retires a registration whose project, plugin root or skill it no longer lists. The memory file read judges again after its delay, and the package listing judges its root only after its delay | `read-registrations.ts ReadRegistry.admission` (decision), `retireAfterScan` and `retireAfterDetail` (retirement), called through `ipc-guards.ts memoryFileArg`, `admitMemoryFile`, `admitSkillPackage` and `skillFileArg`, with `source-identity.ts regularTarget` as the probe `index.ts` passes them. Unit tests: `read-registrations.test.ts` covers a replaced owner's old path, another owner's same path and both retirement passes, and `ipc-guards.test.ts` an unregistered path, a project whose page was not opened, and a restored registration that is a link or gone, or a file for a plugin root; no case sends another spelling of a registered path (Backlog). A plugin listing saved before the project page that alone held its root keeps its registration until a later scan (Backlog, #521). e2e has an unregistered plugin root, an unopened project's package and a restored memory file replaced by a link refused |
| **26** | No page names where a skill package is listed from beyond a skills directory (beyond the official list) | ⚠️ A package listing reads only an entry one segment below a skills directory (a side's global library, a skills directory of an opened project, or `skills/` in a registered plugin root, item 25), named by one segment that is not a plugin namespace. An entry that is a link is followed wherever it leads (skills-view C9, A6), and so is a link inside the package, except into a directory the walk is inside or one holding the package; every text file the walk reaches is registered for reading (item 25). **The decision is not a pure function**: it probes the disk itself (Backlog) | `providers/skill-package.ts resolveSkillRoot` with `isUnderKnownSkillRoots`, and `resolvePluginSkillRoot`, called by the `listSkillFiles` handler in `index.ts`; unit tests in `providers/skill-package.test.ts`, against real directories, cover a name with `..`, `/` or `.`, a plugin namespace, a skills directory itself, a directory below a package, one outside every skills directory, and a project's directory judged without its project |
| **27** | No page names a directory the main process reads as a project (beyond the official list) | ✅ Only a directory the main process's snapshot lists as a project, compared as given, a stale one included: the restored snapshot until the first scan, the latest scan's after it (project-detail::CON-001). A request is judged when it arrives and again after its wait for the first scan, before anything of the directory is read or registered, and a project counts as opened, for a package listing from it (item 25), only while the snapshot of that moment lists it | `shared/listed-project.ts isListedProject` (decision), called through `ipc-guards.ts projectDetailArgs`, the recheck `listedProject` and `admitSkillPackage`, against the projects `index.ts guardState` passes, and by the window's `invalidateOnSnapshot`, which refetches a project's detail only while the window's new snapshot lists it (a window that takes a snapshot after the main process has replaced it can still ask for a project the newer one dropped; that request is refused like any other, and the page keeps its saved copy); unit tests in `shared/listed-project.test.ts` cover a trailing separator, `.` and `..` segments, a prefix lookalike, a directory inside a project, an encoding, another Unicode normalisation, another case and an unlisted directory, `ipc-guards.test.ts` the guard's refusal before any probe of the disk, through the recheck it shares, and a restored or live registration the snapshot no longer lists, and `global-search-query.test.ts` the window's refetch; e2e asks over the real channel, across a restart, for a directory neither snapshot lists, refused while the first scan is held, and for a project only the restored snapshot lists, refused after the scan with nothing of it registered, and `skill-install.spec.ts` has the unlisted directories' details refused |

## The gates put in place (the tools are unreliable — these are the defence)

| Layer | Content |
|---|---|
| Unit tests | `src/main/security.test.ts` (navigation allow/deny, external-link allow-list, IPC sender, the CSP profiles, the session read allow-list, the skill install and uninstall target, the global libraries an install or uninstall must not change), `src/shared/listed-project.test.ts` (the directories a project's detail is read for), `src/main/ipc-guards.test.ts` (each IPC channel's argument check and admission, against every input it refuses; a registration with no guard or an inline check fails typecheck), `src/main/read-registrations.test.ts` (the read registry's owners and its retirement passes), `src/main/providers/skill-package.test.ts` (a skill package's root and its container check), `src/main/app-protocol.test.ts` (7 cases: path resolution and encoded traversal) |
| e2e | The packaged build's URL must be `app://`; clicking a link inside a document leaves **the window URL unchanged**; a full pass through the new sections produces no main-process errors; a page's skill install or uninstall outside the app's projects, or into a global library, is refused; a page's read of a session outside the allow-list, of the detail of a directory the snapshot does not list, of a plugin root nothing registered or of a package from a project whose page was not opened, its read of a restored memory file and its showing of a restored session in Finder after either was replaced by a link, are refused over the real channel |
| Packaging | Every packaging, in both profiles, runs `build/mac-packaging.cjs`, which reads the fuse wire of each built app's Electron Framework binary, every slice, right after the build, and fails before any signature, launch or DMG check when a fuse differs from `electronFuses` in `electron-builder.yml` or a key there maps to no fuse. It also launches the built app with inputs it must refuse, and with only its settings directory |

## Backlog (outside the current change surface, destination already assigned)

- **A forward-looking hit for Electron 44**: the renderer's `clipboard` module is going away
  (deprecated in 40). This project does not currently use clipboard in the renderer; if a "copy
  content" feature is added later, it will go through preload + contextBridge or the W3C Async
  Clipboard API.
- **A skill package's root is decided by functions that probe the disk themselves** (item 26): `resolveSkillRoot`,
  `isUnderKnownSkillRoots` and `resolvePluginSkillRoot` call the file system rather than take a probe, so the decision
  is not a pure function, and their unit tests run against real directories. Destination: #527.
- **The read registry's unit tests send no other spelling of a registered path** (item 25): skills-view C9 refuses
  prefix traversal and encoding variants, which exact matching refuses by construction, but no case pins it as the
  session allow-list's cases do (item 23). Destination: #521.
- **A plugin listing can keep its registration one scan too long** (item 25): `retireAfterScan` judges the saved reads
  in the order they were first saved, so a listing saved before the project page that alone held its root keeps its
  registration until a later scan. Destination: #521.

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
- **The relauncher process type runs a program the guard cannot reach** (item 21): `--type=relauncher --- <program>`,
  read by Chromium before any JavaScript, runs the program on a direct start, through `open`, and through the main or a
  helper executable. macOS holds the caller, or through `open` the program itself, responsible for it, not the signed
  app, so it gains none of the app's granted permissions; accepted as a documented trade-off (ADR-0042, mac-distribution
  F10).
