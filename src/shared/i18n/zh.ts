// 源语言(简体中文)——界面文案的唯一真相。
//
// 这份对象用 `as const` 定义,于是它的**结构**(key 集合、值是字符串还是函数、
// 函数签名、嵌套层次)成为其余五语必须对齐的契约,见 ./types.ts 的 Dict 映射。
// 新增文案先落这里,其余五语不补齐则 typecheck 失败——不存在「暂时留空」。
export const zh = {
  /** 该语言的母语书写,用于语言选择器;与界面当前语言无关,恒为该语言自身的写法 */
  languageName: '简体中文',
  /** 该语言的英文名,作为选择器的次要线索:母语文字不认识时仍有第二条路 */
  languageNameEn: 'Chinese (Simplified)',
  /** html lang 属性值,同时用作 Intl 的 locale tag */
  htmlLang: 'zh-CN',

  /** 侧边栏悬停提示 */
  rail: {
    agents: 'Agents',
    projects: 'Projects',
    refresh: '全局刷新',
    settings: '设置'
  },

  settings: {
    title: '设置',
    lead: '本 app 偏好,对整个界面生效。不写入 Claude / Codex 配置。',
    sectionLanguage: '语言',
    interfaceLanguage: '界面语言',
    followSystem: '跟随系统',
    languageFoot: '选择「跟随系统」时,界面语言随 macOS 的偏好语言变化;偏好语言均不在支持范围内时使用英文。',
    sectionAppearance: '外观',
    badgeDefault: '默认',
    appearanceFoot: '浅色 / 深色跟随 macOS 系统外观。切换方案后立即对整个 app 生效,无需保存。',
    schemePurple: '紫',
    schemeBlue: '雾蓝',
    schemeAmber: '琥珀褐',
    schemePurpleDesc: '现网品牌紫。安装后的默认外观,与历史版本一致。',
    schemeBlueDesc: '暖灰纸底 + 冷静蓝强调,适合长时间阅读。',
    schemeAmberDesc: '暖纸底 + 褐强调,更接近纸书质感。'
  },

  toast: {
    /** 切到某个具体语言 */
    languageSwitched: (name: string) => `界面语言已切换为 ${name}`,
    /** 切到「跟随系统」——必须说明当前解析成了哪种语言,否则用户看不出实际效果 */
    languageFollowSystem: (name: string) => `已设为跟随系统 · 当前为 ${name}`
  }
} as const
