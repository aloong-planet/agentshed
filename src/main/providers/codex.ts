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
}

/**
 * 递归遍历 codexHome/sessions 下全部 .jsonl,读每个文件首行取 cwd 归属。
 * 首行损坏/缺 cwd 的文件跳过(不弃整个扫描)。
 */
export function readCodexSessions(codexHome: string): CodexSessionMeta[] {
  const root = join(codexHome, 'sessions')
  if (!existsSync(root)) return []
  const out: CodexSessionMeta[] = []
  walk(root, out)
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

function readHead(file: string): CodexSessionMeta | null {
  try {
    const fd = openSync(file, 'r')
    try {
      const buf = Buffer.alloc(8192)
      const n = readSync(fd, buf, 0, buf.length, 0)
      const firstLine = buf.subarray(0, n).toString('utf8').split('\n', 1)[0]
      const parsed: unknown = JSON.parse(firstLine)
      if (typeof parsed !== 'object' || parsed === null) return null
      const payload = (parsed as Record<string, unknown>)['payload']
      if (typeof payload !== 'object' || payload === null) return null
      const cwd = (payload as Record<string, unknown>)['cwd']
      if (typeof cwd !== 'string' || cwd === '') return null
      const subagent = (payload as Record<string, unknown>)['thread_source'] === 'subagent'
      return { file, cwd, subagent, mtimeMs: statSync(file).mtimeMs }
    } finally {
      closeSync(fd)
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
