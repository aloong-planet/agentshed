// The update sources behind the update controller (app-update Implementation Decisions): electron-updater
// over GitHub Releases in an installed copy, and a scripted source that e2e declares through the
// environment. A development run has neither, and never checks (app-update::US-005).
import { appendFileSync, readFileSync } from 'node:fs'
import type { FoundUpdate, UpdateSource } from './update-controller'

/** The release feed every installed copy reads: GitHub Releases, never the R2 mirror (app-update::CON-002) */
export const UPDATE_FEED = { provider: 'github', owner: 'aloong-planet', repo: 'agentshed' } as const

/**
 * The updater's settings for the running version (ADR-0032). The download starts as soon as an update is
 * found, an update left ready installs on quit, and an older version is never offered
 * (app-update::US-004/AC-04). Pre-releases follow the running version — an installation of a pre-release is
 * offered pre-releases and formal releases, one of a formal release formal releases only (US-004/AC-01 to
 * AC-03). That is electron-updater's own default for the GitHub feed; it is set here rather than left
 * implicit so the rule is stated, and tested, where the app decides it.
 */
export function updaterSettings(currentVersion: string): {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowDowngrade: boolean
  allowPrerelease: boolean
} {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: false,
    allowPrerelease: /^\d+\.\d+\.\d+-/.test(currentVersion)
  }
}

export type UpdateSourceChoice = { kind: 'github' } | { kind: 'scripted'; script: string }

/**
 * Which source a run uses. `AGENTSHED_UPDATE_SCRIPT` is a test seam in the family of the other
 * `AGENTSHED_*` variables and is never set in production (app-update Failure F2): it declares a scripted
 * source and stands in for "packaged" for the update feature only, so e2e can drive the whole lifecycle in
 * an unpackaged run.
 */
export function chooseUpdateSource(run: { packaged: boolean; env: Record<string, string | undefined> }): UpdateSourceChoice | null {
  const script = run.env['AGENTSHED_UPDATE_SCRIPT']
  if (script) return { kind: 'scripted', script }
  return run.packaged ? { kind: 'github' } : null
}

/** The slice of electron-updater's AppUpdater this adapter uses */
interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowDowngrade: boolean
  allowPrerelease: boolean
  setFeedURL(options: typeof UPDATE_FEED): void
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean
    updateInfo: { version: string }
    downloadPromise?: Promise<unknown> | null
    cancellationToken?: { cancel(): void }
  } | null>
  quitAndInstall(): void
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown
  once(event: 'error', listener: (error: Error) => void): unknown
  /** macOS: whether Squirrel.Mac has the update staged (MacUpdater) */
  squirrelDownloadedUpdate?: boolean
}

/** The slice of Electron's native autoUpdater (Squirrel.Mac) the adapter listens to */
interface NativeUpdater {
  once(event: 'update-downloaded' | 'error', listener: (...args: unknown[]) => void): unknown
  removeListener(event: 'update-downloaded' | 'error', listener: (...args: unknown[]) => void): unknown
}

/**
 * On macOS electron-updater reports the download done once Squirrel.Mac has fetched the ZIP from it, which is
 * before Squirrel has checked the package and staged it (electron-updater 6.8.9, MacUpdater.updateDownloaded).
 * Ready has to mean "can install": a package Squirrel rejects is a failed download, and the button goes
 * (app-update Failure B2), rather than a ready button whose install could never run.
 */
function staged(u: Updater, native: NativeUpdater): Promise<void> {
  if (u.squirrelDownloadedUpdate) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const done = (): void => {
      native.removeListener('error', fail)
      resolve()
    }
    const fail = (error: unknown): void => {
      native.removeListener('update-downloaded', done)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    native.once('update-downloaded', done)
    native.once('error', fail)
  })
}

/**
 * electron-updater in an installed copy. Loaded on first use, so that nothing in an unpackaged run ever
 * constructs it.
 */
export function electronUpdateSource(currentVersion: string): UpdateSource {
  let onProgress: (percent: number) => void = () => {}
  let loaded: Promise<Updater> | null = null
  const updater = (): Promise<Updater> => {
    loaded ??= import('electron-updater').then((m) => {
      const u = (m as unknown as { default?: { autoUpdater: Updater }; autoUpdater?: Updater }).default?.autoUpdater ?? (m as unknown as { autoUpdater: Updater }).autoUpdater
      Object.assign(u, updaterSettings(currentVersion))
      u.setFeedURL(UPDATE_FEED)
      u.on('download-progress', (info) => onProgress(info.percent))
      return u
    })
    return loaded
  }
  return {
    async check(progress): Promise<FoundUpdate | null> {
      onProgress = progress
      const u = await updater()
      const result = await u.checkForUpdates()
      if (!result?.isUpdateAvailable || !result.downloadPromise) return null
      const native = (await import('electron')).autoUpdater as unknown as NativeUpdater
      return {
        version: result.updateInfo.version,
        downloaded: result.downloadPromise.then(() => staged(u, native)),
        cancel: () => result.cancellationToken?.cancel()
      }
    },
    async install(): Promise<void> {
      const u = await updater()
      // Success quits the app into the new version, so this settles only on failure: an error the updater
      // reports after the click, or one it throws
      return new Promise<void>((_resolve, reject) => {
        u.once('error', reject)
        try {
          u.quitAndInstall()
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }
  }
}

/**
 * The scripted source e2e drives. It reads its script at every request, so a test can change what the next
 * check answers, and appends each request to `<script>.log` so a test can count them. Script fields:
 * `check` ("upToDate" | "fail" | "found"), `version`, `checkMs` (how long a check stays in flight),
 * `steps` (the progress values a download reports), `stepMs`, `download` ("complete" | "fail" | "hold"),
 * and `install` ("fail" | "hold"). A scripted install never installs anything.
 */
export function scriptedUpdateSource(script: string): UpdateSource {
  interface Script {
    check?: 'upToDate' | 'fail' | 'found'
    version?: string
    checkMs?: number
    steps?: number[]
    stepMs?: number
    download?: 'complete' | 'fail' | 'hold'
    install?: 'fail' | 'hold'
  }
  const read = (): Script => JSON.parse(readFileSync(script, 'utf8')) as Script
  const record = (what: 'check' | 'install'): void => appendFileSync(`${script}.log`, `${what}\n`)
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  return {
    async check(onProgress): Promise<FoundUpdate | null> {
      record('check')
      const s = read()
      await wait(s.checkMs ?? 0)
      if (s.check === 'upToDate') return null
      if (s.check !== 'found') throw new Error('scripted check failure')
      let cancelled = false
      const downloaded = (async () => {
        for (const step of s.steps ?? [0, 100]) {
          if (cancelled) throw new Error('scripted download cancelled')
          onProgress(step)
          await wait(s.stepMs ?? 0)
        }
        if (s.download === 'fail') throw new Error('scripted download failure')
        if (s.download === 'hold') await new Promise<never>(() => {})
      })()
      return { version: s.version ?? '', downloaded, cancel: () => { cancelled = true } }
    },
    async install(): Promise<void> {
      record('install')
      if (read().install === 'fail') throw new Error('scripted install failure')
      await new Promise<never>(() => {})
    }
  }
}
