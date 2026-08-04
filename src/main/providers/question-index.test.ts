import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'
import { makeQuestionIndexer, type QuestionRec } from './question-index'

/**
 * 驱动方式与两个 parser 里的接线一致:eachJsonlLine 逐行喂给 indexer,末尾 done(文件长度)。
 *
 * **已知缺口(变异检验实测,不是没写)**:
 * 1. parser 里那三行接线本身无行为测试,只由 typecheck 兜住;补测条件是 parser 可注入行流。
 * 2. `claudeQuestion` 里"text 段为空 → 返回 null"这个分支**不可被行为区分**:改成返回
 *    空串后全部测试仍绿,因为调用方的 `realUserText('')` 同样判 null。保留它是为了函数
 *    契约自洽(不是提问就还 null),不是为了行为差异——别为它编一个测试来充数。
 */
async function indexOf(file: string, side: 'claude' | 'codex'): Promise<QuestionRec[]> {
  const idx = makeQuestionIndexer(side)
  let fileEnd = 0
  await eachJsonlLine(file, (obj, start, end) => {
    idx.line(obj, start, end)
    fileEnd = end
  })
  return idx.done(fileEnd)
}

function withLines<T>(objs: unknown[], fn: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'qidx-'))
  const file = join(dir, 's.jsonl')
  writeFileSync(file, objs.map((o) => JSON.stringify(o)).join('\n') + '\n')
  return fn(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

const TS = '2026-08-01T10:00:00.000Z'
const cUser = (text: string, extra: Record<string, unknown> = {}): unknown => ({
  type: 'user',
  timestamp: TS,
  message: { role: 'user', content: text },
  ...extra
})
/** 真实形态:助手行的 tool_use 段;Agent/Task 的入参恒为 description/prompt/subagent_type */
const cTool = (name: string): unknown => ({
  type: 'assistant',
  timestamp: TS,
  message: {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'tu_1', name, input: name === 'Bash' ? { command: 'ls' } : { description: 'd', prompt: 'p', subagent_type: 'general-purpose' } }]
  }
})
const xUser = (message: string): unknown => ({
  type: 'event_msg',
  timestamp: TS,
  payload: { type: 'user_message', message }
})

describe('提问提取(Claude 侧)', () => {
  // 三种 content 数组形态取自全库枚举(12,734 个数组,组合只有这三种):
  // (tool_result) 12541 / (text) 142 / (image,text) 51
  test('content 为 string 与 [{type:text}] 都算提问,工具回灌不算', async () => {
    await withLines(
      [
        cUser('第一个真问题'),
        { type: 'user', timestamp: TS, message: { role: 'user', content: [{ type: 'text', text: '第二个真问题' }] } },
        { type: 'user', timestamp: TS, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '工具返回' }] } }
      ],
      async (file) => {
        expect(await indexOf(file, 'claude')).toHaveLength(2)
      }
    )
  })

  test('image + text 混排算提问,只取 text 段(真实形态,全库 51 例)', async () => {
    await withLines(
      [
        {
          type: 'user',
          timestamp: TS,
          message: {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } },
              { type: 'text', text: '这张图里的报错是什么' }
            ]
          }
        }
      ],
      async (file) => {
        expect(await indexOf(file, 'claude')).toHaveLength(1)
      }
    )
  })

  test('sidechain 行不算提问——那是 subagent 自己的转写,不是人问的', async () => {
    await withLines([cUser('人问的'), cUser('subagent 的派发提示词', { isSidechain: true, agentId: 'a1' })], async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(1)
    })
  })

  test('harness 噪声不算提问(与标题剥离同一套规则)', async () => {
    await withLines(
      [
        cUser('Warmup'),
        cUser('<local-command-caveat>免责声明</local-command-caveat>'),
        cUser('Base directory for this skill: /x'),
        cUser('<command-message>m</command-message><command-name>/clear</command-name><command-args></command-args>'),
        cUser('[cron:abc 定时] 真正的指令'),
        cUser('这是真问题')
      ],
      async (file) => {
        // 只有 cron(剥方括号后有正文)与末条算数
        expect(await indexOf(file, 'claude')).toHaveLength(2)
      }
    )
  })

  test('整份文件没有真实提问 → 空索引', async () => {
    await withLines([cUser('Warmup'), cTool('Bash')], async (file) => {
      expect(await indexOf(file, 'claude')).toEqual([])
    })
  })
})

describe('轮次切分与偏移', () => {
  test('轮次 = 本条提问之后到下一条提问之前;末轮到文件末尾', async () => {
    const objs = [cUser('问题一'), cTool('Bash'), cUser('问题二'), cTool('Read')]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      const size = readFileSync(file).length
      expect(recs).toHaveLength(2)
      // 提问区间紧贴该行;轮次从提问行之后开始
      expect(recs[0][0]).toBe(0)
      expect(recs[0][2]).toBe(recs[1][0]) // 第一轮止 == 第二条提问起
      expect(recs[1][2]).toBe(size) // 末轮止 == 文件长度
    })
  })

  test('锚:按 [轮次起,轮次止) 切出来的,恰是该提问之后、下条提问之前的全部行', async () => {
    const objs = [cUser('问题一'), cTool('Bash'), cTool('Agent'), cUser('问题二'), cTool('Read')]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      const raw = readFileSync(file)
      const parseRange = (from: number, to: number): unknown[] =>
        raw
          .subarray(from, to)
          .toString('utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l))
      // 全解析口径:提问在原始序列里的下标 → 到下一条提问之间的那些行
      expect(parseRange(recs[0][1], recs[0][2])).toEqual([objs[1], objs[2]])
      expect(parseRange(recs[1][1], recs[1][2])).toEqual([objs[4]])
      // 提问自身的区间也要切得回来
      expect(JSON.parse(raw.subarray(recs[0][0], recs[0][1]).toString('utf8'))).toEqual(objs[0])
    })
  })

  test('提问行的时间戳进索引;无时间戳则为 null', async () => {
    await withLines([cUser('有时间'), { type: 'user', message: { role: 'user', content: '无时间' } }], async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs[0][3]).toBe(Date.parse(TS))
      expect(recs[1][3]).toBeNull()
    })
  })
})

describe('本轮体量计数', () => {
  test('Claude:Agent 与 Task 都计 subagent,其余 tool_use 计工具', async () => {
    // 全库实测:Agent 152 次 / Task 4 次,两代同一个派发工具,入参同为
    // description+prompt+subagent_type
    await withLines([cUser('问'), cTool('Bash'), cTool('Read'), cTool('Agent'), cTool('Task')], async (file) => {
      const [rec] = await indexOf(file, 'claude')
      expect(rec[4]).toBe(2) // 工具:Bash + Read
      expect(rec[5]).toBe(2) // subagent:Agent + Task
    })
  })

  test('Claude:sidechain 行里的工具不计入父轮——那是 subagent 自己干的活', async () => {
    const side = { ...(cTool('Bash') as Record<string, unknown>), isSidechain: true, agentId: 'a1' }
    await withLines([cUser('问'), cTool('Agent'), side, side], async (file) => {
      const [rec] = await indexOf(file, 'claude')
      expect(rec[4]).toBe(0)
      expect(rec[5]).toBe(1)
    })
  })

  test('计数按轮归属,不串轮', async () => {
    await withLines([cUser('一'), cTool('Bash'), cUser('二'), cTool('Bash'), cTool('Read')], async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs.map((r) => r[4])).toEqual([1, 2])
    })
  })

  test('首条提问之前的行不计入任何轮', async () => {
    await withLines([cTool('Bash'), cUser('问'), cTool('Read')], async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs).toHaveLength(1)
      expect(recs[0][4]).toBe(1)
    })
  })
})

describe('提问提取(Codex 侧)', () => {
  test('取 event_msg/user_message,不取 response_item/message', async () => {
    await withLines(
      [
        xUser('人问的'),
        { type: 'response_item', timestamp: TS, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>注入</environment_context>' }] } }
      ],
      async (file) => {
        expect(await indexOf(file, 'codex')).toHaveLength(1)
      }
    )
  })

  test('custom_tool_call 与 function_call 计工具,spawn_agent 计 subagent', async () => {
    await withLines(
      [
        xUser('问'),
        { type: 'response_item', timestamp: TS, payload: { type: 'custom_tool_call', name: 'exec', input: 'ls' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'custom_tool_call', name: 'apply_patch', input: 'p' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'function_call', name: 'wait', arguments: '{}' } },
        // tool_search_call:全库枚举出的第三种调用记录(25 次,配套 tool_search_output)。
        // 120 文件的采样里没有它 —— 正面枚举靠采样会漏,换成全量才看见。
        { type: 'response_item', timestamp: TS, payload: { type: 'tool_search_call', name: 'search' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'function_call', name: 'spawn_agent', namespace: 'collaboration', arguments: '{"task_name":"t"}' } },
        // 返回值不重复计数
        { type: 'response_item', timestamp: TS, payload: { type: 'custom_tool_call_output', output: 'ok' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'function_call_output', output: 'ok' } }
      ],
      async (file) => {
        const [rec] = await indexOf(file, 'codex')
        expect(rec[4]).toBe(4) // exec + apply_patch + wait + tool_search
        expect(rec[5]).toBe(1) // spawn_agent
      }
    )
  })

  test('Codex 噪声提问同样剥离', async () => {
    await withLines([xUser('Warmup'), xUser('真问题')], async (file) => {
      expect(await indexOf(file, 'codex')).toHaveLength(1)
    })
  })

  test('侧别不串:Claude 的行不会被 Codex 规则算成提问', async () => {
    await withLines([cUser('claude 的提问')], async (file) => {
      expect(await indexOf(file, 'codex')).toEqual([])
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 票 03b:Claude 分叉 —— 沿父链从最后一条回溯到根,只留这条链(spec B3)
//
// fixture 形态全部取自真实数据枚举(全库 1481 个有 uuid 链的会话文件):
//   - 分叉(某父多子)27 个文件;多叶 29 个文件
//   - **末行是 sidechain 的 1015 个(69%)** —— sidechain 的 parentUuid 恒为 null
//   - 压缩边界 `type=system, subtype=compact_boundary`,parentUuid=null 且带
//     logicalParentUuid —— 不桥接它,最坏一例 346 条提问只剩 44 条
// ─────────────────────────────────────────────────────────────────────────

/** 带 uuid 链的用户提问行 */
const cq = (uuid: string, parentUuid: string | null, text: string, extra: Record<string, unknown> = {}): unknown => ({
  type: 'user',
  uuid,
  parentUuid,
  timestamp: TS,
  message: { role: 'user', content: text },
  ...extra
})
/** 助手行(占位,让链有中间节点) */
const ca = (uuid: string, parentUuid: string | null): unknown => ({
  type: 'assistant',
  uuid,
  parentUuid,
  timestamp: TS,
  message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }
})
/** 真实形态:压缩边界。parentUuid 断开,logicalParentUuid 指回压缩前 */
const cCompact = (uuid: string, logicalParentUuid: string): unknown => ({
  type: 'system',
  subtype: 'compact_boundary',
  uuid,
  parentUuid: null,
  logicalParentUuid,
  timestamp: TS,
  content: 'Conversation compacted',
  compactMetadata: { trigger: 'auto' }
})

async function textsOf(objs: unknown[]): Promise<number[]> {
  return withLines(objs, async (file) => (await indexOf(file, 'claude')).map((r) => r[0]))
}

describe('Claude 分叉:末叶回溯', () => {
  test('线性会话:全部提问都在链上,一条不少', async () => {
    const objs = [cq('u1', null, '问一'), ca('a1', 'u1'), cq('u2', 'a1', '问二'), ca('a2', 'u2'), cq('u3', 'a2', '问三')]
    await withLines(objs, async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(3)
    })
  })

  test('分叉:被放弃的那支上的提问不计入', async () => {
    // u2 与 u2b 同父 a1;最后一条是 u3(在 u2 这一支下)→ u2b 被放弃
    const objs = [
      cq('u1', null, '问一'),
      ca('a1', 'u1'),
      cq('u2b', 'a1', '走岔的问'),
      ca('a2b', 'u2b'),
      cq('u2', 'a1', '问二'),
      ca('a2', 'u2'),
      cq('u3', 'a2', '问三')
    ]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs).toHaveLength(3)
      // 被放弃那条的偏移不应出现
      const abandoned = JSON.stringify(objs[2])
      const raw = readFileSync(file)
      for (const r of recs) {
        expect(raw.subarray(r[0], r[1]).toString('utf8').trim()).not.toBe(abandoned)
      }
    })
  })

  test('末行是 sidechain:回溯起点取最后一条非 sidechain 行,不掉进 subagent 链', async () => {
    const objs = [
      cq('u1', null, '问一'),
      ca('a1', 'u1'),
      cq('u2', 'a1', '问二'),
      // subagent 转写:parentUuid 恒 null,自成一链,且排在文件最后
      { ...(cq('s1', null, 'subagent 的提示词') as Record<string, unknown>), isSidechain: true, agentId: 'ag1' },
      { ...(ca('s2', 's1') as Record<string, unknown>), isSidechain: true, agentId: 'ag1' }
    ]
    await withLines(objs, async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(2)
    })
  })

  test('压缩边界:靠 logicalParentUuid 桥接,压缩前的提问不丢', async () => {
    const objs = [
      cq('u1', null, '压缩前问一'),
      ca('a1', 'u1'),
      cq('u2', 'a1', '压缩前问二'),
      ca('a2', 'u2'),
      cCompact('cb1', 'a2'),
      cq('u3', 'cb1', '压缩后问三')
    ]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs, '不桥接 logicalParentUuid 的话只剩压缩后那 1 条').toHaveLength(3)
    })
  })

  test('两次压缩:两道边界都要桥过去', async () => {
    const objs = [
      cq('u1', null, '第一段'),
      cCompact('cb1', 'u1'),
      cq('u2', 'cb1', '第二段'),
      cCompact('cb2', 'u2'),
      cq('u3', 'cb2', '第三段')
    ]
    expect(await textsOf(objs)).toHaveLength(3)
  })

  test('没有 uuid 的行不参与回溯,也不让整份索引塌掉', async () => {
    // 真实文件里 session_meta 之类的行没有 uuid
    const objs = [cUser('无 uuid 的提问'), cq('u1', null, '有 uuid 的提问')]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs, '无 uuid 的提问无从判断在不在链上,按不漏原则保留').toHaveLength(2)
    })
  })

  test('整份文件都没有 uuid(旧格式):退化为全保留', async () => {
    await withLines([cUser('问一'), cUser('问二')], async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(2)
    })
  })

  test('Codex 侧不做末叶回溯:uuid 字段对它无意义', async () => {
    await withLines([xUser('问一'), xUser('问二')], async (file) => {
      expect(await indexOf(file, 'codex')).toHaveLength(2)
    })
  })
})

describe('标题与提问集合同源(末叶回溯之后)', () => {
  async function firstTextOf(objs: unknown[]): Promise<string | null> {
    return withLines(objs, async (file) => {
      const idx = makeQuestionIndexer('claude')
      let fileEnd = 0
      await eachJsonlLine(file, (obj, start, end) => {
        idx.line(obj, start, end)
        fileEnd = end
      })
      idx.done(fileEnd)
      return idx.firstQuestionText()
    })
  }

  test('首条提问落在被放弃的分支上 → 标题取存活的那条,不是被丢弃的那条', async () => {
    // u1b 是文件里最早的提问,但它这一支被放弃;存活链是 u1 → a1 → u2
    const objs = [
      ca('root', null),
      cq('u1b', 'root', '走岔的第一问'),
      cq('u1', 'root', '真正的第一问'),
      ca('a1', 'u1'),
      cq('u2', 'a1', '第二问')
    ]
    expect(await firstTextOf(objs)).toBe('真正的第一问')
    await withLines(objs, async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(2)
    })
  })

  test('全部提问都被滤掉 → 标题为 null(会话据此不入列)', async () => {
    // 唯一的提问在被放弃的分支上,存活链只有助手行
    const objs = [ca('root', null), cq('u1b', 'root', '走岔的问'), ca('a1', 'root'), ca('a2', 'a1')]
    expect(await firstTextOf(objs)).toBeNull()
  })

  test('标题不被二次剥离:cron 剥出的内容恰好是 Warmup 时仍保留', async () => {
    // 回归 clipTitle 与 realUserText 分家的理由:二次剥会把它变成 null
    expect(await firstTextOf([cq('u1', null, '[cron:abc 定时] Warmup')])).toBe('Warmup')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 票 03b:Codex 重放前缀剥离(spec B2)
//
// **本机真实数据里真 fork 数为 0**(244 个 Codex 会话,9 个带 parent 的全是
// subagent 线程,按 A3 不入列)——所以这一组只有 fixture 覆盖,拿不到真实样本。
// 依据是机制而非样本:① 重放确实会复制 user_message(4 组 subagent 父子对实测
// 逐条相同);② 重放**改写时间戳**(4/4 例),所以认不出重放段只能靠内容指纹;
// ③ 突发启发式与 token 侧同源(ccusage replay.rs:重放是程序一次写入,行间隔
// 近零,而真人提问是人的节奏)。
// ─────────────────────────────────────────────────────────────────────────
import { fingerprint, stripReplayPrefix, type ForkState } from './question-index'

/** 造一条索引记录:只有时间戳与指纹参与剥离判定,偏移随便给 */
const rec = (ts: number, text: string): QuestionRec => [0, 1, 2, ts, 0, 0, fingerprint(text)]

function strip(
  child: QuestionRec[],
  parent: QuestionRec[] | null,
  forkedAt: number | null,
  isFork = true
): { n: number; state: ForkState } {
  const r = stripReplayPrefix(child, parent, forkedAt, isFork)
  return { n: r.questions.length, state: r.state }
}

describe('Codex 重放前缀剥离', () => {
  const T = (m: number): number => Date.parse(`2026-08-01T10:${String(m).padStart(2, '0')}:00Z`)

  test('不是 fork → 原样返回,状态 none', () => {
    const c = [rec(T(1), '问一'), rec(T(2), '问二')]
    expect(strip(c, null, null, false)).toEqual({ n: 2, state: 'none' })
  })

  test('「不是 fork」与「父缺失」必须给出不同状态,不是同一字段的两种成色', () => {
    const c = [rec(T(1), '问一'), rec(T(9), '问二')]
    expect(strip(c, null, null, false).state).toBe('none')
    expect(strip(c, null, T(1), true).state).toBe('uncertain')
  })

  test('整段都像突发也绝不剥空——留最后一条,宁可多显示不要整个会话消失', () => {
    const ms = (x: number): number => Date.parse('2026-08-01T10:00:00Z') + x
    const c = [rec(ms(0), 'A'), rec(ms(100), 'B'), rec(ms(200), 'C')]
    expect(strip(c, null, ms(0))).toEqual({ n: 1, state: 'uncertain' })
  })

  test('父在扫描集内且指纹逐条吻合 → 剥掉重放段,状态 stripped', () => {
    const p = [rec(T(1), '父问一'), rec(T(2), '父问二'), rec(T(9), '父 fork 之后才有的问')]
    // 子会话重放了 fork 时刻(T(5))之前的两条,时间戳被改写,但内容不变
    const c = [rec(T(5), '父问一'), rec(T(5), '父问二'), rec(T(6), '子的新问')]
    expect(strip(c, p, T(5))).toEqual({ n: 1, state: 'stripped' })
  })

  test('指纹对不上 → 不剥,状态 uncertain(宁可显示重复,不静默丢真提问)', () => {
    const p = [rec(T(1), '父问一'), rec(T(2), '父问二')]
    const c = [rec(T(5), '完全不同的开头'), rec(T(6), '子的新问')]
    expect(strip(c, p, T(5))).toEqual({ n: 2, state: 'uncertain' })
  })

  test('只吻合一部分 → 按吻合的那部分剥,但仍标 uncertain', () => {
    const p = [rec(T(1), '父问一'), rec(T(2), '父问二'), rec(T(3), '父问三')]
    const c = [rec(T(5), '父问一'), rec(T(5), '对不上了'), rec(T(6), '子的新问')]
    expect(strip(c, p, T(5))).toEqual({ n: 2, state: 'uncertain' })
  })

  test('三代 fork 链:孙会话按它自己的父(子会话)剥,不越级找祖父', () => {
    const g = [rec(T(1), 'A')]
    const c = [rec(T(5), 'A'), rec(T(6), 'B')] // 子:剥掉 A 后剩 B
    const gc = [rec(T(8), 'A'), rec(T(8), 'B'), rec(T(9), 'C')] // 孙重放了子的全部
    expect(strip(c, g, T(5))).toEqual({ n: 1, state: 'stripped' })
    expect(strip(gc, c, T(8))).toEqual({ n: 1, state: 'stripped' })
  })

  test('父缺失 → 突发启发式:开头那串近乎同时的提问算重放,状态 uncertain', () => {
    // 重放是程序一次写入,行间隔近零;真人提问是人的节奏
    const ms = (x: number): number => Date.parse('2026-08-01T10:00:00Z') + x
    const c = [rec(ms(0), 'A'), rec(ms(120), 'B'), rec(ms(240), 'C'), rec(ms(600_000), '真人问的')]
    expect(strip(c, null, ms(0))).toEqual({ n: 1, state: 'uncertain' })
  })

  test('父缺失且提问节奏正常 → 一条都不剥', () => {
    const c = [rec(T(1), 'A'), rec(T(9), 'B')]
    expect(strip(c, null, T(1))).toEqual({ n: 2, state: 'uncertain' })
  })

  test('父存在但自身没有提问 → 无从校验,不剥并标 uncertain', () => {
    const c = [rec(T(5), 'A')]
    expect(strip(c, [], T(5))).toEqual({ n: 1, state: 'uncertain' })
  })

  test('剥离不改动保留下来那些记录的偏移', () => {
    const p = [rec(T(1), 'A')]
    const c: QuestionRec[] = [rec(T(5), 'A'), [111, 222, 333, T(6), 2, 1, fingerprint('B')]]
    const r = stripReplayPrefix(c, p, T(5), true)
    expect(r.questions[0]).toEqual([111, 222, 333, T(6), 2, 1, fingerprint('B')])
  })
})

describe('内容指纹', () => {
  test('同文同指纹,异文异指纹', () => {
    expect(fingerprint('同一段话')).toBe(fingerprint('同一段话'))
    expect(fingerprint('甲')).not.toBe(fingerprint('乙'))
  })

  test('是 32 位无符号整数,不可从中还原文本', () => {
    const fp = fingerprint('一段较长的中文提问内容,用来确认输出仍是个小整数')
    expect(Number.isInteger(fp)).toBe(true)
    expect(fp).toBeGreaterThanOrEqual(0)
    expect(fp).toBeLessThanOrEqual(0xffffffff)
  })

  test('空串也有确定值,不抛', () => {
    expect(typeof fingerprint('')).toBe('number')
  })
})
