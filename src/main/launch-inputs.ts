// What a packaged build refuses at launch (ADR-0042, mac-distribution::CON-008): the guard's decision, a pure function so
// that its bypass vectors can be unit tested. An allow-list of whole arguments, compared as they were given: Chromium's
// switches are no fixed list, and how it reads an argument (it trims whitespace first; on Windows a slash starts a switch)
// is not something to reproduce here, since the guard would fail again at the next difference nobody has read.

/**
 * The arguments accepted, each by the start it must have, exactly: the settings directory, which moves where the settings
 * live and runs nothing, and the token older macOS launches carried, which is not a Chromium switch and whose refusal would
 * stop the app opening
 */
const ACCEPTED_ARGUMENT_STARTS: readonly string[] = ['--user-data-dir=', '-psn_']
/** A test seam is named with this prefix, so a new one is refused without another line here */
const SEAM_PREFIX = 'AGENTSHED_'
const DEV_SERVER_URL = 'ELECTRON_RENDERER_URL'
/** How an argument that is not a switch is named: its text could be a path or anything else */
const NOT_A_SWITCH = 'an argument that is not a switch'

/** A refused argument's name: a switch's past any leading whitespace and up to its `=`, never a value */
function refusedArgumentName(arg: string): string {
  const trimmed = arg.trimStart()
  return trimmed.startsWith('-') ? trimmed.split('=')[0] : NOT_A_SWITCH
}

/**
 * The names of the inputs to refuse: the arguments after the executable, then the environment. A name only, since a value
 * could hold anything.
 */
export function refusedLaunchInputs(args: readonly string[], env: Readonly<Record<string, string | undefined>>): string[] {
  const refusedArguments = args
    .filter((arg) => !ACCEPTED_ARGUMENT_STARTS.some((start) => arg.startsWith(start)))
    .map(refusedArgumentName)
  // In any case: Windows reads the environment that way (per Node's documentation), so a guard need not know the platform
  const variables = Object.keys(env).filter((name) => {
    const upper = name.toUpperCase()
    return upper === DEV_SERVER_URL || upper.startsWith(SEAM_PREFIX)
  })
  return [...refusedArguments, ...variables]
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
