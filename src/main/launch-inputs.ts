// What a packaged build refuses at launch (ADR-0042, mac-distribution::CON-008): the guard's decision, a pure function so
// that its bypass vectors can be unit tested. An allow-list, because Chromium's switches are no fixed list.

/** The one switch accepted: it moves where the settings live and runs nothing */
const ACCEPTED_SWITCHES: ReadonlySet<string> = new Set(['--user-data-dir'])
/** A test seam is named with this prefix, so a new one is refused without another line here */
const SEAM_PREFIX = 'AGENTSHED_'
const DEV_SERVER_URL = 'ELECTRON_RENDERER_URL'
/** Older macOS launches carried this token. It is not a Chromium switch, and refusing it would stop the app opening */
const LAUNCH_TOKEN_PREFIX = '-psn_'

/**
 * The names of the inputs to refuse: the arguments after the executable, then the environment. A name only, since a value
 * could hold anything. Chromium reads a switch with one dash as it does with two, so any leading dash counts, and the bare
 * `--` is refused along with them rather than reasoned about.
 */
export function refusedLaunchInputs(args: readonly string[], env: Readonly<Record<string, string | undefined>>): string[] {
  const switches = args
    .filter((arg) => arg.startsWith('-') && !arg.startsWith(LAUNCH_TOKEN_PREFIX))
    .map((arg) => arg.split('=')[0])
    .filter((name) => !ACCEPTED_SWITCHES.has(name))
  const variables = Object.keys(env).filter((name) => name === DEV_SERVER_URL || name.startsWith(SEAM_PREFIX))
  return [...switches, ...variables]
}

/** EX_USAGE: the packaging check tells a refusal from a crash by this code (mac-distribution::CON-008/AC-05) */
const REFUSED_EXIT_CODE = 64

/** What a launch has to do about its inputs: nothing from source, where e2e, smoke and development use their seams */
export function launchRefusal(run: {
  packaged: boolean
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
}): { message: string; exitCode: number } | null {
  if (!run.packaged) return null
  const refused = refusedLaunchInputs(run.argv.slice(1), run.env)
  if (refused.length === 0) return null
  return { message: `Agentshed: an installed copy does not start with ${refused.join(', ')}.`, exitCode: REFUSED_EXIT_CODE }
}
