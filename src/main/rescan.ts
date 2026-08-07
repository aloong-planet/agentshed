// token-stats 序列 E:快照自动保鲜的纯函数层。
// 触发接线(定时器/聚焦事件)在 index.ts 装配层;此处只承载可单测的判定。

/** 聚焦触发的节流判定(E1):从未扫过必扫;距上次成功扫描达到节流窗才再扫 */
export function shouldRescanOnFocus(
  nowMs: number,
  lastScanMs: number | null,
  throttleMs: number
): boolean {
  if (lastScanMs === null) return true
  return nowMs - lastScanMs >= throttleMs
}

/** 时间参数注入解析(E5):合法正数取注入值,否则回落默认——坏输入不得让保鲜停摆 */
export function rescanIntervalMs(env: string | undefined, fallbackMs: number): number {
  const n = Number(env)
  return Number.isFinite(n) && n > 0 ? n : fallbackMs
}
