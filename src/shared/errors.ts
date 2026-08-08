// 跨进程失败的单一类型源(ADR-0015):错误**码 + 参数**,不含任何自然语言。
// 措辞在 renderer 按当前语言生成,见 i18n 字典的 `errors` 段。
//
// 这是 ADR-0001「shared 三件套」扩成的第四件,两端只从此处导入。
//
// ── 为什么载荷编进 message ──
// Electron 把主进程抛出的 Error 跨 IPC 回传时,**自定义属性一律丢失**
// (实测 `Object.getOwnPropertyNames(err)` 只剩 `stack` / `message`),
// 且 message 会被包一层前缀:
//   `Error invoking remote method 'agentshed:get-project-detail': Error: <原文>`
// 所以 `e.code = …` 这种写法到不了对岸,只能把码与参数序列化进 message,
// 解码时再从**被包裹的**串里按标记抠出来。

/** 错误码枚举。新增失败路径时必须在此登记,并补齐六语措辞——漏补即 typecheck 失败 */
export const ERR = {
  /** 调用参数不合契约(编程错误;params.channel 必填,params.field 可选) */
  badArgs: 'bad-args',
  /** 会话路径不在白名单:需先打开项目详情或全局刷新 */
  sessionNotWhitelisted: 'session-not-whitelisted',
  /** 扫描引擎尚未就绪 */
  engineNotReady: 'engine-not-ready',
  /** 轮次下标越界(params.i 与 params.total) */
  turnOutOfRange: 'turn-out-of-range',
  /** 产物路径不在白名单 */
  artifactNotWhitelisted: 'artifact-not-whitelisted',
  /** 插件包根不在扫描登记集 */
  pluginRootNotRegistered: 'plugin-root-not-registered',
  /** 项目详情尚未打开 */
  projectNotOpened: 'project-not-opened',
  /** skill 包不可用或不在允许根下 */
  skillPackageUnavailable: 'skill-package-unavailable',
  /** skill 文件路径不在白名单 */
  skillFileNotWhitelisted: 'skill-file-not-whitelisted',
  /** skill 文件不可读 */
  skillFileUnreadable: 'skill-file-unreadable',
  /** 会话不在索引中,需先全局刷新 */
  sessionNotIndexed: 'session-not-indexed',
  /** 会话文件已不可读(被移动或删除) */
  sessionFileUnreadable: 'session-file-unreadable',
  /** 会话首行元数据不可读,无法重建索引 */
  sessionMetaUnreadable: 'session-meta-unreadable',
  /** 会话文件解析失败 */
  sessionParseFailed: 'session-parse-failed',
  /** 偏好存储未就绪 */
  prefsStoreNotReady: 'prefs-store-not-ready',
  /** 偏好取值不合契约(params.field:scheme / language / mode) */
  invalidPref: 'invalid-pref',
  /** 跨进程载荷的契约校验:某字段缺失(params.what 载荷名、params.path 字段路径) */
  contractMissing: 'contract-missing',
  /**
   * 契约校验:字段类型不符。
   * params.expect 是**类型记法**(`string|null` / `array` / `object`),语言无关、**不翻译**——
   * 与 KB / MB / ms 这类单位符号同一处置:它是记法不是自然语言。
   */
  contractType: 'contract-type',
  /** 契约校验:枚举字段收到不在取值域内的值(params.value 为实际收到的值) */
  contractEnum: 'contract-enum',
  /** IPC 调用方不可信(params.sender) */
  untrustedSender: 'untrusted-sender',
  /** 渲染内容里的链接协议不受支持 */
  linkProtocolUnsupported: 'link-protocol-unsupported',
  /** 渲染内容里的链接目标不在可读范围 */
  linkOutOfScope: 'link-out-of-scope',
  /** skill 名不合法 */
  skillBadName: 'skill-bad-name',
  /** 目标是失效项目(目录不存在) */
  skillStaleTarget: 'skill-stale-target',
  /** 全局库无此 skill(params.name) */
  skillMissingSource: 'skill-missing-source',
  /** 项目级副本不存在 */
  skillCopyMissing: 'skill-copy-missing',
  /** 目标已有同名项目级 skill,已阻止不覆盖 */
  skillConflict: 'skill-conflict',
  /** 复制失败已清理(params.detail 为底层错误串) */
  skillCopyFailed: 'skill-copy-failed',
  /** 删除失败(params.detail) */
  skillDeleteFailed: 'skill-delete-failed',

  // ── 数据字段里的失败(票 07):不是抛出的错误,而是随快照下发的探测/解析结果 ──
  /** agent 注册表的 projects 键缺失或非对象 */
  registryProjectsInvalid: 'registry-projects-invalid',
  /** 注册表解析失败(params.detail) */
  registryParseFailed: 'registry-parse-failed',
  /** subagent 定义文件不可读(权限或 IO 异常) */
  subagentUnreadable: 'subagent-unreadable',
  /** subagent 的 toml 解析失败(params.detail) */
  subagentTomlFailed: 'subagent-toml-failed',
  /** subagent 缺有效 name 字段(Codex 不加载此文件) */
  subagentMissingName: 'subagent-missing-name'
} as const

export type ErrorCode = (typeof ERR)[keyof typeof ERR]

const ALL_CODES: readonly string[] = Object.values(ERR)

export function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && ALL_CODES.includes(v)
}

/**
 * 错误参数。取值只允许**语言无关**的东西:标识符(通道名、字段名)、路径、数字。
 * 绝不放已成句的措辞——那正是本协议要消灭的东西。
 */
export type ErrorParams = Record<string, string | number>

export interface AppError {
  code: ErrorCode
  params: ErrorParams
}

/**
 * 载荷标记。取一个不会在自然语句里出现的前缀,解码时据此在被包裹的串中定位;
 * 载荷一律排在**末尾**,故从标记之后一直取到串尾。
 */
const MARKER = 'agentshed-error:'

export function encodeAppError(err: AppError): string {
  return MARKER + JSON.stringify({ code: err.code, params: err.params })
}

/** 主进程侧的便捷抛出口:`throw appError(ERR.engineNotReady)` */
export function appError(code: ErrorCode, params: ErrorParams = {}): Error {
  return new Error(encodeAppError({ code, params }))
}

/**
 * 从任意 catch 到的东西里解出结构化错误;解不出返回 `null`。
 *
 * 返回 null 的三类都**刻意不抛**——它们都该退化成"当旧式字符串错误原样显示":
 *   ① 迁移期尚未改造的旧式错误(票 06 才收口);
 *   ② 标记后跟着坏 JSON;
 *   ③ 码不在枚举内(透传未知码会让渲染层取不到措辞而显示空白,不如退回原样)。
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
