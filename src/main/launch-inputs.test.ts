// The decision of the launch guard, against its bypass vectors.
//
// Known gap: launch-guard.ts's three lines, which give this the real values, print the message and exit, run only in a
// packaged build, which no unit test or e2e case starts. The packaging check holds the exit code on the built app at every
// packaging. It does not read standard error, so the sentence on a real package is checked by hand (docs/ops/mac-signing.md).
import { describe, expect, it } from 'vitest'
import { launchRefusal, refusedLaunchInputs } from './launch-inputs'

/** An everyday environment, none of which is an input to refuse */
const EVERYDAY = { HOME: '/Users/a', PATH: '/usr/bin', TMPDIR: '/tmp/', USER: 'a', LANG: 'en_US.UTF-8', SHELL: '/bin/zsh' }

describe('the launch inputs a packaged build refuses (mac-distribution::CON-008)', () => {
  it('refuses nothing on a launch with no arguments, as Finder, the Dock and the updater make it', () => {
    expect(refusedLaunchInputs([], EVERYDAY)).toEqual([])
  })

  it('refuses nothing on a launch with only the settings directory', () => {
    expect(refusedLaunchInputs(['--user-data-dir=/tmp/x'], EVERYDAY)).toEqual([])
  })

  it.each([
    ['--remote-debugging-port=9222', '--remote-debugging-port'],
    ['-remote-debugging-port=9222', '-remote-debugging-port'],
    ['--remote-debugging-pipe', '--remote-debugging-pipe']
  ])('refuses the debugging port: %s', (arg, name) => {
    expect(refusedLaunchInputs([arg], {})).toEqual([name])
  })

  it.each(['--gpu-launcher', '--renderer-cmd-prefix', '--utility-cmd-prefix'])('refuses a switch that names a program: %s', (name) => {
    expect(refusedLaunchInputs([`${name}=/tmp/program`], {})).toEqual([name])
  })

  it.each(['--a-switch-nobody-has-listed=1', '--another-one', '-x'])('refuses a switch nobody has listed: %s', (arg) => {
    expect(refusedLaunchInputs([arg], {})).toHaveLength(1)
  })

  it.each([
    ['--user-data-dir-evil=/tmp/x', '--user-data-dir-evil'],
    ['--USER-DATA-DIR=/tmp/x', '--USER-DATA-DIR'],
    ['-user-data-dir=/tmp/x', '-user-data-dir'],
    ['--user-data-dirx', '--user-data-dirx']
  ])('refuses what only looks like the settings directory: %s', (arg, name) => {
    expect(refusedLaunchInputs([arg], {})).toEqual([name])
  })

  it('refuses an empty --type, which reaches the main process as any other launch does', () => {
    expect(refusedLaunchInputs(['--type='], {})).toEqual(['--type'])
  })

  it('names only the refused ones, in order, beside an accepted one', () => {
    expect(refusedLaunchInputs(['--a=1', '--user-data-dir=/tmp/x', '--b'], {})).toEqual(['--a', '--b'])
  })

  it('refuses the end-of-switches marker, and not an argument with no dash', () => {
    expect(refusedLaunchInputs(['--'], {})).toEqual(['--'])
    expect(refusedLaunchInputs(['/tmp/some-file'], {})).toEqual([])
  })

  it('accepts the token older macOS launches carried', () => {
    expect(refusedLaunchInputs(['-psn_0_12345'], {})).toEqual([])
  })

  it.each(['http://127.0.0.1:5173/', ''])('refuses the development server URL whatever its value: "%s"', (value) => {
    expect(refusedLaunchInputs([], { ELECTRON_RENDERER_URL: value })).toEqual(['ELECTRON_RENDERER_URL'])
  })

  it.each(['AGENTSHED_HOME_OVERRIDE', 'AGENTSHED_UPDATE_SCRIPT', 'AGENTSHED_A_SEAM_NOT_WRITTEN_YET'])('refuses a test seam by its prefix: %s', (name) => {
    expect(refusedLaunchInputs([], { [name]: '1' })).toEqual([name])
  })

  it.each(['AGENTSHED', 'XAGENTSHED_Y', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_RENDERER_URL_X'])(
    'leaves alone what is not a seam, and what the fuses close: %s',
    (name) => {
      expect(refusedLaunchInputs([], { [name]: '1' })).toEqual([])
    }
  )

  it('never carries a value, which could hold anything', () => {
    const refused = refusedLaunchInputs(['--gpu-launcher=/Users/a/secret/program'], { AGENTSHED_HOME_OVERRIDE: '/Users/a/secret', ELECTRON_RENDERER_URL: 'http://secret.example/' })
    expect(refused).toEqual(['--gpu-launcher', 'AGENTSHED_HOME_OVERRIDE', 'ELECTRON_RENDERER_URL'])
    expect(JSON.stringify(refused)).not.toContain('secret')
  })
})

describe('what a launch does about its inputs (mac-distribution::CON-008)', () => {
  it('does nothing in a run from source, whatever it carries', () => {
    expect(
      launchRefusal({ packaged: false, argv: ['/x/Electron', '.', '--remote-debugging-port=9222'], env: { AGENTSHED_HOME_OVERRIDE: '/tmp', ELECTRON_RENDERER_URL: 'http://localhost/' } })
    ).toBeNull()
  })

  it('does nothing in a packaged build with nothing to refuse', () => {
    expect(launchRefusal({ packaged: true, argv: ['/Applications/Agentshed.app/Contents/MacOS/Agentshed'], env: EVERYDAY })).toBeNull()
  })

  it('counts the first argument after the executable', () => {
    expect(launchRefusal({ packaged: true, argv: ['/x/Agentshed', '--gpu-launcher=/tmp/program'], env: {} })).toEqual({
      message: 'Agentshed: an installed copy does not start with --gpu-launcher.',
      exitCode: 64
    })
  })

  it('does not read the executable itself as an input', () => {
    expect(launchRefusal({ packaged: true, argv: ['-odd-path/Agentshed'], env: {} })).toBeNull()
  })

  it('says every refused input by name, and no value', () => {
    expect(launchRefusal({ packaged: true, argv: ['/x/Agentshed', '--a=/Users/a/secret', '--user-data-dir=/tmp/x'], env: { AGENTSHED_HOME_OVERRIDE: '/Users/a/secret' } })?.message).toBe(
      'Agentshed: an installed copy does not start with --a, AGENTSHED_HOME_OVERRIDE.'
    )
  })
})
