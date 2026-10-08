import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'
import { makeQuestionIndexer, questionTextAt, type QuestionRec } from './question-index'

/**
 * Driven the same way as the wiring in the two parsers: eachJsonlLine feeds the indexer line by line, then
 * done(file length) at the end.
 *
 * **Known gaps (established by mutation, not simply unwritten)**:
 * 1. those three lines of wiring in the parsers have no behavioural test of their own and are backstopped
 *    only by typecheck; covering them requires the parsers to accept an injectable line stream.
 * 2. the "an empty text segment → return null" branch inside `claudeQuestion` is **behaviourally
 *    indistinguishable**: changing it to return
 *    an empty string leaves every test green, because the caller's `realUserText('')` judges it null too.
 *    It is kept for the function's
 *    own contract to be self-consistent (not a question → return null), not for a behavioural difference —
 *    do not invent a test to pad it out.
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
/** The real shape: an assistant line's tool_use segment; Agent and Task always take
 * description/prompt/subagent_type */
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
/** The paginated format's human message (spec B1): a completed-item event whose item is a user message —
 * `content: [{ type: 'text', text, text_elements: [] }]`, the one shape seen in 8285 items across this machine's
 * rollouts (2026-09-11). Written in place of the legacy user_message event, which paginated rollouts no longer carry. */
const xItemUser = (text: string): unknown => ({
  type: 'event_msg',
  timestamp: TS,
  ordinal: 9,
  payload: {
    type: 'item_completed',
    thread_id: '019f0000-0000-7000-8000-000000000001',
    turn_id: '019f0000-0000-7000-8000-000000000002',
    item: { type: 'UserMessage', id: '019f0000-0000-7000-8000-000000000003', content: [{ type: 'text', text, text_elements: [] }] },
    started_at_ms: 1,
    completed_at_ms: 1
  }
})

describe('question extraction (the Claude side)', () => {
  // The three content array shapes come from a full enumeration (12,734 arrays, with only these three
  // combinations):
  // (tool_result) 12541 / (text) 142 / (image,text) 51
  test('content as a string and as [{type:text}] both count as questions; a tool result fed back does not', async () => {
    await withLines(
      [
        cUser('first real question'),
        { type: 'user', timestamp: TS, message: { role: 'user', content: [{ type: 'text', text: 'second real question' }] } },
        { type: 'user', timestamp: TS, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'tool return' }] } }
      ],
      async (file) => {
        expect(await indexOf(file, 'claude')).toHaveLength(2)
      }
    )
  })

  test('image mixed with text counts as a question, taking the text segment only (a real shape, 51 cases across the repository)', async () => {
    await withLines(
      [
        {
          type: 'user',
          timestamp: TS,
          message: {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } },
              { type: 'text', text: 'what is the error in this screenshot' }
            ]
          }
        }
      ],
      async (file) => {
        expect(await indexOf(file, 'claude')).toHaveLength(1)
      }
    )
  })

  test('a sidechain line is not a question — that is a subagent\'s own transcript, not something a human asked', async () => {
    await withLines([cUser('asked by a human'), cUser('the subagent dispatch prompt', { isSidechain: true, agentId: 'a1' })], async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(1)
    })
  })

  test('harness noise is not a question (the same rules as title stripping)', async () => {
    await withLines(
      [
        cUser('Warmup'),
        cUser('<local-command-caveat>disclaimer</local-command-caveat>'),
        cUser('Base directory for this skill: /x'),
        cUser('<command-message>m</command-message><command-name>/clear</command-name><command-args></command-args>'),
        cUser('[cron:abc scheduled] the actual instruction'),
        cUser('this is a real question')
      ],
      async (file) => {
        // Only the cron one (which has content after the bracket is stripped) and the last one count
        expect(await indexOf(file, 'claude')).toHaveLength(2)
      }
    )
  })

  test('a whole file with no real question → an empty index', async () => {
    await withLines([cUser('Warmup'), cTool('Bash')], async (file) => {
      expect(await indexOf(file, 'claude')).toEqual([])
    })
  })
})

describe('turn splitting and offsets', () => {
  test('a turn = from after this question up to the next one; the last turn runs to the end of the file', async () => {
    const objs = [cUser('question one'), cTool('Bash'), cUser('question two'), cTool('Read')]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      const size = readFileSync(file).length
      expect(recs).toHaveLength(2)
      // The question's range hugs its line; the turn starts after the question line
      expect(recs[0][0]).toBe(0)
      expect(recs[0][2]).toBe(recs[1][0]) // turn one's end == question two's start
      expect(recs[1][2]).toBe(size) // the last turn's end == the file length
    })
  })

  test('the anchor: what [turn start, turn end) slices out is exactly every line after this question and before the next', async () => {
    const objs = [cUser('question one'), cTool('Bash'), cTool('Agent'), cUser('question two'), cTool('Read')]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      const raw = readFileSync(file)
      const parseRange = (from: number, to: number): unknown[] =>
        raw
          .subarray(from, to)
          .toString('utf8')
          .split('\n')
          .filter((l) => l.trim())
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- see #194
          .map((l) => JSON.parse(l))
      // The full-parse rule: from the question's index in the original sequence up to the next question
      expect(parseRange(recs[0][1], recs[0][2])).toEqual([objs[1], objs[2]])
      expect(parseRange(recs[1][1], recs[1][2])).toEqual([objs[4]])
      // The question's own range has to slice back too
      expect(JSON.parse(raw.subarray(recs[0][0], recs[0][1]).toString('utf8'))).toEqual(objs[0])
    })
  })

  test('the question line\'s timestamp enters the index; null when there is none', async () => {
    await withLines([cUser('has time'), { type: 'user', message: { role: 'user', content: 'no time' } }], async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs[0][3]).toBe(Date.parse(TS))
      expect(recs[1][3]).toBeNull()
    })
  })
})

describe('per-turn volume counting', () => {
  test('Claude: both Agent and Task count as subagents, and other tool_use segments count as tools', async () => {
    // Measured across the repository: Agent 152 times, Task 4 — two generations of the same dispatch tool,
    // both taking
    // description+prompt+subagent_type
    await withLines([cUser('q'), cTool('Bash'), cTool('Read'), cTool('Agent'), cTool('Task')], async (file) => {
      const [rec] = await indexOf(file, 'claude')
      expect(rec[4]).toBe(2) // tools: Bash + Read
      expect(rec[5]).toBe(2) // subagent:Agent + Task
    })
  })

  test('Claude: tools on a sidechain line do not count toward the parent turn — that is the subagent\'s own work', async () => {
    const side = { ...(cTool('Bash') as Record<string, unknown>), isSidechain: true, agentId: 'a1' }
    await withLines([cUser('q'), cTool('Agent'), side, side], async (file) => {
      const [rec] = await indexOf(file, 'claude')
      expect(rec[4]).toBe(0)
      expect(rec[5]).toBe(1)
    })
  })

  test('counts are attributed per turn and do not cross over', async () => {
    await withLines([cUser('one'), cTool('Bash'), cUser('two'), cTool('Bash'), cTool('Read')], async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs.map((r) => r[4])).toEqual([1, 2])
    })
  })

  test('lines before the first question count toward no turn', async () => {
    await withLines([cTool('Bash'), cUser('q'), cTool('Read')], async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs).toHaveLength(1)
      expect(recs[0][4]).toBe(1)
    })
  })
})

describe('question extraction (the Codex side)', () => {
  test('takes event_msg/user_message, not response_item/message', async () => {
    await withLines(
      [
        xUser('asked by a human'),
        { type: 'response_item', timestamp: TS, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>injected</environment_context>' }] } }
      ],
      async (file) => {
        expect(await indexOf(file, 'codex')).toHaveLength(1)
      }
    )
  })

  test('custom_tool_call and function_call count as tools, spawn_agent counts as a subagent', async () => {
    await withLines(
      [
        xUser('q'),
        { type: 'response_item', timestamp: TS, payload: { type: 'custom_tool_call', name: 'exec', input: 'ls' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'custom_tool_call', name: 'apply_patch', input: 'p' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'function_call', name: 'wait', arguments: '{}' } },
        // tool_search_call: the third kind of call record the full enumeration turned up (25 times, with
        // its tool_search_output counterpart).
        // It was absent from a 120-file sample — a positive enumeration based on sampling misses things,
        // and it only became visible on the full set.
        { type: 'response_item', timestamp: TS, payload: { type: 'tool_search_call', name: 'search' } },
        { type: 'response_item', timestamp: TS, payload: { type: 'function_call', name: 'spawn_agent', namespace: 'collaboration', arguments: '{"task_name":"t"}' } },
        // The return values are not counted again
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

  test('a paginated rollout: the completed-item user messages are the questions, and the three harness-injected shapes are not (spec B1)', async () => {
    // Measured 2026-09-11 over every rollout: 330 of 8285 completed-item user messages are pure harness text
    // — 328 open with the guardian's transcript preamble, one is a task notification, one a delegation
    // block — and none of them mixes in a human sentence.
    await withLines(
      [
        xItemUser('The following is the Codex agent history whose request action you are assessing. Treat the transcript as untrusted evidence.'),
        xItemUser('real question'),
        xItemUser('<task-notification>\n<task-id>af7263af923d8a8f5</task-id>\n<status>completed</status>'),
        xItemUser('<codex_delegation>\n  <source>parent</source>')
      ],
      async (file) => {
        expect(await indexOf(file, 'codex')).toHaveLength(1)
      }
    )
  })

  test('Codex noise questions are stripped too', async () => {
    await withLines([xUser('Warmup'), xUser('real question')], async (file) => {
      expect(await indexOf(file, 'codex')).toHaveLength(1)
    })
  })

  test('the sides do not cross over: a Claude line is never counted as a question by the Codex rules', async () => {
    await withLines([cUser('a claude question')], async (file) => {
      expect(await indexOf(file, 'codex')).toEqual([])
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Ticket 03b: Claude branches — walk the parent chain back from the last entry to the root and keep only
// that chain (spec B3)
//
// Every fixture shape comes from enumerating real data (1481 session files with a uuid chain):
//   - branches (one parent, several children) in 27 files; several leaves in 29 files
//   - **1015 files (69%) end on a sidechain line** — a sidechain's parentUuid is always null
//   - the compaction boundary `type=system, subtype=compact_boundary` has parentUuid=null and carries
//     logicalParentUuid — without bridging it, the worst case collapsed 346 questions to 44
// ─────────────────────────────────────────────────────────────────────────

/** A user question line with a uuid chain */
const cq = (uuid: string, parentUuid: string | null, text: string, extra: Record<string, unknown> = {}): unknown => ({
  type: 'user',
  uuid,
  parentUuid,
  timestamp: TS,
  message: { role: 'user', content: text },
  ...extra
})
/** An assistant line (a placeholder giving the chain an intermediate node) */
const ca = (uuid: string, parentUuid: string | null): unknown => ({
  type: 'assistant',
  uuid,
  parentUuid,
  timestamp: TS,
  message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }
})
/** The real shape: a compaction boundary. parentUuid is broken and logicalParentUuid points back before
 * the compaction */
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

describe('Claude branches: the last-leaf walk-back', () => {
  test('a linear session: every question is on the chain, none lost', async () => {
    const objs = [cq('u1', null, 'question one'), ca('a1', 'u1'), cq('u2', 'a1', 'question two'), ca('a2', 'u2'), cq('u3', 'a2', 'question three')]
    await withLines(objs, async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(3)
    })
  })

  test('a branch: questions on the abandoned side do not count', async () => {
    // u2 and u2b share the parent a1; the last entry is u3 (under the u2 side) → u2b is abandoned
    const objs = [
      cq('u1', null, 'question one'),
      ca('a1', 'u1'),
      cq('u2b', 'a1', 'question on the abandoned branch'),
      ca('a2b', 'u2b'),
      cq('u2', 'a1', 'question two'),
      ca('a2', 'u2'),
      cq('u3', 'a2', 'question three')
    ]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs).toHaveLength(3)
      // The abandoned entry's offset should not appear
      const abandoned = JSON.stringify(objs[2])
      const raw = readFileSync(file)
      for (const r of recs) {
        expect(raw.subarray(r[0], r[1]).toString('utf8').trim()).not.toBe(abandoned)
      }
    })
  })

  test('a file ending on a sidechain: the walk-back starts from the last non-sidechain line and does not fall into the subagent chain', async () => {
    const objs = [
      cq('u1', null, 'question one'),
      ca('a1', 'u1'),
      cq('u2', 'a1', 'question two'),
      // A subagent's transcript: parentUuid is always null, it forms its own chain, and it sits at the end
      // of the file
      { ...(cq('s1', null, 'the subagent prompt') as Record<string, unknown>), isSidechain: true, agentId: 'ag1' },
      { ...(ca('s2', 's1') as Record<string, unknown>), isSidechain: true, agentId: 'ag1' }
    ]
    await withLines(objs, async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(2)
    })
  })

  test('a compaction boundary: bridged by logicalParentUuid, so pre-compaction questions are not lost', async () => {
    const objs = [
      cq('u1', null, 'pre-compaction question one'),
      ca('a1', 'u1'),
      cq('u2', 'a1', 'pre-compaction question two'),
      ca('a2', 'u2'),
      cCompact('cb1', 'a2'),
      cq('u3', 'cb1', 'post-compaction question three')
    ]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs, 'without bridging logicalParentUuid only the 1 post-compaction entry remains').toHaveLength(3)
    })
  })

  test('two compactions: both boundaries have to be bridged', async () => {
    const objs = [
      cq('u1', null, 'segment one'),
      cCompact('cb1', 'u1'),
      cq('u2', 'cb1', 'segment two'),
      cCompact('cb2', 'u2'),
      cq('u3', 'cb2', 'segment three')
    ]
    expect(await textsOf(objs)).toHaveLength(3)
  })

  test('lines with no uuid take no part in the walk-back and do not collapse the whole index', async () => {
    // In a real file, lines such as session_meta have no uuid
    const objs = [cUser('question with no uuid'), cq('u1', null, 'question with a uuid')]
    await withLines(objs, async (file) => {
      const recs = await indexOf(file, 'claude')
      expect(recs, 'a question with no uuid cannot be judged on-chain, kept on the do-not-lose principle').toHaveLength(2)
    })
  })

  test('a whole file with no uuid (an old format): degrades to keeping everything', async () => {
    await withLines([cUser('question one'), cUser('question two')], async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(2)
    })
  })

  test('no last-leaf walk-back on the Codex side: the uuid field is meaningless there', async () => {
    await withLines([xUser('question one'), xUser('question two')], async (file) => {
      expect(await indexOf(file, 'codex')).toHaveLength(2)
    })
  })
})

describe('the branch point count (forkPoints, ticket 06\'s banner signal)', () => {
  async function fpOf(objs: unknown[]): Promise<number> {
    return withLines(objs, async (file) => {
      const idx = makeQuestionIndexer('claude')
      let fileEnd = 0
      await eachJsonlLine(file, (obj, start, end) => {
        idx.line(obj, start, end)
        fileEnd = end
      })
      idx.done(fileEnd)
      return idx.forkPoints()
    })
  }

  test('a linear session: 0 branch points', async () => {
    expect(await fpOf([cq('u1', null, 'question one'), ca('a1', 'u1'), cq('u2', 'a1', 'question two')])).toBe(0)
  })

  test('one parent with two children = 1; two such parents = 2', async () => {
    const one = [cq('u1', null, 'q'), ca('a1', 'u1'), cq('u2b', 'a1', 'branch'), cq('u2', 'a1', 'main')]
    expect(await fpOf(one)).toBe(1)
    const two = [
      cq('u1', null, 'q'),
      ca('a1', 'u1'),
      cq('u2b', 'a1', 'branch one'),
      cq('u2', 'a1', 'main'),
      ca('a2', 'u2'),
      cq('u3b', 'a2', 'branch two'),
      cq('u3', 'a2', 'main two')
    ]
    expect(await fpOf(two)).toBe(2)
  })

  test('one parent with three children is still 1 branch point (points are counted, not branches)', async () => {
    expect(
      await fpOf([cq('u1', null, 'q'), ca('a1', 'u1'), cq('x', 'a1', 'branch one'), cq('y', 'a1', 'branch two'), cq('z', 'a1', 'main')])
    ).toBe(1)
  })

  test('sidechain lines do not enter the walk-back graph and create no branch', async () => {
    const s = (u: string, p: string | null): unknown => ({
      ...(cq(u, p, 'subagent line') as Record<string, unknown>),
      isSidechain: true,
      agentId: 'ag'
    })
    // Two sidechains share a parent with a main-chain line: the main chain itself is linear
    expect(await fpOf([cq('u1', null, 'q'), ca('a1', 'u1'), s('s1', 'a1'), s('s2', 'a1'), cq('u2', 'a1', 'question two')])).toBe(0)
  })

  test('the compaction boundary bridge is a single chain and is not a branch', async () => {
    expect(
      await fpOf([cq('u1', null, 'seg one'), ca('a1', 'u1'), cCompact('cb1', 'a1'), cq('u2', 'cb1', 'seg two')])
    ).toBe(0)
  })

  test('an old-format file with no uuid: 0', async () => {
    expect(await fpOf([cUser('question one'), cUser('question two')])).toBe(0)
  })

  test('always 0 on the Codex side (no last-leaf walk-back)', async () => {
    await withLines([xUser('q')], async (file) => {
      const idx = makeQuestionIndexer('codex')
      let fileEnd = 0
      await eachJsonlLine(file, (obj, start, end) => {
        idx.line(obj, start, end)
        fileEnd = end
      })
      idx.done(fileEnd)
      expect(idx.forkPoints()).toBe(0)
    })
  })
})

describe('the title and the question set share a source (after the last-leaf walk-back)', () => {
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

  test('the first question landing on an abandoned branch → the title comes from a surviving one, not the discarded one', async () => {
    // u1b is the earliest question in the file but its side is abandoned; the surviving chain is
    // u1 → a1 → u2
    const objs = [
      ca('root', null),
      cq('u1b', 'root', 'first question on the abandoned branch'),
      cq('u1', 'root', 'the real first question'),
      ca('a1', 'u1'),
      cq('u2', 'a1', 'second question')
    ]
    expect(await firstTextOf(objs)).toBe('the real first question')
    await withLines(objs, async (file) => {
      expect(await indexOf(file, 'claude')).toHaveLength(2)
    })
  })

  test('every question filtered out → the title is null (and the session is not listed as a result)', async () => {
    // The only question is on the abandoned branch, and the surviving chain has only assistant lines
    const objs = [ca('root', null), cq('u1b', 'root', 'question on the abandoned branch'), ca('a1', 'root'), ca('a2', 'a1')]
    expect(await firstTextOf(objs)).toBeNull()
  })

  test('the title is not stripped twice: content a cron strip produced is kept even when it happens to be Warmup', async () => {
    // A regression guard for why clipTitle and realUserText are separate: a second strip would turn it into
    // null
    expect(await firstTextOf([cq('u1', null, '[cron:abc scheduled] Warmup')])).toBe('Warmup')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Ticket 03b: stripping the Codex replay prefix (spec B2)
//
// **There are 0 real forks in this machine's real data** (of 244 Codex sessions, all 9 with a parent are
// subagent threads, unlisted per A3) — so this group has fixture coverage only, with no real sample
// available.
// The grounds are mechanism rather than sample: (1) a replay really does copy user_message (4 subagent
// parent-child pairs measured
// identical entry by entry); (2) a replay **rewrites the timestamps** (4 of 4), so a replayed span can only
// be recognised by content fingerprint;
// (3) the burst heuristic shares its source with the token side (ccusage replay.rs: a replay is written by
// a program in one go, with line gaps
// near zero, whereas a human's questions follow a human rhythm).
// ─────────────────────────────────────────────────────────────────────────
import { fingerprint, stripReplayPrefix, type ForkState } from './question-index'

/** Build one index record: only the timestamp and fingerprint take part in the strip judgement, so the
 * offsets can be anything */
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

describe('stripping the Codex replay prefix', () => {
  const T = (m: number): number => Date.parse(`2026-08-01T10:${String(m).padStart(2, '0')}:00Z`)

  test('not a fork → returned as is, state none', () => {
    const c = [rec(T(1), 'question one'), rec(T(2), 'question two')]
    expect(strip(c, null, null, false)).toEqual({ n: 2, state: 'none' })
  })

  test('"not a fork" and "the parent is missing" must give different states, not two shades of one field', () => {
    const c = [rec(T(1), 'question one'), rec(T(9), 'question two')]
    expect(strip(c, null, null, false).state).toBe('none')
    expect(strip(c, null, T(1), true).state).toBe('uncertain')
  })

  test('even when the whole span looks like a burst it is never stripped empty — the last entry is kept, preferring one extra row to an entire session vanishing', () => {
    const ms = (x: number): number => Date.parse('2026-08-01T10:00:00Z') + x
    const c = [rec(ms(0), 'A'), rec(ms(100), 'B'), rec(ms(200), 'C')]
    expect(strip(c, null, ms(0))).toEqual({ n: 1, state: 'uncertain' })
  })

  test('the parent is in the scan set and the fingerprints match entry by entry → the replayed span is stripped, state stripped', () => {
    const p = [rec(T(1), 'parent question one'), rec(T(2), 'parent question two'), rec(T(9), 'parent question after the fork')]
    // The child replayed the two entries before the fork moment (T(5)), with rewritten timestamps but
    // unchanged content
    const c = [rec(T(5), 'parent question one'), rec(T(5), 'parent question two'), rec(T(6), 'child new question')]
    expect(strip(c, p, T(5))).toEqual({ n: 1, state: 'stripped' })
  })

  test('the fingerprints do not match → nothing is stripped, state uncertain (preferring visible duplicates to silently losing a real question)', () => {
    const p = [rec(T(1), 'parent question one'), rec(T(2), 'parent question two')]
    const c = [rec(T(5), 'a completely different opening'), rec(T(6), 'child new question')]
    expect(strip(c, p, T(5))).toEqual({ n: 2, state: 'uncertain' })
  })

  test('only part matches → strip the part that matched, but still label it uncertain', () => {
    const p = [rec(T(1), 'parent question one'), rec(T(2), 'parent question two'), rec(T(3), 'parent question three')]
    const c = [rec(T(5), 'parent question one'), rec(T(5), 'does not match'), rec(T(6), 'child new question')]
    expect(strip(c, p, T(5))).toEqual({ n: 2, state: 'uncertain' })
  })

  test('a three-generation fork chain: the grandchild strips against its own parent (the child), never reaching past it to the grandparent', () => {
    const g = [rec(T(1), 'A')]
    const c = [rec(T(5), 'A'), rec(T(6), 'B')] // The child: stripping A leaves B
    const gc = [rec(T(8), 'A'), rec(T(8), 'B'), rec(T(9), 'C')] // The grandchild replayed all of the child
    expect(strip(c, g, T(5))).toEqual({ n: 1, state: 'stripped' })
    expect(strip(gc, c, T(8))).toEqual({ n: 1, state: 'stripped' })
  })

  test('the parent is missing → the burst heuristic: the opening run of near-simultaneous questions counts as a replay, state uncertain', () => {
    // A replay is written by a program in one go with near-zero line gaps; a human's questions follow a
    // human rhythm
    const ms = (x: number): number => Date.parse('2026-08-01T10:00:00Z') + x
    const c = [rec(ms(0), 'A'), rec(ms(120), 'B'), rec(ms(240), 'C'), rec(ms(600_000), 'asked by a human')]
    expect(strip(c, null, ms(0))).toEqual({ n: 1, state: 'uncertain' })
  })

  test('the parent is missing and the question rhythm is normal → nothing is stripped', () => {
    const c = [rec(T(1), 'A'), rec(T(9), 'B')]
    expect(strip(c, null, T(1))).toEqual({ n: 2, state: 'uncertain' })
  })

  test('the parent is missing and the opening timestamps are out of order (a negative difference) → not a burst, nothing is stripped', () => {
    // A negative difference is not evidence of "written by a program in one go" (a single write has
    // monotonic timestamps); the same rule as the token side's
    // skipRewrittenBurst: stop at a negative difference. The direction of failure is stripping too much →
    // a real question silently disappears.
    const ms = (x: number): number => Date.parse('2026-08-01T10:00:00Z') + x
    const c = [rec(ms(1000), 'A'), rec(ms(400), 'B'), rec(ms(500), 'C')]
    expect(strip(c, null, ms(0))).toEqual({ n: 3, state: 'uncertain' })
  })

  test('the parent exists but has no questions of its own → nothing to check against, so nothing is stripped and it is labelled uncertain', () => {
    const c = [rec(T(5), 'A')]
    expect(strip(c, [], T(5))).toEqual({ n: 1, state: 'uncertain' })
  })

  test('the child is a strict prefix of the parent\'s replayed span: a full match can still strip it empty, but it is labelled uncertain (it never reached replayLen)', () => {
    // The other way the fingerprint path strips empty: every entry was verified as a replay, it is just
    // shorter than the parent's replayed span.
    // Like a stripped empty result, it is not listed (combine judges on shown being empty, not on state).
    const p = [rec(T(1), 'A'), rec(T(2), 'B')]
    const c = [rec(T(5), 'A')]
    expect(strip(c, p, T(5))).toEqual({ n: 0, state: 'uncertain' })
  })

  test('stripping does not alter the offsets of the records it keeps', () => {
    const p = [rec(T(1), 'A')]
    const c: QuestionRec[] = [rec(T(5), 'A'), [111, 222, 333, T(6), 2, 1, fingerprint('B')]]
    const r = stripReplayPrefix(c, p, T(5), true)
    expect(r.questions[0]).toEqual([111, 222, 333, T(6), 2, 1, fingerprint('B')])
  })
})

describe('the content fingerprint', () => {
  test('the same text gives the same fingerprint, different text a different one', () => {
    expect(fingerprint('★ same text ★')).toBe(fingerprint('★ same text ★'))
    expect(fingerprint('★A')).not.toBe(fingerprint('★B'))
  })

  test('it is a 32-bit unsigned integer from which the text cannot be recovered', () => {
    const fp = fingerprint('★ a fairly long question with multi-byte characters ★ to confirm the output is still a small integer')
    expect(Number.isInteger(fp)).toBe(true)
    expect(fp).toBeGreaterThanOrEqual(0)
    expect(fp).toBeLessThanOrEqual(0xffffffff)
  })

  test('an empty string has a definite value and does not throw', () => {
    expect(typeof fingerprint('')).toBe('number')
  })
})

describe('questionTextAt (the session page\'s display text, judged the same way as the index)', () => {
  test('claude: the full text after noise stripping (the cron prefix goes, the body stays)', () => {
    const obj = cUser('[cron:abc scheduled] the actual instruction') as Record<string, unknown>
    expect(questionTextAt('claude', obj)).toBe('the actual instruction')
  })

  test('codex: the user_message source with noise stripped', () => {
    const obj = xUser('  question padded with spaces  ') as Record<string, unknown>
    expect(questionTextAt('codex', obj)).toBe('question padded with spaces')
  })

  test('a non-question line is always null: a tool result fed back, an assistant line, a sidechain, pure noise', () => {
    expect(questionTextAt('claude', cTool('Bash') as Record<string, unknown>)).toBeNull()
    expect(
      questionTextAt('claude', {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] }
      })
    ).toBeNull()
    expect(questionTextAt('claude', cUser('Warmup') as Record<string, unknown>)).toBeNull()
    expect(
      questionTextAt('claude', { ...(cUser('dispatch prompt') as Record<string, unknown>), isSidechain: true })
    ).toBeNull()
  })
})
