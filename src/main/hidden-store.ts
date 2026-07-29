// 手动隐藏的持久化:app 自有存储(userData 下 hidden.json),绝不写 agent 配置。
// 原子写:临时文件 + rename,中断不产半截文件。路径按合并键(去尾斜杠+小写)匹配。
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mergeKey } from '@shared/path-key'

export class HiddenStore {
  private readonly file: string
  private readonly dir: string
  private keys: Set<string>

  constructor(storeDir: string) {
    this.dir = storeDir
    this.file = join(storeDir, 'hidden.json')
    this.keys = this.load()
  }

  private load(): Set<string> {
    if (!existsSync(this.file)) return new Set()
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (Array.isArray(raw)) return new Set(raw.filter((v): v is string => typeof v === 'string'))
      return new Set()
    } catch {
      // 存储损坏:降级为空集(隐藏偏好可重建,不值得让 app 崩)
      return new Set()
    }
  }

  isHidden(projectPath: string): boolean {
    return this.keys.has(mergeKey(projectPath))
  }

  setHidden(projectPath: string, hidden: boolean): void {
    const key = mergeKey(projectPath)
    if (hidden) this.keys.add(key)
    else this.keys.delete(key)
    this.persist()
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.hidden.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify([...this.keys], null, 2))
    renameSync(tmp, this.file)
  }
}
