// The Antigravity CLI record reader (token-stats::REQ-003/AC-07, token-stats::REQ-003/AC-08, token-stats::REQ-003/AC-09):
// the trajectory metadata record decoded by field number against the descriptors embedded in agy 1.4.9. The first four
// cases read real records (src/main/testing/agy-fixture.ts says where they come from); the encoded ones are pinned to
// the real layout by the last case.
//
// The usage records (token-stats::REQ-003): the step metadata and generator records of one API-key call and one
// signed-in call, as agy wrote them on 2026-10-28, decode to that call's measured figures; the encoders the providers
// cases build their databases with are tied to those records by what the reader reads off both.
import { describe, expect, it } from 'vitest'
import {
  decodeGeneratorMetadata,
  decodeStepMetadata,
  decodeTrajectoryMetadata,
  firstFolder,
  folderPath,
  isSubagent
} from './agy-proto'
import {
  MEASURED_FOLDER,
  MEASURED_SUBAGENT_PARENT,
  MEASURED_USAGE_CONVERSATION,
  encodeGeneratorMetadata,
  encodeStepMetadata,
  encodeTrajectoryMetadata,
  measured,
  measuredUsage
} from '../testing/agy-fixture'

describe('the trajectory metadata record, as agy wrote it', () => {
  it('an API-key main conversation lists its one folder and carries no parent marker', () => {
    const m = decodeTrajectoryMetadata(measured('mainApiKey'))
    expect(firstFolder(m)).toBe('/Users/sample/work/agy-fixture-project-x12')
    expect(m.parentConversationId).toBeNull()
    expect(isSubagent(m)).toBe(false)
  })

  it('a signed-in main conversation reads the same past its packed experiment ids (field 15)', () => {
    const m = decodeTrajectoryMetadata(measured('mainSignedIn'))
    expect(firstFolder(m)).toBe(MEASURED_FOLDER)
    expect(isSubagent(m)).toBe(false)
  })

  it('a subagent conversation is one, and names its parent', () => {
    const m = decodeTrajectoryMetadata(measured('subagent'))
    expect(isSubagent(m)).toBe(true)
    expect(m.parentConversationId).toBe('78543117-17bd-4161-bc47-c256f29f31eb')
    expect(m.nestingDepth).toBe(1)
    expect(m.hasSubagentSpec).toBe(true)
    expect(firstFolder(m)).toBe(MEASURED_FOLDER)
  })

  it('the conversation agy creates when its interface is opened and left lists its folder', () => {
    const m = decodeTrajectoryMetadata(measured('emptyConversation'))
    expect(firstFolder(m)).toBe(MEASURED_FOLDER)
    expect(isSubagent(m)).toBe(false)
  })

  it('a record cut short does not decode, rather than decoding as less', () => {
    // Inside the first workspace's length-delimited body (its length says 110, 38 bytes follow)
    expect(() => decodeTrajectoryMetadata(measured('mainApiKey').subarray(0, 40))).toThrow()
    // Inside a varint: the signed-in record's field 15 starts at offset 253 (7a d8 03 …), so cutting at 255 leaves
    // its length's first byte, whose continuation bit is set
    expect(() => decodeTrajectoryMetadata(measured('mainSignedIn').subarray(0, 255))).toThrow()
  })
})

describe('the markers and folders a record can carry', () => {
  const base = { folders: ['/work/p'], conversationId: 'c-1' }

  it('a parent, a nesting depth or a subagent spec each make a subagent; a record with none is a main conversation', () => {
    expect(isSubagent(decodeTrajectoryMetadata(encodeTrajectoryMetadata({ ...base, parentConversationId: 'p-1' })))).toBe(true)
    expect(isSubagent(decodeTrajectoryMetadata(encodeTrajectoryMetadata({ ...base, nestingDepth: 1 })))).toBe(true)
    expect(isSubagent(decodeTrajectoryMetadata(encodeTrajectoryMetadata({ ...base, subagentSpec: true })))).toBe(true)
    expect(isSubagent(decodeTrajectoryMetadata(encodeTrajectoryMetadata(base)))).toBe(false)
  })

  it('a nesting depth of zero is no subagent marker', () => {
    const m = decodeTrajectoryMetadata(encodeTrajectoryMetadata({ ...base, nestingDepth: 0 }))
    expect([m.nestingDepth, isSubagent(m)]).toEqual([0, false])
  })

  it('a record listing two folders names the first; without workspace_uris the workspaces carry them', () => {
    const two = decodeTrajectoryMetadata(encodeTrajectoryMetadata({ ...base, folders: ['/work/first', '/work/second'] }))
    expect(firstFolder(two)).toBe('/work/first')
    const noUris = decodeTrajectoryMetadata(
      encodeTrajectoryMetadata({ ...base, folders: ['/work/only-ws', '/work/later'], omitWorkspaceUris: true })
    )
    expect(firstFolder(noUris)).toBe('/work/only-ws')
  })

  it('a percent-encoded folder URI is its path; a URI that is not a file names no local folder', () => {
    expect(folderPath('file:///Users/x/My%20Project')).toBe('/Users/x/My Project')
    expect(folderPath('vscode-remote://ssh-remote+host/home/x')).toBeNull()
    expect(folderPath('not a uri')).toBeNull()
  })

  it('the fixture encoder writes the measured record byte for byte', () => {
    const encoded = encodeTrajectoryMetadata({
      folders: [MEASURED_FOLDER],
      conversationId: '06d3cae9-60a7-485b-96d5-21857c993fdd',
      createdAt: { seconds: 1793174782, nanos: 117495000 },
      initializationStateId: '2cc09734-de77-497c-9422-8ae78cd9b5a2'
    })
    expect(Buffer.from(encoded).toString('hex')).toBe(Buffer.from(measured('mainApiKey')).toString('hex'))
    // The encoded subagent markers read like the measured ones
    const sub = decodeTrajectoryMetadata(
      encodeTrajectoryMetadata({ ...base, parentConversationId: MEASURED_SUBAGENT_PARENT, nestingDepth: 1, subagentSpec: true })
    )
    expect([sub.parentConversationId, sub.nestingDepth, sub.hasSubagentSpec]).toEqual([MEASURED_SUBAGENT_PARENT, 1, true])
  })
})

describe('the usage records, as agy wrote them (token-stats::REQ-003)', () => {
  // The API-key call Aa3haqKe… of 06d3cae9 and the signed-in call bLzhasLy… of fc99511b: their figures as the research
  // record's descriptor-based decoder read them, reconciled against agy's own per-call output
  const apiKeyCall = { input: 6813, output: 109, cacheWrite: 0, cacheRead: 0, identity: 'Aa3haqKeCoDNrfcPq8SHyAg' }
  const signedInCall = { input: 6745, output: 96, cacheWrite: 0, cacheRead: 0, identity: 'bLzhasLyEa_Z1e8P8sCAuAY' }

  it('an API-key step records its call, its times and the conversation it was recorded in', () => {
    expect(decodeStepMetadata(measuredUsage('stepApiKey'))).toEqual({
      createdAt: 1_793_174_782_173,
      completedAt: 1_793_174_787_218,
      usage: apiKeyCall,
      retries: [],
      sourceConversationId: '06d3cae9-60a7-485b-96d5-21857c993fdd'
    })
  })

  it('its generator record names the step and the next, holds the call, lists it again first in its retries, and names its conversation', () => {
    expect(decodeGeneratorMetadata(measuredUsage('genApiKey'))).toEqual({
      stepIndices: [1, 2],
      usage: apiKeyCall,
      retries: [apiKeyCall],
      responseModel: 'gemini-3.6-flash',
      conversationId: '06d3cae9-60a7-485b-96d5-21857c993fdd'
    })
  })

  it('a signed-in call is identified by its response id, not its bot- message id, and its model keeps its suffix', () => {
    const step = decodeStepMetadata(measuredUsage('stepSignedIn'))
    expect(step.usage).toEqual(signedInCall)
    expect([step.createdAt, step.completedAt, step.sourceConversationId]).toEqual([
      1_793_178_728_665,
      1_793_178_732_621,
      'fc99511b-e69c-426a-8dfd-b7e7a82823f5'
    ])
    expect(decodeGeneratorMetadata(measuredUsage('genSignedIn'))).toEqual({
      stepIndices: [1, 2],
      usage: signedInCall,
      retries: [signedInCall],
      responseModel: 'gemini-3.8-flash-n',
      conversationId: 'fc99511b-e69c-426a-8dfd-b7e7a82823f5'
    })
  })

  it('the fixture encoders write what the reader reads off the measured records', () => {
    const apiKey = { input: 6813, output: 109, thinking: 76, response: 33, messageId: 'Aa3haqKeCoDNrfcPq8SHyAg' }
    const signedIn = {
      model: 1318,
      input: 6745,
      output: 96,
      thinking: 63,
      response: 33,
      messageId: 'bot-4054365f-3ec6-484e-aeea-d480532d9801',
      responseId: 'bLzhasLyEa_Z1e8P8sCAuAY'
    }
    expect(
      decodeStepMetadata(
        encodeStepMetadata({
          conversationId: MEASURED_USAGE_CONVERSATION.apiKey,
          stepIndex: 1,
          createdAt: 1_793_174_782_173,
          completedAt: 1_793_174_787_218,
          usage: apiKey
        })
      )
    ).toEqual(decodeStepMetadata(measuredUsage('stepApiKey')))
    expect(
      decodeGeneratorMetadata(
        encodeGeneratorMetadata({
          stepIndices: [1, 2],
          usage: apiKey,
          responseModel: 'gemini-3.6-flash',
          conversationId: MEASURED_USAGE_CONVERSATION.apiKey
        })
      )
    ).toEqual(decodeGeneratorMetadata(measuredUsage('genApiKey')))
    expect(
      decodeStepMetadata(
        encodeStepMetadata({
          conversationId: MEASURED_USAGE_CONVERSATION.signedIn,
          stepIndex: 1,
          createdAt: 1_793_178_728_665,
          completedAt: 1_793_178_732_621,
          usage: signedIn
        })
      )
    ).toEqual(decodeStepMetadata(measuredUsage('stepSignedIn')))
    expect(
      decodeGeneratorMetadata(
        encodeGeneratorMetadata({
          stepIndices: [1, 2],
          usage: signedIn,
          responseModel: 'gemini-3.8-flash-n',
          conversationId: MEASURED_USAGE_CONVERSATION.signedIn
        })
      )
    ).toEqual(decodeGeneratorMetadata(measuredUsage('genSignedIn')))
  })

  it('a record cut short, or a field the reader reads in another wire type, does not decode (token-stats::REQ-004/AC-01)', () => {
    // Inside the usage (field 9 starts at offset 54 of the API-key step, its 37-byte body at 56) and inside the generator
    // record's chat-model branch (its 544-byte body starts at 47)
    expect(() => decodeStepMetadata(measuredUsage('stepApiKey').subarray(0, 80))).toThrow()
    expect(() => decodeGeneratorMetadata(measuredUsage('genApiKey').subarray(0, 300))).toThrow()
    // model_usage (9) written as a varint where the descriptor declares a message
    expect(() => decodeStepMetadata(Uint8Array.from([0x48, 0x05]))).toThrow()
  })

  it('step indices read packed, as agy writes them, and unpacked, the other encoding protobuf allows', () => {
    expect(decodeGeneratorMetadata(encodeGeneratorMetadata({ stepIndices: [3, 4] })).stepIndices).toEqual([3, 4])
    expect(decodeGeneratorMetadata(encodeGeneratorMetadata({ stepIndices: [3, 4], unpacked: true })).stepIndices).toEqual([3, 4])
  })

  it('a generator record carrying a large prompt is read past it', () => {
    const g = decodeGeneratorMetadata(
      encodeGeneratorMetadata({
        stepIndices: [5],
        prompt: new Uint8Array(1_000_000).fill(0x41),
        usage: { input: 10, output: 2, messageId: 'm-large' },
        responseModel: 'gemini-3.6-flash'
      })
    )
    expect([g.usage?.identity, g.usage?.input, g.responseModel]).toEqual(['m-large', 10, 'gemini-3.6-flash'])
  })
})
