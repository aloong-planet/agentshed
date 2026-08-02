// 自定义 app:// scheme(官方 Security Checklist #18:避免 file://)。
// 打包版渲染页跑在标准安全 origin(app://bundle)上,而不是 file:// 的 opaque origin:
//   - 安全:可读范围锁死在渲染产物目录;file:// 下一次注入就能读全盘
//   - 附带:origin 非 opaque,localStorage 走快路径(Transfer 项目 ADR-0007 的原始动机,
//     electron/electron#24441 —— file:// 下首访卡数秒)
//
// 移植自 Transfer 项目 src/main/app-protocol.ts,两处按本项目调整:host 名与产物根路径。
// 两步:模块顶层(app ready 前)registerSchemesAsPrivileged;ready 后 registerAppProtocol。
import { protocol, net } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** app:// 固定 host,承载打包后的渲染产物 */
export const APP_HOST = 'bundle'

/**
 * app://bundle/<path> → 磁盘绝对路径,并防目录穿越。
 * 返回 null = 非法(host 不对 / 越权 / URL 解析失败)→ 上层回 404。纯函数,可单测。
 */
export function resolveAppPath(rendererRoot: string, url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname !== APP_HOST) return null
  // decode(容中文/空格路径)+ URL.pathname 天然不含查询串/锚点;去前导 /;空路径回落 index.html
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  if (p === '') p = 'index.html'
  const abs = normalize(join(rendererRoot, p))
  // 穿越防护:normalize 后必须仍落在 rendererRoot 之内
  const rootNorm = normalize(rendererRoot)
  const rootPrefix = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep
  if (abs !== rootNorm && !abs.startsWith(rootPrefix)) return null
  return abs
}

/**
 * app ready 后调用一次。读盘交给 net.fetch(file://):Electron 自动补 Content-Type、
 * 处理不存在→404、支持 Range,免维护 MIME 表。
 */
export function registerAppProtocol(rendererRoot: string): void {
  protocol.handle('app', async (req) => {
    const abs = resolveAppPath(rendererRoot, req.url)
    if (!abs) return new Response('Not found', { status: 404 })
    try {
      // await 让 net.fetch 的 reject 落进本 catch:某些输入(如路径含 \0)会 reject
      // 而非返 404,直接 return promise 会漏成 unhandled rejection / errored request
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
