// Codex 侧数据读取:注册表(config.toml 的 [projects."<path>"] 段)。
// 不引 TOML 依赖:只需段头里的路径,逐行正则提取;段内内容(trust_level)当前不消费。
import { readFileSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import type { RegistryResult } from './claude'

const PROJECT_HEADER = /^\s*\[projects\."(.+)"\]\s*$/

export interface CodexSessionMeta {
  /** rollout 文件绝对路径 */
  file: string
  /** 归属项目路径(首行 session_meta.payload.cwd) */
  cwd: string
  /** 是否 subagent 线程(不计入会话数/活跃时间) */
  subagent: boolean
  /** 文件 mtime(epoch ms) */
  mtimeMs: number
  /** 本会话 id(payload.id) */
  sessionId: string | null
  /** 父会话 id:payload.forked_from_id 或 source.subagent.thread_spawn.parent_thread_id */
  parentId: string | null
  /** fork 时刻(顶层 timestamp,epoch ms);父会话此刻之前的用量即被本会话重放的历史 */
  forkedAt: number | null
}

/**
 * 递归遍历 codexHome/sessions 下全部 .jsonl,读每个文件首行取 cwd 归属。
 * 首行损坏/缺 cwd 的文件跳过(不弃整个扫描)。
 */
export function readCodexSessions(codexHome: string): CodexSessionMeta[] {
  const out: CodexSessionMeta[] = []
  // 两个数据根(与 ccusage codex paths.rs 一致):归档会话同样计入统计
  for (const name of ['sessions', 'archived_sessions']) {
    const root = join(codexHome, name)
    if (existsSync(root)) walk(root, out)
  }
  return out
}

function walk(dir: string, out: CodexSessionMeta[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      walk(p, out)
      continue
    }
    if (!e.name.endsWith('.jsonl')) continue
    const meta = readHead(p)
    if (meta) out.push(meta)
  }
}

/** 首行长度实测可达 42KB(session_meta 内嵌 base_instructions),必须读到换行为止再解析 */
const HEAD_CHUNK = 64 * 1024
const HEAD_MAX = 4 * 1024 * 1024

function readFirstLine(file: string): string | null {
  const fd = openSync(file, 'r')
  try {
    const chunks: Buffer[] = []
    let offset = 0
    for (;;) {
      const buf = Buffer.alloc(HEAD_CHUNK)
      const n = readSync(fd, buf, 0, HEAD_CHUNK, offset)
      if (n === 0) break
      const slice = buf.subarray(0, n)
      const nl = slice.indexOf(0x0a)
      if (nl !== -1) {
        chunks.push(slice.subarray(0, nl))
        return Buffer.concat(chunks).toString('utf8')
      }
      chunks.push(slice)
      offset += n
      if (offset >= HEAD_MAX) return null // 无换行的异常大文件:放弃,不吃内存
    }
    return chunks.length ? Buffer.concat(chunks).toString('utf8') : null
  } finally {
    closeSync(fd)
  }
}

/** 单文件版:读首行 session_meta。票 04 的单文件索引重建走这里,与全量扫描同源 */
export const readCodexSessionMeta = (file: string): CodexSessionMeta | null => readHead(file)

function readHead(file: string): CodexSessionMeta | null {
  try {
    {
      const firstLine = readFirstLine(file)
      if (firstLine === null) return null
      const parsed: unknown = JSON.parse(firstLine)
      if (typeof parsed !== 'object' || parsed === null) return null
      const payload = (parsed as Record<string, unknown>)['payload']
      if (typeof payload !== 'object' || payload === null) return null
      const cwd = (payload as Record<string, unknown>)['cwd']
      if (typeof cwd !== 'string' || cwd === '') return null
      const pl = payload as Record<string, unknown>
      const subagent = pl['thread_source'] === 'subagent'
      const sessionId = typeof pl['id'] === 'string' ? pl['id'] : null
      const spawnParent = (
        ((pl['source'] as Record<string, unknown> | undefined)?.['subagent'] as
          | Record<string, unknown>
          | undefined)?.['thread_spawn'] as Record<string, unknown> | undefined
      )?.['parent_thread_id']
      const forked = pl['forked_from_id']
      // 只认这两处(与 ccusage replay.rs 一致):payload.parent_thread_id 不算 fork 关系,
      // 它在同线程的续写会话里也出现,误当父会剥掉本会话自己的用量。
      const parentId =
        typeof forked === 'string' && forked !== ''
          ? forked
          : typeof spawnParent === 'string' && spawnParent !== ''
            ? spawnParent
            : null
      const topTs = (parsed as Record<string, unknown>)['timestamp']
      const forkedAt = typeof topTs === 'string' ? Date.parse(topTs) : NaN
      return {
        file,
        cwd,
        subagent,
        mtimeMs: statSync(file).mtimeMs,
        sessionId,
        parentId,
        forkedAt: Number.isNaN(forkedAt) ? null : forkedAt
      }
    }
  } catch {
    return null
  }
}

export function readCodexRegistry(codexHome: string): RegistryResult {
  if (!existsSync(codexHome)) return { detected: false, paths: [] }
  const configFile = join(codexHome, 'config.toml')
  if (!existsSync(configFile)) return { detected: true, paths: [] }
  try {
    const paths: string[] = []
    for (const line of readFileSync(configFile, 'utf8').split('\n')) {
      const m = PROJECT_HEADER.exec(line)
      if (m) paths.push(m[1])
    }
    return { detected: true, paths }
  } catch (err) {
    return { detected: true, paths: [], error: `注册表解析失败:${String(err)}` }
  }
}
