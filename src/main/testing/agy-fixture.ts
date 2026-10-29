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
}

/** Write `<dir>/<id>.db` holding one trajectory metadata record; returns its path and, with keepOpen, the writer */
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
  db.exec('PRAGMA user_version = 1')
  for (const sql of SCHEMA) db.exec(sql)
  db.prepare('INSERT INTO trajectory_meta VALUES (?, ?, 4, ?)').run(`${id}-trajectory`, id, opts.source ?? 17)
  db.prepare("INSERT INTO trajectory_metadata_blob (id, data) VALUES ('main', ?)").run(record)
  if (opts.keepOpen) return { file, writer: db }
  db.close()
  return { file, writer: null }
}

/** agy's settings file with the measured key set: its permission rules and the trust ledger */
export function settingsJson(trusted: unknown): string {
  return JSON.stringify({ permissions: { allow: ['command(regex:python3 -m unittest.*)'] }, trustedWorkspaces: trusted })
}
