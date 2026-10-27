// The update sources: which one a run uses, the production updater's settings, the scripted source e2e drives,
// and the installed copy's wait for Squirrel.Mac to stage the package, with electron-updater's updater and
// Electron's native updater injected as fakes (unit tests never load Electron). Gaps, each with its condition:
// the adapter's check against GitHub is accepted by evidence from a packaged run; the restart into the new
// version, install on quit without relaunch, the system updater's signature check on a real package (H2) and
// channel selection for a pre-release installation are accepted by evidence once an installation of one release
// has updated to the next; the display-cache flush on the install's quit (Failure C1) cannot be seen there, since
// a save is written at once and nothing is pending at a click, and rests on the quit path the install takes; a
// package the system updater rejects at install, after the app has quit, is left to Squirrel.Mac, which keeps the
// version in place, and no test of the app reaches it (H2); channel selection for a formal installation waits for
// a pre-release published after the first formal release (app-update Testing Decisions).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { UPDATE_FEED, chooseUpdateSource, electronUpdateSource, scriptedUpdateSource, updaterSettings, type NativeUpdater, type Updater } from './update-source'
import type { UpdateSource } from './update-controller'

describe('updaterSettings', () => {
  it('downloads at once, installs on quit, never downgrades', () => {
    const s = updaterSettings('0.2.0')
    expect(s.autoDownload).toBe(true)
    expect(s.autoInstallOnAppQuit).toBe(true)
    expect(s.allowDowngrade).toBe(false)
  })

  it('a pre-release installation is offered pre-releases, a formal one is not (US-004/AC-01, AC-02, AC-03)', () => {
    expect(updaterSettings('0.1.0-beta').allowPrerelease).toBe(true)
    expect(updaterSettings('0.1.0-beta.2').allowPrerelease).toBe(true)
    // After updating to a formal release the running version is formal, so the formal rule applies
    expect(updaterSettings('0.1.0').allowPrerelease).toBe(false)
    // A locally packaged build is an installation of its version like any other (Failure E5)
    expect(updaterSettings('0.3.1').allowPrerelease).toBe(false)
  })

  it('reads GitHub Releases of this repository, never the R2 mirror (CON-002)', () => {
    expect(UPDATE_FEED).toEqual({ provider: 'github', owner: 'aloong-planet', repo: 'agentshed' })
  })

  // The packaging writes the update metadata in the form its declared provider's updater reads (electron-builder.yml's
  // publish: latest-mac.yml for GitHub) and names that feed in the app's app-update.yml; the app reads UPDATE_FEED.
  // The two must be the same feed, or a release carries metadata for a feed the app does not read. Parsed with the
  // YAML parser electron-builder itself uses, which the packaging asset loads (build/mac-packaging.cjs)
  it('the packaging publishes where the app reads (mac-distribution::REQ-001/AC-02)', () => {
    const require = createRequire(import.meta.url)
    const { yamlParser } = require('../../build/mac-packaging.cjs') as { yamlParser: () => { load: (text: string) => unknown } }
    const config = yamlParser().load(readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8')) as { publish?: unknown }
    expect(config.publish).toEqual(UPDATE_FEED)
  })
})

describe('chooseUpdateSource', () => {
  it('a packaged app reads GitHub; a development run has no source; the script seam overrides both', () => {
    expect(chooseUpdateSource({ packaged: true, env: {} })).toEqual({ kind: 'github' })
    expect(chooseUpdateSource({ packaged: false, env: {} })).toBeNull()
    // The seam stands in for "packaged" for the update feature only (Testing Decisions)
    expect(chooseUpdateSource({ packaged: false, env: { AGENTSHED_UPDATE_SCRIPT: '/tmp/u.json' } }))
      .toEqual({ kind: 'scripted', script: '/tmp/u.json' })
    expect(chooseUpdateSource({ packaged: true, env: { AGENTSHED_UPDATE_SCRIPT: '/tmp/u.json' } }))
      .toEqual({ kind: 'scripted', script: '/tmp/u.json' })
    // An empty value is not a declaration
    expect(chooseUpdateSource({ packaged: false, env: { AGENTSHED_UPDATE_SCRIPT: '' } })).toBeNull()
  })
})

describe('scriptedUpdateSource', () => {
  let dir: string
  let script: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'update-script-'))
    script = join(dir, 'update.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const write = (v: object): void => writeFileSync(script, JSON.stringify(v))
  const requests = (): string[] => readFileSync(`${script}.log`, 'utf8').trim().split('\n')
  /** Whether a check or a download has settled within `ms` */
  const within = (p: Promise<unknown> | undefined, ms: number): Promise<'settled' | 'pending'> =>
    Promise.race([
      (p ?? Promise.resolve()).then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms))
    ])

  it('answers each check from the script as it stands, and records every request', async () => {
    const source = scriptedUpdateSource(script)
    write({ check: 'upToDate' })
    expect(await source.check(() => {})).toBeNull()
    write({ check: 'fail' })
    await expect(source.check(() => {})).rejects.toThrow()
    expect(requests()).toEqual(['check', 'check'])
  })

  it('a check can stay in flight while the script says so, and answers once the script no longer holds it', async () => {
    const source = scriptedUpdateSource(script)
    write({ check: 'upToDate', holdCheck: true })
    const checking = source.check(() => {})
    expect(await within(checking, 150)).toBe('pending')
    write({ check: 'upToDate' })
    expect(await within(checking, 1000)).toBe('settled')
    expect(await checking).toBeNull()
  })

  it('a check whose own script did not ask for the hold is not held by a later script that does', async () => {
    const source = scriptedUpdateSource(script)
    write({ check: 'upToDate', checkMs: 100 })
    const checking = source.check(() => {})
    await new Promise((r) => setTimeout(r, 20))
    write({ check: 'upToDate', holdCheck: true })
    expect(await within(checking, 1000)).toBe('settled')
  })

  it('a found update reports its progress steps, then completes or fails as scripted', async () => {
    const source = scriptedUpdateSource(script)
    write({ check: 'found', version: '9.9.0', steps: [0, 40, 100], stepMs: 5, download: 'complete' })
    const seen: number[] = []
    const found = await source.check((p) => seen.push(p))
    expect(found?.version).toBe('9.9.0')
    await found?.downloaded
    expect(seen).toEqual([0, 40, 100])
    write({ check: 'found', version: '9.9.0', steps: [0, 30], stepMs: 5, download: 'fail' })
    const failing = await source.check(() => {})
    await expect(failing?.downloaded).rejects.toThrow()
  })

  it('a found update can hold at its first step, and moves on once the script no longer holds it', async () => {
    const source = scriptedUpdateSource(script)
    const download = { check: 'found', version: '9.9.0', steps: [0, 40, 100], stepMs: 5, download: 'complete' }
    write({ ...download, holdFirstStep: true })
    const seen: number[] = []
    const found = await source.check((p) => seen.push(p))
    expect(await within(found?.downloaded, 150)).toBe('pending')
    expect(seen).toEqual([0])
    write(download)
    expect(await within(found?.downloaded, 1000)).toBe('settled')
    await found?.downloaded
    expect(seen).toEqual([0, 40, 100])
  })

  it('a held download stays held while its script cannot be read, as when a test is rewriting it', async () => {
    const source = scriptedUpdateSource(script)
    const download = { check: 'found', version: '9.9.0', steps: [0, 40, 100], stepMs: 5, download: 'complete' }
    write({ ...download, holdFirstStep: true })
    const seen: number[] = []
    const found = await source.check((p) => seen.push(p))
    writeFileSync(script, '{"check":"fou')
    expect(await within(found?.downloaded, 150)).toBe('pending')
    expect(seen).toEqual([0])
    write(download)
    await found?.downloaded
    expect(seen).toEqual([0, 40, 100])
  })

  it('a download whose own script did not ask for the hold is not held by a later script that does', async () => {
    const source = scriptedUpdateSource(script)
    const download = { check: 'found', version: '9.9.0', checkMs: 100, steps: [0, 40, 100], stepMs: 5, download: 'complete' }
    write(download)
    const seen: number[] = []
    const checking = source.check((p) => seen.push(p))
    await new Promise((r) => setTimeout(r, 20))
    write({ ...download, holdFirstStep: true })
    const found = await checking
    expect(await within(found?.downloaded, 1000)).toBe('settled')
    expect(seen).toEqual([0, 40, 100])
  })

  it('a held download that is cancelled fails', async () => {
    const source = scriptedUpdateSource(script)
    write({ check: 'found', version: '9.9.0', steps: [0, 40, 100], stepMs: 5, download: 'complete', holdFirstStep: true })
    const found = await source.check(() => {})
    found?.cancel()
    expect(await within(found?.downloaded, 500)).toBe('settled')
    await expect(found?.downloaded).rejects.toThrow('cancelled')
  })

  it('an install records itself and then fails, or holds, as scripted', async () => {
    const source = scriptedUpdateSource(script)
    write({ install: 'fail' })
    await expect(source.install()).rejects.toThrow()
    write({ install: 'hold' })
    const held = source.install()
    const raced = await Promise.race([held.then(() => 'settled'), new Promise((r) => setTimeout(() => r('held'), 30))])
    expect(raced).toBe('held')
    expect(requests()).toEqual(['install', 'install'])
  })

  it('a missing or unreadable script answers a failed check', async () => {
    const source = scriptedUpdateSource(script)
    await expect(source.check(() => {})).rejects.toThrow()
    writeFileSync(script, '{not json')
    await expect(source.check(() => {})).rejects.toThrow()
  })
})

describe('electronUpdateSource: the installed copy over electron-updater and Squirrel.Mac, both injected', () => {
  /** Electron's native autoUpdater: Squirrel.Mac says update-downloaded once it has checked and staged the package */
  const nativeUpdater = (): EventEmitter & NativeUpdater => new EventEmitter() as EventEmitter & NativeUpdater
  /**
   * electron-updater's MacUpdater as far as the source reaches it: a check that finds 0.1.0-beta.2 (Failure E1), or
   * nothing newer, with a download the case settles and a cancellation token; its own events; and the flag MacUpdater
   * sets when the native updater says update-downloaded
   */
  const macUpdater = (native: EventEmitter, found = true) => {
    let download = { resolve: (): void => {}, reject: (_e: Error): void => {} }
    const downloaded = new Promise<string[]>((resolve, reject) => (download = { resolve: () => resolve([]), reject }))
    const token = { cancelled: false, cancel: (): void => void (token.cancelled = true) }
    const events = new EventEmitter()
    const updater: Updater = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowDowngrade: true,
      allowPrerelease: false,
      squirrelDownloadedUpdate: false,
      setFeedURL: () => {},
      checkForUpdates: () =>
        Promise.resolve(
          found
            ? { isUpdateAvailable: true, updateInfo: { version: '0.1.0-beta.2' }, downloadPromise: downloaded, cancellationToken: token }
            : { isUpdateAvailable: false, updateInfo: { version: '0.1.0-beta' }, downloadPromise: null }
        ),
      quitAndInstall: () => {},
      on: (event, listener) => events.on(event, listener),
      once: (event, listener) => events.once(event, listener)
    }
    native.on('update-downloaded', () => (updater.squirrelDownloadedUpdate = true))
    native.on('error', () => {})
    return { updater, download, token, events }
  }
  /** The installed copy's source, running 0.1.0-beta, over the two fakes */
  const installedSource = (updater: Updater, native: NativeUpdater): UpdateSource =>
    electronUpdateSource('0.1.0-beta', { updater: () => Promise.resolve(updater), native: () => Promise.resolve(native) })
  /** Whether a download has settled within `ms` */
  const within = (p: Promise<unknown> | undefined, ms: number): Promise<'settled' | 'pending'> =>
    Promise.race([
      (p ?? Promise.resolve()).then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms))
    ])

  it('a found update is not ready until Squirrel.Mac has staged it', async () => {
    const native = nativeUpdater()
    const { updater, download } = macUpdater(native)
    const found = await installedSource(updater, native).check(() => {})
    expect(found?.version).toBe('0.1.0-beta.2')
    download.resolve()
    expect(await within(found?.downloaded, 50)).toBe('pending')
    native.emit('update-downloaded')
    expect(await within(found?.downloaded, 1000)).toBe('settled')
    await found?.downloaded
  })

  it('a package Squirrel.Mac rejects while staging it is a failed download', async () => {
    const native = nativeUpdater()
    const { updater, download } = macUpdater(native)
    const found = await installedSource(updater, native).check(() => {})
    download.resolve()
    expect(await within(found?.downloaded, 50)).toBe('pending')
    // Squirrel.Mac's own message for a package whose signature does not match the running app's
    native.emit('error', new Error('Code signature at URL file:///update/Agentshed.app did not pass validation'))
    await expect(found?.downloaded).rejects.toThrow('did not pass validation')
  })

  it('a package Squirrel.Mac staged before electron-updater reports the download done is ready at once', async () => {
    const native = nativeUpdater()
    const { updater, download } = macUpdater(native)
    const found = await installedSource(updater, native).check(() => {})
    native.emit('update-downloaded')
    download.resolve()
    expect(await within(found?.downloaded, 1000)).toBe('settled')
    await found?.downloaded
  })

  it('a download that fails before Squirrel.Mac has the package is a failed download', async () => {
    const native = nativeUpdater()
    const { updater, download } = macUpdater(native)
    const found = await installedSource(updater, native).check(() => {})
    download.reject(new Error('net::ERR_CONNECTION_RESET'))
    await expect(found?.downloaded).rejects.toThrow('ERR_CONNECTION_RESET')
  })

  it('a check that finds no newer version answers up to date', async () => {
    const native = nativeUpdater()
    const { updater } = macUpdater(native, false)
    expect(await installedSource(updater, native).check(() => {})).toBeNull()
  })

  it("the download's progress reaches the one who asked for the check", async () => {
    const native = nativeUpdater()
    const { updater, events } = macUpdater(native)
    const seen: number[] = []
    await installedSource(updater, native).check((percent) => seen.push(percent))
    events.emit('download-progress', { percent: 42.5 })
    expect(seen).toEqual([42.5])
  })

  it('an error the updater reports after the click is a failed install', async () => {
    const native = nativeUpdater()
    const { updater, events } = macUpdater(native)
    const installing = installedSource(updater, native).install()
    expect(await within(installing, 50)).toBe('pending')
    events.emit('error', new Error('Could not write the update request'))
    await expect(installing).rejects.toThrow('Could not write the update request')
  })

  it('a quitAndInstall that throws is a failed install', async () => {
    const native = nativeUpdater()
    const { updater } = macUpdater(native)
    updater.quitAndInstall = () => {
      throw new Error("No update available, can't quit and install")
    }
    await expect(installedSource(updater, native).install()).rejects.toThrow("can't quit and install")
  })

  it("dropping a found update cancels electron-updater's download", async () => {
    const native = nativeUpdater()
    const { updater, token } = macUpdater(native)
    const found = await installedSource(updater, native).check(() => {})
    expect(token.cancelled).toBe(false)
    found?.cancel()
    expect(token.cancelled).toBe(true)
  })
})
