// Electron 宿主安全守卫(官方 Security Checklist 第 5/12/13/14/15 条)。
// 判定层是纯函数(可单测),接线层挂在 app.on('web-contents-created') 上——
// 覆盖**全部** webContents 而非只给主窗口挂,新开的任何 contents 自动受管。
//
// 官方清单的两个缺口,此处一并补:
//   - 第 13 条只提 will-navigate,而它**只管主框架**(web-contents.md 明载);
//     子框架要 will-frame-navigate,故两者都挂。
//   - 官方示例自己用了 startsWith 比较 URL,与它在第 13 条的告诫矛盾;
//     此处一律 new URL() 比 origin。
import { shell } from 'electron'
import type { WebContents } from 'electron'

/** 是否本 app 自身的地址(唯一放行导航的依据)。dev 传 ELECTRON_RENDERER_URL,prod 传 undefined */
export function isAppUrl(url: string, appBase: string | undefined): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false // 不可解析一律不放行
  }
  // prod:渲染页跑在 app://bundle(#18 起不再用 file://)。仍接受 file: 是为了
  // 覆盖 devtools/内部页等边缘载入,它们不承载本 app 的 IPC 面。
  if (appBase === undefined) return u.protocol === 'app:' || u.protocol === 'file:'
  try {
    return u.origin === new URL(appBase).origin // 比 origin,不用 startsWith
  } catch {
    return false
  }
}

/**
 * 交系统浏览器打开的目标(第 15 条)。**协议白名单**而非黑名单:
 * 只有 http/https 放行,file:/smb:/自定义 scheme 等一律拒绝——
 * 把未校验内容丢给 shell.openExternal 等于让文档内容驱动本机。
 */
export function externalOpenTarget(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
}

/** 给单个 webContents 挂全部守卫;由 app.on('web-contents-created') 调用 */
export function installNavigationGuards(contents: WebContents, appBase: string | undefined): void {
  // #13 导航:主框架 + 子框架都拦;非本 app 地址一律阻止,http(s) 转交系统浏览器
  const guard = (e: { preventDefault: () => void }, url: string): void => {
    if (isAppUrl(url, appBase)) return
    e.preventDefault()
    const ext = externalOpenTarget(url)
    if (ext) void shell.openExternal(ext)
  }
  contents.on('will-navigate', guard)
  // will-frame-navigate 的签名与 will-navigate 不同:单参数事件对象(url 在其上)
  contents.on('will-frame-navigate', (details) => guard(details, details.url))

  // #14 新窗口:一律 deny(deny 在所有分支之后无条件执行),白名单目标交系统浏览器
  contents.setWindowOpenHandler(({ url }) => {
    const ext = externalOpenTarget(url)
    if (ext) setImmediate(() => void shell.openExternal(ext))
    return { action: 'deny' }
  })

  // #12 webview:本项目不用 webview,此处是预防性拦截——它可由 DOM 脚本创建,
  // 未来若被误引入,默认就是关掉 node 集成、剥掉 preload 并阻止附加
  contents.on('will-attach-webview', (e, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    void params
    e.preventDefault()
  })
}

/**
 * #17 IPC sender 校验:handler 里必须确认调用方是本 app 自身的页面。
 * 与导航守卫是**两道独立防线**——守卫万一被绕(新事件类型、未来新窗口),
 * 被导航走的 renderer 仍持有 IPC 通道,这层挡住它。
 * 校验用与导航同一个 isAppUrl 判据(单一出处,不会两处口径漂移)。
 */
export function assertTrustedSender(
  senderUrl: string | undefined,
  appBase: string | undefined
): void {
  if (senderUrl === undefined || !isAppUrl(senderUrl, appBase)) {
    throw new Error(`IPC 调用方不可信:${senderUrl ?? '(无 sender)'}`)
  }
}

/**
 * #7 CSP。本应用渲染他人写的 markdown,CSP 是消毒之外的第二道:
 * 消毒剥 script,CSP 兜住"漏网的执行"与"外联请求"(如 <img src="http://tracker">
 * 会真的发出去,是隐私泄漏)。
 *
 * 两套策略:prod 严格;dev 必须放宽——vite HMR 用 inline script 与 ws 连接,
 * 严格策略下开发环境直接跑不起来(放宽仅限 dev,打包产物不受影响)。
 */
export function cspFor(isDev: boolean): string {
  const base = [
    "default-src 'self'",
    "img-src 'self' data:", // 本地图片与内联 data:;**不含 http(s)** → 外部追踪图被拦
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'", // 不允许任何 iframe(连带消除子框架导航面)
    "base-uri 'none'",
    "form-action 'none'"
  ]
  if (isDev) {
    // vite:inline script + eval(HMR)+ ws 连接 + 注入的 style
    return [
      ...base,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: http://localhost:*"
    ].join('; ')
  }
  return [...base, "script-src 'self'", "style-src 'self' 'unsafe-inline'", "connect-src 'self'"].join(
    '; '
  )
}

/** 把 CSP 注入到该 session 的所有响应头上(比 <meta> 可靠:meta 对部分指令无效) */
export function installCsp(
  ses: {
    webRequest: {
      onHeadersReceived: (
        cb: (
          d: { responseHeaders?: Record<string, string[]> },
          done: (r: { responseHeaders: Record<string, string[]> }) => void
        ) => void
      ) => void
    }
  },
  isDev: boolean
): void {
  const csp = cspFor(isDev)
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...(details.responseHeaders ?? {}), 'Content-Security-Policy': [csp] }
    })
  })
}

/** #5 权限:只读本地应用不需要任何权限,请求与查询全 deny */
export function installPermissionGuards(session: {
  setPermissionRequestHandler: (h: (wc: unknown, p: string, cb: (ok: boolean) => void) => void) => void
  setPermissionCheckHandler: (h: () => boolean) => void
}): void {
  session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
}

/**
 * 会话文件读取白名单判定(票 04,区间读通路的入口守卫)。
 *
 * 白名单是主进程扫描时自己产出的**精确路径 Set**(与 artifactWhitelist 同模式),
 * 不是前缀规则:精确匹配下路径穿越在结构上不可能——同一字符串只能打开同一文件,
 * `..`/编码/归一化变体全都因"字符串不相等"被拒,失败方向 fail-closed
 * (最坏是把同一文件的另一种写法拒之门外,绝不会把别的文件放进来)。
 * 放行时原样返回成员字符串,调用方持它读文件,不再有第二次解释。
 */
export function sessionReadTarget(
  whitelist: ReadonlySet<string>,
  raw: unknown
): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  return whitelist.has(raw) ? raw : null
}
