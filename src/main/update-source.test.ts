// The update sources: which one a run uses, the production updater's settings, and the scripted source e2e
// drives. The production adapter's calls into electron-updater are not reachable here (unit tests never load
// Electron). Gap, with its condition: the adapter's check against GitHub is accepted by evidence from a
// packaged run; its wait for Squirrel.Mac to stage the package, the restart into the new version (with the
// display-cache flush on the way out, Failure C1), install on quit without relaunch, a package the system
// rejects (H2) and channel selection on real releases are accepted once two releases exist (app-update
// Testing Decisions).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { UPDATE_FEED, chooseUpdateSource, scriptedUpdateSource, updaterSettings } from './update-source'

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

  // The packaging writes the update metadata for the provider it is given (electron-builder.yml's publish), and
  // releases go where that provider says; the app reads UPDATE_FEED. The two must name the same place, or the app
  // looks for releases where none are published. Parsed with the YAML parser electron-builder itself uses, which the
  // packaging asset loads (build/mac-packaging.cjs)
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

  it('answers each check from the script as it stands, and records every request', async () => {
    const source = scriptedUpdateSource(script)
    write({ check: 'upToDate' })
    expect(await source.check(() => {})).toBeNull()
    write({ check: 'fail' })
    await expect(source.check(() => {})).rejects.toThrow()
    expect(requests()).toEqual(['check', 'check'])
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
