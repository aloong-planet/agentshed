// 偏好回填的合并规则(issue #61)。
//
// mount 时发出的 `getPrefs()` 读的是**那一刻**的磁盘状态。若用户在它 resolve 之前就
// 改了某项偏好,无条件回填会把新选择顶回旧值——控件显示与实际生效值就此不一致,
// 且不会自愈。抽成纯函数是为了让这条规则可测:React 组件本身按 ADR-0002 不单测。
import type { Prefs } from '@shared/prefs'

/** 偏好字段名。用 keyof 派生而不是另写一份字面量:Prefs 加字段时这里自动跟上 */
export type PrefKey = keyof Prefs

/**
 * 未被用户亲手改过的字段才采用回声。
 *
 * **逐字段判断,不是一个总开关**:用户只改了模式时,回声里的配色与语言仍然是准的,
 * 整份跳过会让那两项停在默认值。
 *
 * 与"无守卫"相比,粗粒度写法的**触发条件完全相同**(都要用户抢在回声之前点),
 * 差别只在波及面:无守卫是被顶掉 1 项(用户刚点的那项),粗粒度是丢掉 2 项
 * (没碰过的那两项停在默认值,整个 app 会以默认配色渲染)。救回一项、赔上两项,
 * 所以它不是"另一种权衡",是严格更差。
 *
 * 三个字段逐一写出而不是遍历 key:Prefs 将来加字段时,这里会因缺属性而 typecheck 失败,
 * 而遍历写法会静默漏掉新字段。
 */
export function backfillPrefs(
  local: Prefs,
  incoming: Prefs,
  touched: ReadonlySet<PrefKey>
): Prefs {
  return {
    scheme: touched.has('scheme') ? local.scheme : incoming.scheme,
    language: touched.has('language') ? local.language : incoming.language,
    mode: touched.has('mode') ? local.mode : incoming.mode
  }
}
