// 会话标题:从人类消息里剥掉 harness 噪声,取第一条真实提问(seam 1 纯函数)。
//
// **噪声形态取自真实采样,不是照清单想象**(2026-08-02,297 个真实 Claude 会话):
//   Warmup 188 · [cron:…] 92 · local-command-* 20 · slash 命令 2。
// 其中 `<local-command-stdout>` 是剥掉前面几层之后才浮出来的第二层噪声——
// 只采样"首条消息"看不到它,必须拿真函数扫一遍剥离后的结果才发现。
// 调研期 spec 列过的「Conversation info」在采样里**未出现**,不为没见过的形态写
// 规则——写了也无法用真实样本验证,只是把想象固化成代码。
//
// 两处容易想错的地方,都由真实数据纠正:
//   - `[cron:…]` 后面跟的是**真正的指令**,整条丢会丢掉真提问,只能剥方括号;
//   - slash 命令的用户输入在 `<command-args>` 里,不在标签外。

/** 标题上限(按码点算,中文不被截半) */
export const TITLE_MAX = 60

const CARGS = /<command-args>([\s\S]*?)<\/command-args>/
const CRON = /^\[cron:[^\]]*\]\s*/

function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * 一条人类消息 → 其中的真实提问;整条都是噪声时返回 null。
 * 调用方据 null 判断"这条不算提问"(既影响标题,也影响会话是否入列)。
 */
export function realUserText(raw: string): string | null {
  const t = normalize(raw)
  if (!t) return null

  // 预热会话:整条消息就是这一个词。只在**完全相等**时算噪声——
  // 真提问里出现这个词(如"Warmup 这个词是哪来的?")不能被误伤。
  if (t === 'Warmup') return null

  // `<local-command-*>` 是 harness 包裹输入框 `!` 命令执行留下的痕迹,整族都不是人写的:
  // 实测见到 caveat(13/297,命令执行前的免责声明)与 stdout(7/144,命令输出)两种,
  // 按族匹配而非逐个枚举——同一机制产出的兄弟标签将来还会有。
  if (t.startsWith('<local-command-')) return null
  // slash 命令触发的 skill 正文注入,以 user 身份出现但不是人写的
  if (t.startsWith('Base directory for this skill:')) return null

  // slash 命令:真实输入只在 command-args 里;没有该标签或内容为空 → 只是命令调用
  if (t.includes('<command-name>')) {
    const inner = CARGS.exec(t)?.[1]
    const v = inner === undefined ? '' : normalize(inner)
    return v || null
  }

  // cron:方括号是 harness 加的前缀,后面才是用户写的指令
  if (CRON.test(t)) {
    const rest = normalize(t.replace(CRON, ''))
    return rest || null
  }

  return t
}

/**
 * 已剥噪声的提问 → 标题(按码点截断,中文不被截半)。
 *
 * 与 `realUserText` 分开是**必须**的,不是为了好看:剥离对同一段文本不是幂等的
 * ——`[cron:x] Warmup` 剥一次得 `Warmup`,再剥一次就变成 null。调用方拿到的若已是
 * 剥离后的文本,只能走这里,不能再过一遍 `realUserText`。
 */
export function clipTitle(t: string): string {
  const cp = [...t]
  return cp.length > TITLE_MAX ? `${cp.slice(0, TITLE_MAX).join('')}…` : t
}
