// The Antigravity CLI fixture's own case: the trajectory record it encodes is the real layout, byte for byte, so the
// records the cases encode are read as agy's own are. That the encoded subagent markers read as the measured ones do
// is shown by the engine module's reads of both (antigravity.test.ts, the trajectory record's cases).
import { describe, expect, it } from 'vitest'
import { MEASURED_FOLDER, encodeTrajectoryMetadata, measured } from './agy-fixture'

describe('the trajectory record the fixture encodes', () => {
  it('is the measured record, byte for byte, given its fields', () => {
    const encoded = encodeTrajectoryMetadata({
      folders: [MEASURED_FOLDER],
      conversationId: '06d3cae9-60a7-485b-96d5-21857c993fdd',
      createdAt: { seconds: 1793174782, nanos: 117495000 },
      initializationStateId: '2cc09734-de77-497c-9422-8ae78cd9b5a2'
    })
    expect(Buffer.from(encoded).toString('hex')).toBe(Buffer.from(measured('mainApiKey')).toString('hex'))
  })
})
