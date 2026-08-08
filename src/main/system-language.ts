// 系统偏好语言的读取口。
//
// 用 app.getPreferredSystemLanguages():它返回**按优先级排序的语言列表**。
// 不用 getLocale() / getSystemLocale()——Electron 的类型定义中这两者都明确指出
// 取用户语言应使用前者;后两者描述的是区域格式(数字/日期/货币),与语言不是一回事。
//
// AGENTSHED_SYSTEM_LANGUAGES:测试专用注入口(逗号分隔),同 AGENTSHED_HOME_OVERRIDE
// 的用法——「跟随系统」的行为依赖系统语言,而系统语言在测试里改不了,没有这个口子
// 就只能靠人反复改系统设置来验证。生产不设此变量。
import { app } from 'electron'

export function systemPreferredLanguages(): string[] {
  const override = process.env['AGENTSHED_SYSTEM_LANGUAGES']
  if (override !== undefined) {
    return override
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  try {
    return app.getPreferredSystemLanguages()
  } catch {
    // 平台探测失败不该拖垮启动:交给解析层回退英文
    return []
  }
}
