// A structured error → wording in the current language.
//
// Kept separate from ./errors so that the **throwing side** (the main process) need not depend on the
// i18n dictionaries: it produces only codes and parameters,
// and sentence composition happens in the renderer. This is the one place the two meet.
import { ERR, decodeAppError, type ErrorParams } from './errors'
import { dictOf, type Language } from './i18n'

/** Parameter values are `string | number`, narrowed at the use site to whatever that position needs;
 * an absent one gives '' or 0 */
const s = (p: ErrorParams, k: string): string => {
  const v = p[k]
  return v === undefined ? '' : String(v)
}
const n = (p: ErrorParams, k: string): number => {
  const v = p[k]
  return typeof v === 'number' ? v : Number(v ?? 0)
}

/**
 * Render anything caught into one sentence in the current language.
 *
 * **The fallback's character changed as of ticket 06**: it used to be an "old-protocol compatibility
 * branch" — the migration was unfinished and cross-process calls still
 * carried whole-sentence Chinese errors. After ticket 06 closed the protocol, **no cross-process
 * producer takes this path at all** (confirmed by a whole-repository search:
 * zero `throw new Error` in `src/` outside tests, and no whole-sentence message on any contract field).
 *
 * It is kept because the remaining entry points are **non-protocol errors**: the renderer's own
 * TypeErrors and whatever a third-party library throws —
 * none of which will ever have an error code. Removing the fallback would turn them into blanks, and
 * "erroring while reporting an error" is worse than one ugly line of
 * original text. So this is no longer a compatibility branch but the last display guarantee for
 * non-protocol exceptions.
 */
export function errorText(lang: Language, raw: unknown): string {
  const err = decodeAppError(raw)
  if (!err) return raw instanceof Error ? raw.message : String(raw)
  const t = dictOf(lang).errors
  const p = err.params
  // A switch rather than a lookup table: the `never` assertion at the end turns **adding an error code
  // and forgetting its wording** into a compile error
  // rather than a blank at runtime. ADR-0015's "naming a new failure path is a mandatory question" lands
  // exactly here.
  switch (err.code) {
    case ERR.badArgs:
      return t.badArgs(s(p, 'channel'), s(p, 'field'))
    case ERR.sessionNotWhitelisted:
      return t.sessionNotWhitelisted
    case ERR.engineNotReady:
      return t.engineNotReady
    case ERR.turnOutOfRange:
      return t.turnOutOfRange(n(p, 'i'), n(p, 'total'))
    case ERR.artifactNotWhitelisted:
      return t.artifactNotWhitelisted
    case ERR.pluginRootNotRegistered:
      return t.pluginRootNotRegistered
    case ERR.projectNotOpened:
      return t.projectNotOpened
    case ERR.skillPackageUnavailable:
      return t.skillPackageUnavailable
    case ERR.skillFileNotWhitelisted:
      return t.skillFileNotWhitelisted
    case ERR.skillFileUnreadable:
      return t.skillFileUnreadable
    case ERR.sessionNotIndexed:
      return t.sessionNotIndexed
    case ERR.sessionFileUnreadable:
      return t.sessionFileUnreadable
    case ERR.sessionMetaUnreadable:
      return t.sessionMetaUnreadable
    case ERR.sessionParseFailed:
      return t.sessionParseFailed
    case ERR.prefsStoreNotReady:
      return t.prefsStoreNotReady
    case ERR.invalidPref:
      return t.invalidPref(s(p, 'field'))
    case ERR.contractMissing:
      return t.contractMissing(s(p, 'path'))
    case ERR.contractType:
      return t.contractType(s(p, 'path'), s(p, 'expect'))
    case ERR.contractEnum:
      return t.contractEnum(s(p, 'path'), s(p, 'value'))
    case ERR.untrustedSender:
      return t.untrustedSender(s(p, 'sender'))
    case ERR.linkProtocolUnsupported:
      return t.linkProtocolUnsupported
    case ERR.linkOutOfScope:
      return t.linkOutOfScope
    case ERR.skillBadName:
      return t.skillBadName
    case ERR.skillStaleTarget:
      return t.skillStaleTarget
    case ERR.skillMissingSource:
      return t.skillMissingSource(s(p, 'name'))
    case ERR.skillCopyMissing:
      return t.skillCopyMissing
    case ERR.skillConflict:
      return t.skillConflict
    case ERR.skillCopyFailed:
      return t.skillCopyFailed(s(p, 'detail'))
    case ERR.skillDeleteFailed:
      return t.skillDeleteFailed(s(p, 'detail'))
    case ERR.registryProjectsInvalid:
      return t.registryProjectsInvalid
    case ERR.registryParseFailed:
      return t.registryParseFailed(s(p, 'detail'))
    case ERR.subagentUnreadable:
      return t.subagentUnreadable
    case ERR.subagentTomlFailed:
      return t.subagentTomlFailed(s(p, 'detail'))
    case ERR.subagentMissingName:
      return t.subagentMissingName
    default:
      return exhaustive(err.code)
  }
}

/** Errors at **compile time** when wording is missing: the parameter type is `never`, so no code left
 * unconsumed above can be passed in */
function exhaustive(code: never): string {
  return String(code)
}
