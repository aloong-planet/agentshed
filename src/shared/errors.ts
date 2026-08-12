// The single type source for cross-process failures (ADR-0015): an error **code plus parameters**,
// containing no natural language at all.
// The wording is produced in the renderer in the current language, see the i18n dictionaries' `errors`
// section.
//
// This is the fourth of ADR-0001's "three shared pieces", and both ends import only from here.
//
// ── Why the payload is encoded into the message ──
// When Electron sends an Error thrown by the main process back across IPC, **its custom properties are
// all lost**
// (measured: `Object.getOwnPropertyNames(err)` leaves only `stack` / `message`),
// and the message is wrapped in a prefix:
//   `Error invoking remote method 'agentshed:get-project-detail': Error: <the original>`
// So `e.code = …` never reaches the other side; the code and parameters can only be serialised into the
// message,
// and decoding extracts them from **the wrapped** string by the marker.

/** The error code enum. A new failure path must be registered here with all six languages' wording —
 * missing one fails typecheck */
export const ERR = {
  /** The call arguments do not meet the contract (a programming error; params.channel is required,
   * params.field optional) */
  badArgs: 'bad-args',
  /** The session path is not allow-listed: open the project detail page or refresh globally first */
  sessionNotWhitelisted: 'session-not-whitelisted',
  /** The scan engine is not ready yet */
  engineNotReady: 'engine-not-ready',
  /** The turn index is out of range (params.i and params.total) */
  turnOutOfRange: 'turn-out-of-range',
  /** The artifact path is not allow-listed */
  artifactNotWhitelisted: 'artifact-not-whitelisted',
  /** The plugin package root is not in the scan's registration set */
  pluginRootNotRegistered: 'plugin-root-not-registered',
  /** The project detail page has not been opened yet */
  projectNotOpened: 'project-not-opened',
  /** The skill package is unavailable or not under an allowed root */
  skillPackageUnavailable: 'skill-package-unavailable',
  /** The skill file path is not allow-listed */
  skillFileNotWhitelisted: 'skill-file-not-whitelisted',
  /** The skill file cannot be read */
  skillFileUnreadable: 'skill-file-unreadable',
  /** The session is not in the index; refresh globally first */
  sessionNotIndexed: 'session-not-indexed',
  /** The session file can no longer be read (moved or deleted) */
  sessionFileUnreadable: 'session-file-unreadable',
  /** The session's first-line metadata cannot be read, so the index cannot be rebuilt */
  sessionMetaUnreadable: 'session-meta-unreadable',
  /** The session file failed to parse */
  sessionParseFailed: 'session-parse-failed',
  /** Preference storage is not ready */
  prefsStoreNotReady: 'prefs-store-not-ready',
  /** The preference value does not meet the contract (params.field: theme / language / mode) */
  invalidPref: 'invalid-pref',
  /** Contract validation of a cross-process payload: a field is missing (params.what is the payload's
   * name, params.path the field path) */
  contractMissing: 'contract-missing',
  /**
   * Contract validation: the field type does not match.
   * params.expect is **type notation** (`string|null` / `array` / `object`), language-independent and
   * **not translated** —
   * handled the same way as unit symbols like KB / MB / ms: it is notation, not natural language.
   */
  contractType: 'contract-type',
  /** Contract validation: an enum field received a value outside its domain (params.value is what was
   * actually received) */
  contractEnum: 'contract-enum',
  /** The IPC caller is untrusted (params.sender) */
  untrustedSender: 'untrusted-sender',
  /** A link protocol inside rendered content is not supported */
  linkProtocolUnsupported: 'link-protocol-unsupported',
  /** A link target inside rendered content is outside the readable range */
  linkOutOfScope: 'link-out-of-scope',
  /** The skill name is invalid */
  skillBadName: 'skill-bad-name',
  /** The target is a stale project (its directory does not exist) */
  skillStaleTarget: 'skill-stale-target',
  /** The global library has no such skill (params.name) */
  skillMissingSource: 'skill-missing-source',
  /** The project-level copy does not exist */
  skillCopyMissing: 'skill-copy-missing',
  /** The target already has a project-level skill of the same name; blocked rather than overwritten */
  skillConflict: 'skill-conflict',
  /** The copy failed and was cleaned up (params.detail is the underlying error string) */
  skillCopyFailed: 'skill-copy-failed',
  /** The delete failed (params.detail) */
  skillDeleteFailed: 'skill-delete-failed',

  // ── Failures on data fields (ticket 07): not thrown errors, but probe and parse results sent down
  // with the snapshot ──
  /** The agent registry's projects key is missing or not an object */
  registryProjectsInvalid: 'registry-projects-invalid',
  /** The registry failed to parse (params.detail) */
  registryParseFailed: 'registry-parse-failed',
  /** The subagent definition file cannot be read (a permission or IO error) */
  subagentUnreadable: 'subagent-unreadable',
  /** The subagent's toml failed to parse (params.detail) */
  subagentTomlFailed: 'subagent-toml-failed',
  /** The subagent has no valid name field (Codex does not load this file) */
  subagentMissingName: 'subagent-missing-name'
} as const

export type ErrorCode = (typeof ERR)[keyof typeof ERR]

const ALL_CODES: readonly string[] = Object.values(ERR)

export function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && ALL_CODES.includes(v)
}

/**
 * Error parameters. The values may only be **language-independent** things: identifiers (channel names,
 * field names), paths and numbers.
 * Never finished wording — that is precisely what this protocol exists to eliminate.
 */
export type ErrorParams = Record<string, string | number>

export interface AppError {
  code: ErrorCode
  params: ErrorParams
}

/**
 * The payload marker. A prefix that will not occur in a natural sentence, used to locate the payload
 * inside the wrapped string when decoding;
 * the payload is always **last**, so everything from the marker to the end of the string is taken.
 */
const MARKER = 'agentshed-error:'

export function encodeAppError(err: AppError): string {
  return MARKER + JSON.stringify({ code: err.code, params: err.params })
}

/** A convenience throw site for the main process: `throw appError(ERR.engineNotReady)` */
export function appError(code: ErrorCode, params: ErrorParams = {}): Error {
  return new Error(encodeAppError({ code, params }))
}

/**
 * Decode a structured error out of anything caught; returns `null` when it will not decode.
 *
 * All three cases returning null **deliberately do not throw** — each should degrade to "display it as
 * an old-style string error":
 *   (1) an old-style error not yet converted during migration (closed only by ticket 06);
 *   (2) bad JSON following the marker;
 *   (3) a code outside the enum (passing an unknown code through would leave the renderer with no
 *       wording and a blank display, so falling back to the original is better).
 */
export function decodeAppError(raw: unknown): AppError | null {
  const text =
    typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : null
  if (text === null) return null
  const at = text.indexOf(MARKER)
  if (at < 0) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(at + MARKER.length))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { code, params } = parsed as { code?: unknown; params?: unknown }
    if (!isErrorCode(code)) return null
    if (params !== undefined && (typeof params !== 'object' || params === null)) return null
    return { code, params: (params as ErrorParams) ?? {} }
  } catch {
    return null
  }
}
