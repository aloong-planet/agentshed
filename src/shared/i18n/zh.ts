// 源语言(简体中文)——界面文案的唯一真相。
//
// 这份对象用 `as const` 定义,于是它的**结构**(key 集合、值是字符串还是函数、
// 函数签名)成为其余五语必须对齐的契约,见 ./types.ts 的 Dict 映射。
// 新增文案先落这里,其余五语不补齐则 typecheck 失败——不存在「暂时留空」。
export const zh = {
  /** 该语言的母语书写,用于语言选择器;与界面当前语言无关,恒为该语言自身的写法 */
  languageName: '简体中文',
  /** 该语言的英文名,作为选择器的次要线索:母语文字不认识时仍有第二条路 */
  languageNameEn: 'Chinese (Simplified)',
  /** html lang 属性值 */
  htmlLang: 'zh-CN'
} as const
