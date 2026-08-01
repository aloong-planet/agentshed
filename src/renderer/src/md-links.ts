// 渲染出的 markdown 链接的归宿判定。
// 背景(2026-08-02 bug):相对链接未被拦截时,点击会让**整窗导航**——dev 下 vite
// 回落 index.html 表现为"退回主页",打包版留白屏;两者都丢掉全部 app state。
// 故渲染出的链接一律不放行默认行为,由此函数裁决归宿;白名单(详情列出过的文件)
// 是 internal 的唯一放行依据,与产物读取通道同一不变量。
export type MdLinkTarget =
  | { kind: 'internal'; file: string }
  | { kind: 'external'; url: string }
  | { kind: 'anchor' }
  | { kind: 'unresolved'; reason: string }

/** 无 node:path 的最小归一:处理 . 与 ..,不解析软链(白名单本就按真实路径登记) */
function resolveRelative(dir: string, rel: string): string {
  const parts = dir.split('/').filter(Boolean)
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return `/${parts.join('/')}`
}

/**
 * @param href 链接原始值
 * @param baseDir 当前文档所在目录(绝对路径)
 * @param readable 可读文件白名单(详情/快照列出过的绝对路径)
 */
export function resolveMdLink(href: string, baseDir: string, readable: string[]): MdLinkTarget {
  if (href.startsWith('#')) return { kind: 'anchor' }
  if (/^https?:\/\//i.test(href)) return { kind: 'external', url: href }
  // 其余带协议的一律拒绝(javascript:/file:/data: 等);消毒层已挡一部分,这里是第二道
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'unresolved', reason: '不支持的链接协议' }
  const path = href.split('#')[0]
  if (path === '') return { kind: 'anchor' }
  const abs = resolveRelative(baseDir, path)
  if (!readable.includes(abs)) return { kind: 'unresolved', reason: '目标不在可读范围' }
  return { kind: 'internal', file: abs }
}

/** 文件所在目录(同上,不依赖 node:path) */
export function dirOf(file: string): string {
  const i = file.lastIndexOf('/')
  return i <= 0 ? '/' : file.slice(0, i)
}

/**
 * 渲染出的 markdown 容器上的点击处理:internal/unresolved 拦下自行处理;
 * external 与 anchor **故意放行**——external 由主进程 will-navigate 守卫接管
 * (拦截并交系统浏览器),anchor 走浏览器默认滚动,都不是导航逃逸。
 */
export function handleMdClick(
  e: { target: EventTarget | null; preventDefault: () => void },
  ctx: { baseDir: string; readable: string[] },
  on: { internal: (file: string) => void; unresolved: (reason: string) => void }
): void {
  const el = (e.target as HTMLElement | null)?.closest?.('a[href]')
  const href = el?.getAttribute('href')
  if (!href) return
  const t = resolveMdLink(href, ctx.baseDir, ctx.readable)
  if (t.kind === 'internal') {
    e.preventDefault()
    on.internal(t.file)
  } else if (t.kind === 'unresolved') {
    e.preventDefault()
    on.unresolved(t.reason)
  }
}
