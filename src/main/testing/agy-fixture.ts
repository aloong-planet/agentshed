// Antigravity CLI (agy) fixtures for the providers and e2e seams: conversation databases with agy's schema, and the
// trajectory metadata record each one carries.
//
// **Where the shapes come from.** The four MEASURED records are real ones, copied from the conversations agy 1.4.9 wrote
// on 2026-10-28 (an API-key session, a signed-in one, a subagent and an interface opened with nothing sent), with one
// change each: the folder `/Users/loong_zhou/CascadeProjects/agy-demo` is replaced by a path of the same length, so
// every length prefix stays valid, and the subagent record drops its top-level fields 4 and 10 (about 10 KB of agent
// configuration and prompts) — top-level fields are independent records, so the rest is byte-for-byte what agy wrote.
// The descriptor-based decoder of the research record (`~/research/antigravity-cli-internals/spike/agydecode.py`, built
// on the descriptors embedded in agy 1.4.9) reads all four with no unknown field.
//
// `encodeTrajectoryMetadata` writes the same layout for folders and markers a case needs: the real field order (1, 2,
// 3, 5, 6, 7, 8, 17, 18) and each workspace's four sub-fields. A unit case pins it to reproduce the API-key record byte
// for byte, which is what lets the encoded fixtures stand for real ones.
//
// The schema is the one dumped from a real conversation database: seven tables, two indexes, `user_version = 1`, a
// 32 KB page and the WAL journal. A database kept open by a writer (`keepOpen`) is agy's own state while it runs: the
// `-wal` and `-shm` files exist, and every row written after the journal switch lives only in the log.
//
// **Usage records** (token-stats::REQ-003). The four MEASURED_USAGE records are real ones, unchanged: one API-key call
// (step 1 and generator record 0 of conversation 06d3cae9) and one signed-in call (step 1 and generator record 0 of
// conversation fc99511b), holding ids only — no path, name or prompt. Their steps name their own conversation as the
// one they were recorded in, so a database holding them carries that conversation's name (MEASURED_USAGE_CONVERSATION).
// `encodeStepMetadata` and `encodeGeneratorMetadata` write the layout every measured record of 2026-10-28 shows (all
// 19 conversations enumerated): step metadata and usage fields in ascending field order; a generator record writes its
// packed step indices, its scalar fields, then the chat-model branch of its oneof; a call's generator record lists the
// call again as the first entry of its retry list; a failed attempt is a generator record with an error, no step
// indices, a usage holding only the model, and retry entries with an error and a reason. A unit case ties the
// encoders to the measured records: what the reader reads off an encoded record equals what it reads off the real one.
import { DatabaseSync } from '../providers/sqlite'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Real trajectory metadata records (hex), see the header. Their folder is MEASURED_FOLDER. */
export const MEASURED_TRAJECTORY = {
  mainApiKey:
    '0a6e0a3166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831' +
    '32123166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d783132' +
    '1a0022046d61696e120b08fed986d70610d8a983381a2432636330393733342d646537372d343937632d393432322d3861653738' +
    '63643962356132322430366433636165392d363061372d343835622d393664352d3231383537633939336664643a3166696c653a' +
    '2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831329201136465666175' +
    '6c742d636c692d70726f6a656374',
  mainSignedIn:
    '0a6e0a3166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831' +
    '32123166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d783132' +
    '1a0022046d61696e120c08e8f886d70610e0e1bcab021a2435393866336138632d363433392d343531342d386330642d31636563' +
    '3131616535366238322466633939353131622d653639632d343236612d386466642d6237653761383238323366353a3166696c65' +
    '3a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831327ad803889cb630' +
    'a5c5c930f0b18f31f6b18f31f5e99531f8e99531fbcff23182d0f23193e3f431c1c8fd31bab28332bfb28332e2f78332edf78332' +
    'b2b48932acc4ae32b3c4ae32d0edb032d3edb032f090b332f290b332b4dbb432b9dbb432f2eeb432d4d2b832e8edba32eaedba32' +
    'a1f5ba32a4f5ba32b78bbc32ba8bbc3283ffbc32c3ecbe32cfecbe32d1ecbe32fdbcc4328abdc4328bbdc432a0bdc432a1bdc432' +
    'b6bdc432e0d4c632e3d4c632f7d4c632b886c732add9c732afd9c7329cd1c9329ed1c93291efcb32aeefcb32b2ffcb32b7ffcb32' +
    'd5d6cc32ecd6cc328493cd328993cd32cda2cd32cfa2cd32f2a5ce32d4c1ce32e4d5d332d4efd532dff7d632fefcdc32aad4dd32' +
    'acd4dd32b1d4dd32b3d4dd32b8d4dd32bad4dd32e9fade32ebfade32d7dee132d9dee13281d9e23283d9e2328dfbe632acd1e732' +
    'aed1e732c6b5e832c4b8e8329c95ea32acb4eb32aeb4eb32fce5ec32fee5ec3287fced3289fced3290fced3292fced32e897f132' +
    'a4a2f132a6a2f132bff5f132d7e2f332b292f6328abdf632c0eef632c4eef632c6eef632caeef632cceef6328da4f732ddbcf732' +
    'caf6f732ff93f832cc94f8329d9cf8329e9cf832b4a8f832b5a8f832b6a8f832decdf832daf1f832b3b9fa32d5b9fa32e6bafa32' +
    '92011364656661756c742d636c692d70726f6a656374',
  subagent:
    '0a6e0a3166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831' +
    '32123166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d783132' +
    '1a0022046d61696e120c08d8db86d7061080caebd6031a2466363235343833622d316232372d343737662d613733322d33633339' +
    '62666438643461372a2437383534333131372d313762642d343136312d626334372d633235366632396633316562322437383534' +
    '333131372d313762642d343136312d626334372d6332353666323966333165623a3166696c653a2f2f2f55736572732f73616d70' +
    '6c652f776f726b2f6167792d666978747572652d70726f6a6563742d78313242760a0473656c661212436f64656261736520496e' +
    '73706563746f721a53506c65617365206c69737420746865206e616d6573206f6620616c6c2066756e6374696f6e732064656669' +
    '6e656420696e2063616c632e7079206c6f636174656420696e2074686520776f726b73706163652e38b008400120018801019201' +
    '1364656661756c742d636c692d70726f6a656374',
  emptyConversation:
    '0a6e0a3166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831' +
    '32123166696c653a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d783132' +
    '1a0022046d61696e120c08f3ee87d70610d0e4e096021a2432616238626361382d323936632d343664652d386165642d34396663' +
    '3134323462646533322432626163323732612d303763392d343562342d613866642d3632663963646633636635373a3166696c65' +
    '3a2f2f2f55736572732f73616d706c652f776f726b2f6167792d666978747572652d70726f6a6563742d7831327ad803889cb630' +
    'a5c5c930f0b18f31f6b18f31f5e99531f8e99531fbcff23182d0f23193e3f431c1c8fd31bab28332bfb28332e2f78332edf78332' +
    'b2b48932acc4ae32b3c4ae32d0edb032d3edb032f090b332f290b332b4dbb432b9dbb432f2eeb432d4d2b832e8edba32eaedba32' +
    'a1f5ba32a4f5ba32b78bbc32ba8bbc3283ffbc32c3ecbe32cfecbe32d1ecbe32fdbcc4328abdc4328bbdc432a0bdc432a1bdc432' +
    'b6bdc432e0d4c632e3d4c632f7d4c632b886c732add9c732afd9c7329cd1c9329ed1c93291efcb32aeefcb32b2ffcb32b7ffcb32' +
    'd5d6cc32ecd6cc328493cd328993cd32cda2cd32cfa2cd32f2a5ce32d4c1ce32e4d5d332d4efd532dff7d632fefcdc32aad4dd32' +
    'acd4dd32b1d4dd32b3d4dd32b8d4dd32bad4dd32e9fade32ebfade32d7dee132d9dee13281d9e23283d9e2328dfbe632acd1e732' +
    'aed1e732c6b5e832c4b8e8329c95ea32acb4eb32aeb4eb32fce5ec32fee5ec3287fced3289fced3290fced3292fced32e897f132' +
    'a4a2f132a6a2f132bff5f132d7e2f332b292f6328abdf632c0eef632c4eef632c6eef632caeef632cceef6328da4f732ddbcf732' +
    'caf6f732ff93f832cc94f8329d9cf8329e9cf832b4a8f832b5a8f832b6a8f832decdf832daf1f832b3b9fa32d5b9fa32e6bafa32' +
    '92011364656661756c742d636c692d70726f6a656374',
} as const

/** The folder the measured records name (the substitute for the real one, the same length) */
export const MEASURED_FOLDER = '/Users/sample/work/agy-fixture-project-x12'

/** The measured subagent's parent conversation */
export const MEASURED_SUBAGENT_PARENT = '78543117-17bd-4161-bc47-c256f29f31eb'

export function measured(name: keyof typeof MEASURED_TRAJECTORY): Uint8Array {
  return Uint8Array.from(Buffer.from(MEASURED_TRAJECTORY[name], 'hex'))
}

/** Real usage records (hex), see the header */
export const MEASURED_USAGE = {
  stepApiKey:
    '0a0b08fed986d706109890f9521802320b0883da86d70610b0f6e7303a0b0883da86d70610e0c39e68420b0883da86d70610e0c3' +
    '9e684a2508b008109d35186d3a174161336861714b65436f444e7266635071385348794167484c502158b0086224333136373864' +
    '32332d373365302d343230392d396531302d303465376537643338376537a2014e0a2437643137323735632d396231622d343064' +
    '652d383436362d6336653038633564653235381001222430366433636165392d363061372d343835622d393664352d3231383537' +
    '63393933666464d201220a0f0808120b0883da86d7061088a4eb300a0f0803120b0883da86d7061098db9e6882020b0883da86d7' +
    '0610e0c39e689a02206234623731356234643532323435326439366332306633316562636532353537',
  genApiKey:
    '12020102222433313637386432332d373365302d343230392d396531302d30346537653764333837653750010aa00418b0082225' +
    '08b008109d35186d3a174161336861714b65436f444e7266635071385348794167484c50214a1410ffffffffffffffffff015207' +
    '08ff4b2080d00f5a08080410b7ccd7ba0362051093bbb6378a0127122508b008109d35186d3a174161336861714b65436f444e72' +
    '66635071385348794167484c50219a011067656d696e692d332e362d666c617368a201140a0b757365645f636c61756465120566' +
    '616c7365a201320a0a636173636164655f6964122430366433636165392d363061372d343835622d393664352d32313835376339' +
    '3933666464a201140a0f6c6173745f737465705f696e646578120130a201370a0f726f6f745f636173636164655f696412243036' +
    '6433636165392d363061372d343835622d393664352d323138353763393933666464a2011d0a15757365645f6e6f6e5f67656d69' +
    '6e695f6d6f64656c120474727565a201350a0d7472616a6563746f72795f6964122437643137323735632d396231622d34306465' +
    '2d383436362d633665303863356465323538a201340a0a726571756573745f6964122637643137323735632d396231622d343064' +
    '652d383436362d6336653038633564653235382d30a201210a18757365645f636c617564655f636f6e7365727661746976651205' +
    '66616c7365a201230a0a6d6f64656c5f656e756d12154d4f44454c5f504c414345484f4c4445525f4d3732aa011947656d696e69' +
    '20332e3620466c61736820284d656469756d29',
  stepSignedIn:
    '0a0c08e8f886d70610c8cababd021802320c08ecf886d70610f8c48dc0013a0c08ecf886d70610d08ac8a802420c08ecf886d706' +
    '10d08ac8a8024a7408a60a10d934186030183a28626f742d34303534333635662d336563362d343834652d616565612d64343830' +
    '353332643938303142210a0973657373696f6e494412142d33373530373633303334333632383935353739483f50215a17624c7a' +
    '6861734c7945615f5a316538503873434175415958a60a622432313739616434632d326336322d343965612d613531642d333961' +
    '623331333434336163a2014e0a2466646439343864382d363839342d343238342d393764332d3965613638346633623265351001' +
    '222466633939353131622d653639632d343236612d386466642d623765376138323832336635d201240a100808120c08ecf886d7' +
    '061090ba8ec0010a100803120c08ecf886d70610f0a9c8a80282020c08ecf886d70610d08ac8a8029a0220356235623562353039' +
    '6664613462393139366138626638653133396537336435',
  genSignedIn:
    '12020102222432313739616434632d326336322d343965612d613531642d33396162333133343433616342d803889cb630a5c5c9' +
    '30f0b18f31f6b18f31f5e99531f8e99531fbcff23182d0f23193e3f431c1c8fd31bab28332bfb28332e2f78332edf78332b2b489' +
    '32acc4ae32b3c4ae32d0edb032d3edb032f090b332f290b332b4dbb432b9dbb432f2eeb432d4d2b832e8edba32eaedba32a1f5ba' +
    '32a4f5ba32b78bbc32ba8bbc3283ffbc32c3ecbe32cfecbe32d1ecbe32fdbcc4328abdc4328bbdc432a0bdc432a1bdc432b6bdc4' +
    '32e0d4c632e3d4c632f7d4c632b886c732add9c732afd9c7329cd1c9329ed1c93291efcb32aeefcb32b2ffcb32b7ffcb32d5d6cc' +
    '32ecd6cc328493cd328993cd32cda2cd32cfa2cd32f2a5ce32d4c1ce32e4d5d332d4efd532dff7d632fefcdc32aad4dd32acd4dd' +
    '32b1d4dd32b3d4dd32b8d4dd32bad4dd32e9fade32ebfade32d7dee132d9dee13281d9e23283d9e2328dfbe632acd1e732aed1e7' +
    '32c6b5e832c4b8e8329c95ea32acb4eb32aeb4eb32fce5ec32fee5ec3287fced3289fced3290fced3292fced32e897f132a4a2f1' +
    '32a6a2f132bff5f132d7e2f332b292f6328abdf632c0eef632c4eef632c6eef632caeef632cceef6328da4f732ddbcf732caf6f7' +
    '32ff93f832cc94f8329d9cf8329e9cf832b4a8f832b5a8f832b6a8f832decdf832daf1f832b3b9fa32d5b9fa32e6bafa320ad305' +
    '18a60a227408a60a10d934186030183a28626f742d34303534333635662d336563362d343834652d616565612d64343830353332' +
    '643938303142210a0973657373696f6e494412142d33373530373633303334333632383935353739483f50215a17624c7a686173' +
    '4c7945615f5a31653850387343417541594a1410ffffffffffffffffff01520708f94b2080d00f5a08080310dcafbcdf02620510' +
    'acb8ba688a018801127408a60a10d934186030183a28626f742d34303534333635662d336563362d343834652d616565612d6434' +
    '3830353332643938303142210a0973657373696f6e494412142d33373530373633303334333632383935353739483f50215a1762' +
    '4c7a6861734c7945615f5a31653850387343417541592210636165613034303639613831653339649a011267656d696e692d332e' +
    '382d666c6173682d6ea201370a0f726f6f745f636173636164655f6964122466633939353131622d653639632d343236612d3864' +
    '66642d623765376138323832336635a201240a0a6d6f64656c5f656e756d12164d4f44454c5f504c414345484f4c4445525f4d33' +
    '3138a201340a0a726571756573745f6964122666646439343864382d363839342d343238342d393764332d396561363834663362' +
    '3265352d30a201210a18757365645f636c617564655f636f6e736572766174697665120566616c7365a201140a0f6c6173745f73' +
    '7465705f696e646578120130a201320a0a636173636164655f6964122466633939353131622d653639632d343236612d38646664' +
    '2d623765376138323832336635a201350a0d7472616a6563746f72795f6964122466646439343864382d363839342d343238342d' +
    '393764332d396561363834663362326535a201140a0b757365645f636c61756465120566616c7365a2011e0a15757365645f6e6f' +
    '6e5f67656d696e695f6d6f64656c120566616c7365aa011747656d696e6920332e3820466c61736820284869676829'
} as const

/** The conversations the measured usage records come from: their steps name these as where they were recorded */
export const MEASURED_USAGE_CONVERSATION = {
  apiKey: '06d3cae9-60a7-485b-96d5-21857c993fdd',
  signedIn: 'fc99511b-e69c-426a-8dfd-b7e7a82823f5'
} as const

export function measuredUsage(name: keyof typeof MEASURED_USAGE): Uint8Array {
  return Uint8Array.from(Buffer.from(MEASURED_USAGE[name], 'hex'))
}

export interface TrajectoryFixture {
  /** Absolute folder paths, in order; written as file URIs into both the workspaces (1) and workspace_uris (7) */
  folders: string[]
  /** The conversation's own id: the root conversation of a main conversation */
  conversationId: string
  createdAt?: { seconds: number; nanos: number }
  initializationStateId?: string
  /** Field 5; a subagent's root conversation is its parent */
  parentConversationId?: string
  /** Field 17 */
  nestingDepth?: number
  /** Field 8, written as the measured spec's first field (`type_name: "self"`) */
  subagentSpec?: boolean
  /** Leaves field 7 out, for the case where only the workspaces carry the folder */
  omitWorkspaceUris?: boolean
  /** Folder URIs written as given rather than from `folders` (a percent-encoded or non-file URI) */
  rawUris?: string[]
}

function varint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80)
    v = Math.floor(v / 0x80)
  }
  out.push(v)
  return out
}
const key = (field: number, wire: number): number[] => varint(field * 8 + wire)
const lenField = (field: number, body: number[]): number[] => [...key(field, 2), ...varint(body.length), ...body]
const strField = (field: number, s: string): number[] => lenField(field, [...Buffer.from(s, 'utf8')])
const varField = (field: number, n: number): number[] => [...key(field, 0), ...varint(n)]

export function encodeTrajectoryMetadata(f: TrajectoryFixture): Uint8Array {
  const uris = f.rawUris ?? f.folders.map((p) => pathToFileURL(p).href)
  const out: number[] = []
  for (const uri of uris) {
    out.push(...lenField(1, [...strField(1, uri), ...strField(2, uri), ...lenField(3, []), ...strField(4, 'main')]))
  }
  const at = f.createdAt ?? { seconds: 1793174782, nanos: 117495000 }
  out.push(...lenField(2, [...varField(1, at.seconds), ...varField(2, at.nanos)]))
  out.push(...strField(3, f.initializationStateId ?? '2cc09734-de77-497c-9422-8ae78cd9b5a2'))
  if (f.parentConversationId !== undefined) out.push(...strField(5, f.parentConversationId))
  out.push(...strField(6, f.parentConversationId ?? f.conversationId))
  if (!f.omitWorkspaceUris) for (const uri of uris) out.push(...strField(7, uri))
  if (f.subagentSpec) out.push(...lenField(8, strField(1, 'self')))
  if (f.nestingDepth !== undefined) out.push(...varField(17, f.nestingDepth))
  out.push(...strField(18, 'default-cli-project'))
  return Uint8Array.from(out)
}

/** One call's usage (ModelUsageStats); absent and zero fields are not written, as proto3 does */
export interface UsageFixture {
  /** The model enum (1); the measured API-key calls carry 1072 */
  model?: number
  input?: number
  output?: number
  cacheWrite?: number
  cacheRead?: number
  /** The thinking (9) and visible (10) parts of output — already inside it */
  thinking?: number
  response?: number
  messageId?: string
  responseId?: string
  providerMessageId?: string
}

function usageBytes(u: UsageFixture): number[] {
  const out: number[] = []
  const v = (field: number, n: number | undefined): void => {
    if (n) out.push(...varField(field, n))
  }
  const s = (field: number, t: string | undefined): void => {
    if (t) out.push(...strField(field, t))
  }
  v(1, u.model ?? 1072)
  v(2, u.input)
  v(3, u.output)
  v(4, u.cacheWrite)
  v(5, u.cacheRead)
  s(7, u.messageId)
  v(9, u.thinking)
  v(10, u.response)
  s(11, u.responseId)
  s(12, u.providerMessageId)
  return out
}

function timestampBytes(ms: number): number[] {
  const seconds = Math.floor(ms / 1000)
  return [...varField(1, seconds), ...varField(2, (ms - seconds * 1000) * 1_000_000)]
}

export interface StepFixture {
  /** The conversation the step was recorded in (source_trajectory_step_info.cascade_id): the database's own name, or
   * the parent's on a step a fork copied */
  conversationId: string
  trajectoryId?: string
  stepIndex?: number
  createdAt?: number
  completedAt?: number
  usage?: UsageFixture
  /** retry_infos (28): each entry's usage */
  retries?: UsageFixture[]
}

export function encodeStepMetadata(s: StepFixture): Uint8Array {
  const out: number[] = []
  if (s.createdAt !== undefined) out.push(...lenField(1, timestampBytes(s.createdAt)))
  if (s.completedAt !== undefined) out.push(...lenField(8, timestampBytes(s.completedAt)))
  if (s.usage) out.push(...lenField(9, usageBytes(s.usage)))
  const source = [...strField(1, s.trajectoryId ?? `${s.conversationId}-trajectory`)]
  if (s.stepIndex) source.push(...varField(2, s.stepIndex))
  source.push(...strField(4, s.conversationId))
  out.push(...lenField(20, source))
  for (const r of s.retries ?? []) out.push(...lenField(28, lenField(2, usageBytes(r))))
  return Uint8Array.from(out)
}

export interface RetryFixture {
  usage?: UsageFixture
  error?: string
  /** RetryReason: 3 = RETRY_REASON_NON_RECOVERABLE (measured on a 429) */
  reason?: number
}

export interface GeneratorFixture {
  stepIndices?: number[]
  /** Write the step indices one varint per field rather than packed (agy packs them) */
  unpacked?: boolean
  /** The generator record's error (5), as a failed call carries */
  error?: string
  /** Bytes in chat_model.message_prompts (2) — the field holding the call's whole prompt */
  prompt?: Uint8Array
  usage?: UsageFixture
  /** chat_model.retry_infos (17). When absent, the list agy writes for a successful call: the call itself */
  retries?: RetryFixture[]
  responseModel?: string
  /** custom_metadata's `cascade_id`: the conversation that made the call (agy writes it on every record) */
  conversationId?: string
}

export function encodeGeneratorMetadata(g: GeneratorFixture): Uint8Array {
  const out: number[] = []
  const indices = g.stepIndices ?? []
  if (indices.length > 0) {
    if (g.unpacked) for (const i of indices) out.push(...varField(2, i))
    else out.push(...lenField(2, indices.flatMap((i) => varint(i))))
  }
  if (g.error) out.push(...strField(5, g.error))
  // concat rather than push(...): a prompt of a million bytes would overflow push's argument list
  let chat: number[] = g.prompt ? lenField(2, Array.from(g.prompt)) : []
  chat.push(...varField(3, g.usage?.model ?? 1072))
  if (g.usage) chat.push(...lenField(4, usageBytes(g.usage)))
  const retries = g.retries ?? (g.usage ? [{ usage: g.usage }] : [])
  for (const r of retries) {
    const body: number[] = []
    if (r.usage) body.push(...lenField(2, usageBytes(r.usage)))
    if (r.error) body.push(...strField(3, r.error))
    if (r.reason) body.push(...varField(5, r.reason))
    chat.push(...lenField(17, body))
  }
  if (g.responseModel) chat = chat.concat(strField(19, g.responseModel))
  if (g.conversationId) chat = chat.concat(lenField(20, [...strField(1, 'cascade_id'), ...strField(2, g.conversationId)]))
  return Uint8Array.from(out.concat(lenField(1, chat)))
}

/** A row of the steps table: a call is a PLANNER_RESPONSE step (type 15, measured) */
export interface StepRow {
  idx: number
  type?: number
  metadata: Uint8Array
}

/** A row of the gen_metadata table */
export interface GenRow {
  idx: number
  data: Uint8Array
}

/**
 * One call as agy records it (measured): its step, and the generator record naming that step and the next (the tool
 * step that follows a response) whose retry list repeats the call — the three copies of one call in one database.
 */
export function callRecord(c: {
  conversationId: string
  stepIdx: number
  genIdx: number
  usage: UsageFixture
  createdAt: number
  /** Absent: a step that never completed */
  completedAt?: number
  responseModel?: string
  /** The generator record writes no step indices: a call recorded by its generator record alone */
  withoutStepIndices?: boolean
}): { step: StepRow; gen: GenRow } {
  return {
    step: {
      idx: c.stepIdx,
      metadata: encodeStepMetadata({
        conversationId: c.conversationId,
        stepIndex: c.stepIdx,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
        usage: c.usage
      })
    },
    gen: {
      idx: c.genIdx,
      data: encodeGeneratorMetadata({
        stepIndices: c.withoutStepIndices ? [] : [c.stepIdx, c.stepIdx + 1],
        usage: c.usage,
        responseModel: c.responseModel,
        conversationId: c.conversationId
      })
    }
  }
}

/** Insert step rows through a connection (a writer holding the database open puts them in its log) */
export function insertSteps(db: DatabaseSync, rows: StepRow[]): void {
  if (rows.length === 0) return
  const stmt = db.prepare('INSERT INTO steps (idx, step_type, status, metadata) VALUES (?, ?, 3, ?)')
  for (const r of rows) stmt.run(r.idx, r.type ?? 15, r.metadata)
}

/** Insert generator rows through a connection */
export function insertGens(db: DatabaseSync, rows: GenRow[]): void {
  if (rows.length === 0) return
  const stmt = db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)')
  for (const r of rows) stmt.run(r.idx, r.data, r.data.length)
}

const SCHEMA = [
  'CREATE TABLE `trajectory_meta` (`trajectory_id` text,`cascade_id` text,`trajectory_type` integer,`source` integer,PRIMARY KEY (`trajectory_id`))',
  'CREATE TABLE `steps` (`idx` integer,`step_type` integer NOT NULL DEFAULT 0,`status` integer NOT NULL DEFAULT 0,`has_subtrajectory` numeric NOT NULL DEFAULT false,`metadata` blob,`error_details` blob,`permissions` blob,`task_details` blob,`render_info` blob,`step_payload` blob,`step_format` integer NOT NULL DEFAULT 0,PRIMARY KEY (`idx`))',
  'CREATE INDEX `idx_steps_status` ON `steps`(`status`)',
  'CREATE INDEX `idx_steps_step_type` ON `steps`(`step_type`)',
  'CREATE TABLE `gen_metadata` (`idx` integer,`data` blob,`size` integer NOT NULL DEFAULT 0,PRIMARY KEY (`idx`))',
  'CREATE TABLE `executor_metadata` (`idx` integer,`data` blob,PRIMARY KEY (`idx`))',
  'CREATE TABLE `parent_references` (`idx` integer,`data` blob,PRIMARY KEY (`idx`))',
  'CREATE TABLE `trajectory_metadata_blob` (`id` text DEFAULT "main",`data` blob,PRIMARY KEY (`id`))',
  'CREATE TABLE `battle_mode_infos` (`idx` integer,`data` blob,PRIMARY KEY (`idx`))'
]

export interface ConversationOptions {
  /** trajectory_meta.source: 17 (CLI) for main conversations and subagents alike, as measured */
  source?: number
  /**
   * Keep a writer connection open with checkpoints off, so the `-wal` and `-shm` files stay and every row lives only
   * in the log — the state of a conversation agy is writing. The caller closes the returned writer.
   */
  keepOpen?: boolean
  /** The model calls' rows */
  steps?: StepRow[]
  gens?: GenRow[]
  /** Another user version than agy's 1 — a format this reader does not support */
  userVersion?: number
  /** Replace a statement of the measured schema (by the table it creates) — a format this reader does not support */
  alterSchema?: (sql: string) => string | null
}

/** Write `<dir>/<id>.db` holding one trajectory metadata record and the given rows; returns its path and, with keepOpen,
 * the writer */
export function writeConversation(
  dir: string,
  id: string,
  record: Uint8Array,
  opts: ConversationOptions = {}
): { file: string; writer: DatabaseSync | null } {
  const file = join(dir, `${id}.db`)
  const db = new DatabaseSync(file)
  db.exec('PRAGMA page_size = 32768')
  db.exec('PRAGMA journal_mode = WAL')
  if (opts.keepOpen) db.exec('PRAGMA wal_autocheckpoint = 0')
  db.exec(`PRAGMA user_version = ${opts.userVersion ?? 1}`)
  for (const sql of SCHEMA) {
    const altered = opts.alterSchema ? opts.alterSchema(sql) : sql
    if (altered !== null) db.exec(altered)
  }
  db.prepare('INSERT INTO trajectory_meta VALUES (?, ?, 4, ?)').run(`${id}-trajectory`, id, opts.source ?? 17)
  db.prepare("INSERT INTO trajectory_metadata_blob (id, data) VALUES ('main', ?)").run(record)
  if (opts.steps) insertSteps(db, opts.steps)
  if (opts.gens) insertGens(db, opts.gens)
  if (opts.keepOpen) return { file, writer: db }
  db.close()
  return { file, writer: null }
}

/** agy's settings file with the measured key set: its permission rules and the trust ledger */
export function settingsJson(trusted: unknown): string {
  return JSON.stringify({ permissions: { allow: ['command(regex:python3 -m unittest.*)'] }, trustedWorkspaces: trusted })
}
