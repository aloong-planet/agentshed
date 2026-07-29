// 项目路径的规范化与合并键:唯一出处(scan/hidden-store/token 引擎共用)。
// 合并键 = 去尾斜杠 + 小写(macOS 文件系统大小写不敏感);展示保留原始写法。

export function normalizePath(p: string): string {
  const stripped = p.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

export function mergeKey(p: string): string {
  return normalizePath(p).toLowerCase()
}
