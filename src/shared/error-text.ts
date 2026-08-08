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
 * **兜底的性质自票 06 起变了**:此前它是"旧式协议兼容分支"——迁移未完成,跨进程还会
 * 传中文成句错误。票 06 收口后**已无任何跨进程生产者走这条路**(全库检索坐实:
 * `src/` 内除测试外 `throw new Error` 为 0 处,契约字段亦无成句 message)。
 *
 * 保留它是因为剩下的入口是**非协议错误**:渲染层自身的 TypeError、第三方库抛出的东西——
 * 这些永远不会有错误码。删掉兜底会让它们变成空白,而"报错时二次报错"比一句难看的
 * 原文更坏。故这不再是兼容分支,而是非协议异常的最后一道显示保障。
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
    default:
      return exhaustive(err.code)
  }
}

/** 漏配措辞时在**编译期**报错:参数类型是 never,任何未被上面消化的码都塞不进来 */
function exhaustive(code: never): string {
  return String(code as ErrorCode)
}
