// The Antigravity CLI record reader (token-stats::REQ-003/AC-07, token-stats::REQ-003/AC-08, token-stats::REQ-003/AC-09):
// the trajectory metadata record decoded by field number against the descriptors embedded in agy 1.4.9. The first four
// cases read real records (src/main/testing/agy-fixture.ts says where they come from); the encoded ones are pinned to
// the real layout by the last case.
import { describe, expect, it } from 'vitest'
import { decodeTrajectoryMetadata, firstFolder, folderPath, isSubagent } from './agy-proto'
import {
  MEASURED_FOLDER,
  MEASURED_SUBAGENT_PARENT,
  encodeTrajectoryMetadata,
  measured
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
