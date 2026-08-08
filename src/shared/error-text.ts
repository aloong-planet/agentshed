// 结构化错误 → 当前语言的措辞。
//
// 与 ./errors 分开是为了让**抛出侧**(主进程)不必依赖 i18n 字典:主进程只产码与参数,
// 成句发生在渲染层。这里是两者唯一的汇合点。
import { ERR, decodeAppError, type ErrorCode, type ErrorParams } from './errors'
import { dictOf, type Language } from './i18n'

/** 参数取值是 `string | number`,取用时按位置需要的类型收一下;缺席给空/0 */
const s = (p: ErrorParams, k: string): string => {
  const v = p[k]
  return v === undefined ? '' : String(v)
}
const n = (p: ErrorParams, k: string): number => {
  const v = p[k]
  return typeof v === 'number' ? v : Number(v ?? 0)
}

/**
 * 把 catch 到的任意东西渲染成当前语言的一句话。
 *
 * 解不出结构化载荷的(票 06 之前尚未迁移的旧式错误、以及任何意外值)**原样显示**——
 * 与改造前 `String(e)` 的表现一致,不崩、不空白。
 */
export function errorText(lang: Language, raw: unknown): string {
  const err = decodeAppError(raw)
  if (!err) return raw instanceof Error ? raw.message : String(raw)
  const t = dictOf(lang).errors
  const p = err.params
  // switch 而非查表:末尾的 never 断言让**新增错误码却忘了配措辞**变成编译错误,
  // 而不是运行期显示空白。ADR-0015 要的"新增失败路径时叫什么是必答题"就落在这。
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
    default:
      return exhaustive(err.code)
  }
}

/** 漏配措辞时在**编译期**报错:参数类型是 never,任何未被上面消化的码都塞不进来 */
function exhaustive(code: never): string {
  return String(code as ErrorCode)
}
