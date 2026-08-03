// 提问索引:扫描阶段顺带记下"提问在哪",供点击后按字节区间取回整轮(spec C2)。
//
// **不存提问文本,连截断预览也不存**(spec D2a):提问约占全文 9.5%,全库进每次启动
// 都读的缓存是 MB 级负担;而 39.7% 的提问超过 60 字,截断预览既漏正文又会在搜索处
// 退化成第二套语料。文本一律按区间现读(热缓存实测 23ms)。
import { realUserText } from './session-title'

/**
 * 一条提问的索引,紧凑数组编码进缓存:
 * `[提问行起, 提问行止, 本轮止, 时间戳, 工具数, subagent 数]`
 *
 * - 提问自身 = `[0, 1)`;本轮内容 = `[1, 2)`(该提问之后到下一条提问之前,spec C1)。
 * - 偏移是**字节**,可直接喂 `createReadStream(file, { start, end })`。
 */
export type QuestionRec = [number, number, number, number | null, number, number]

export interface QuestionIndexer {
  /** 逐行喂入,顺序与文件一致 */
  line(obj: Record<string, unknown>, start: number, end: number): void
  /**
   * 首条真实提问**剥噪声之后**的文本(未截断);一条都没有则 null。
   * 调用方直接 `clipTitle` 成标题,**不要再过一遍 `realUserText`**——剥离不幂等。
   * 这样"哪一行算首条提问"只有索引器一个判断点,不会出现"标题有值但提问数为 0"
   * 这类同概念两个数字的分歧(spec A1 同类教训);末叶回溯把首条滤掉时标题同步改。
   */
  firstQuestionText(): string | null
  /**
   * 收尾:末轮的止点 = 最后一条**可解析**行的终点(调用方传入)。
   * 刻意不取文件字节大小:活跃会话可能正写到半行,那半行既解析不出也不该被切进
   * 轮次区间——取最后一条完整行的终点,按需取回时读到的永远是成形的内容。
   */
  done(fileEnd: number): QuestionRec[]
}

/** Claude 侧派发 subagent 的工具名。全库实测 Agent 152 次、Task 4 次——同一个工具的
 * 两代命名,入参同为 description/prompt/subagent_type。
 * 不改用"入参含 subagent_type"这个看似更机制化的判据:全库反查它会把一次
 * `TaskCreate` 误算进来,又漏掉 5 次没传该可选参的 `Agent`。日后再改名只会少算,
 * 不会错算——展示的是体量数字,少算不污染其他轮。 */
const CLAUDE_DISPATCH = new Set(['Agent', 'Task'])

/** Codex 侧派发 subagent 的 function_call 名(真实样本:namespace=collaboration) */
const CODEX_DISPATCH = 'spawn_agent'

/** Codex 的工具调用记录在 response_item 上;event_msg 那一路是同一批调用的 UI 事件镜像,
 * 只取一路才不会重复计数(与 spec「双写流二选一」同一个理由,只是这里选 response_item
 * ——它是模型实际发出的调用记录,event_msg 侧只有 *_end 事件、缺 function_call 的对应项)。
 *
 * 三种取自**全库枚举**(278 个文件 / 62,912 条带 payload 的行)的 response_item 全谱:
 * message 10311 · reasoning 6075 · custom_tool_call 3400 · function_call 1883 ·
 * agent_message 54 · **tool_search_call 25**,以及各自的 *_output。
 * `tool_search_call` 在 120 文件的采样里一次都没出现——正面枚举靠采样会漏,
 * 是 review 时改用全量才看见的。 */
const CODEX_CALL_TYPES = new Set(['custom_tool_call', 'function_call', 'tool_search_call'])

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/**
 * Claude 人类提问的文本;不是提问则 null。
 * `type=user` 且 content 为 string 或数组里有 text 段;`isSidechain` 的是 subagent
 * 自己的转写,不是人问的(spec B1)。
 *
 * 工具回灌(`tool_result`)由"取 text 段"这条规则本身排除,不另设守卫:全库枚举
 * 12,734 个 user.content 数组,段类型组合只有三种——`(tool_result)` 12541、
 * `(text)` 142、`(image,text)` 51,**tool_result 从不与 text 同现**,而 tool_result
 * 段自身没有 text 字段。再加一条 `some(type===tool_result)` 是不可达分支。
 */
function claudeQuestion(obj: Record<string, unknown>): string | null {
  if (obj['type'] !== 'user' || obj['isSidechain'] === true) return null
  const msg = asRecord(obj['message'])
  if (!msg) return null
  const c = msg['content']
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return null
  const texts = c
    .map((s) => asRecord(s)?.['text'])
    .filter((t): t is string => typeof t === 'string')
  return texts.length > 0 ? texts.join(' ') : null
}

/** Codex 人类提问:只认 event_msg/user_message。response_item/message 混入
 * `<environment_context>` 与 AGENTS.md 注入内容,不是人写的(spec B1)。 */
function codexQuestion(obj: Record<string, unknown>): string | null {
  if (obj['type'] !== 'event_msg') return null
  const p = asRecord(obj['payload'])
  if (p?.['type'] !== 'user_message') return null
  return typeof p['message'] === 'string' ? p['message'] : null
}

function claudeCounts(obj: Record<string, unknown>): { tools: number; subagents: number } {
  // sidechain 行是 subagent 自己的转写:它干的活归在 subagent 那个数字下,
  // 不重复计进父轮的工具数(subagent 展开是 spec C3 的事)
  if (obj['isSidechain'] === true) return { tools: 0, subagents: 0 }
  const c = asRecord(obj['message'])?.['content']
  if (!Array.isArray(c)) return { tools: 0, subagents: 0 }
  let tools = 0
  let subagents = 0
  for (const seg of c) {
    const s = asRecord(seg)
    if (s?.['type'] !== 'tool_use') continue
    if (typeof s['name'] === 'string' && CLAUDE_DISPATCH.has(s['name'])) subagents++
    else tools++
  }
  return { tools, subagents }
}

function codexCounts(obj: Record<string, unknown>): { tools: number; subagents: number } {
  if (obj['type'] !== 'response_item') return { tools: 0, subagents: 0 }
  const p = asRecord(obj['payload'])
  const t = p?.['type']
  if (typeof t !== 'string' || !CODEX_CALL_TYPES.has(t)) return { tools: 0, subagents: 0 }
  return p?.['name'] === CODEX_DISPATCH ? { tools: 0, subagents: 1 } : { tools: 1, subagents: 0 }
}

export function makeQuestionIndexer(side: 'claude' | 'codex'): QuestionIndexer {
  const questionOf = side === 'claude' ? claudeQuestion : codexQuestion
  const countsOf = side === 'claude' ? claudeCounts : codexCounts
  const out: QuestionRec[] = []
  /** 与 out 平行:每条提问所在行的 uuid(无则 null),供末叶回溯过滤 */
  const qUuid: Array<string | null> = []
  /** 与 out 平行:**剥噪声之后**的提问文本,只为过滤后重新定首条标题用。
   * 不存原文的截断版:`<command-args>` 这类包装的真实内容实测可远在第 4054 字符,
   * 先截再剥会让剥离规则找不到标签,标题变成一段包装垃圾。**只在内存里,不进缓存。** */
  const qHead: string[] = []
  /** Claude 主链的 uuid → 父。**父取 `parentUuid ?? logicalParentUuid`** */
  const parentOf = new Map<string, string | null>()
  /** 最后一条**非 sidechain** 行的 uuid —— 回溯的起点 */
  let lastMainUuid: string | null = null
  let firstRaw: string | null = null

  return {
    line(obj, start, end) {
      // 末叶回溯的图只在 Claude 侧建,且只收主链行:sidechain 是 subagent 自己的
      // 转写,其 parentUuid 恒为 null、子节点只指向 sidechain 内部,混进来会把
      // 回溯起点带到 subagent 的链上(实测 69% 的文件末行正是 sidechain 行)。
      if (side === 'claude' && obj['isSidechain'] !== true) {
        const u = obj['uuid']
        if (typeof u === 'string') {
          const p = obj['parentUuid']
          const lp = obj['logicalParentUuid']
          // 压缩边界(type=system, subtype=compact_boundary)的 parentUuid 断开,
          // logicalParentUuid 才是它到压缩前历史的桥。不桥接的话实测最坏一例
          // 346 条提问只剩 44 条——压缩前的历史全被当成"被放弃的分支"。
          parentOf.set(u, typeof p === 'string' ? p : typeof lp === 'string' ? lp : null)
          lastMainUuid = u
        }
      }
      const raw = questionOf(obj)
      // 噪声不算提问(与标题剥离同一套规则):否则只含 Warmup 的会话会报出
      // "1 提问"却按 spec A3a 不入列,同一个概念两个数字
      const clean = raw === null ? null : realUserText(raw)
      if (clean !== null) {
        const prev = out[out.length - 1]
        if (prev) prev[2] = start
        const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
        out.push([start, end, end, Number.isNaN(ts) ? null : ts, 0, 0])
        qUuid.push(typeof obj['uuid'] === 'string' ? obj['uuid'] : null)
        qHead.push(clean)
        return
      }
      const cur = out[out.length - 1]
      // 首条提问之前的行(session_meta、预热噪声等)不属于任何轮
      if (!cur) return
      const { tools, subagents } = countsOf(obj)
      cur[4] += tools
      cur[5] += subagents
    },
    firstQuestionText() {
      return firstRaw
    },
    done(fileEnd) {
      // 先给**原始**末条补上文件终点,再过滤:末条若落在被放弃的分支上,
      // 这个延长就该随它一起消失,而不是让存活的前一条把废弃内容吃进自己的轮次。
      const last = out[out.length - 1]
      if (last && fileEnd > last[2]) last[2] = fileEnd

      let kept = out
      let keptHeads = qHead
      if (side === 'claude' && lastMainUuid !== null) {
        const chain = new Set<string>()
        let cur: string | null = lastMainUuid
        while (cur !== null && !chain.has(cur)) {
          chain.add(cur)
          cur = parentOf.get(cur) ?? null
        }
        kept = []
        keptHeads = []
        for (let i = 0; i < out.length; i++) {
          const u = qUuid[i]
          // 无 uuid 的提问无从判断在不在链上 —— 按不漏原则保留(漏掉真提问,
          // 比多留一条被放弃的更违背"找到我提过的那个问题"这个立命之本)
          if (u === null || chain.has(u)) {
            kept.push(out[i])
            keptHeads.push(qHead[i])
          }
        }
      }
      // 标题与条数同源:过滤后重新取首条,免得标题来自一条已被丢弃的提问
      firstRaw = keptHeads.length > 0 ? keptHeads[0] : null
      return kept
    }
  }
}
