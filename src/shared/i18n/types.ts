// 字典的类型契约:由源语言(zh)的形状派生出其余五语必须满足的类型。
//
// 要同时做到两件互相拉扯的事:
//   ① **放宽值**——源语言用 `as const` 后 `languageName` 的类型是字面量 `'简体中文'`,
//      若直接用 `typeof zh` 标注英文字典,`'English'` 会因不匹配该字面量而报错。
//   ② **不放宽结构**——key 集合必须与源语言完全一致,少一条要红,多一条也要红。
//
// Dict 逐个属性重写:函数保签名、嵌套对象递归、其余一律放宽成 string。
// 函数分支必须排在对象分支**之前**——函数在类型系统里也满足 `extends object`,
// 顺序颠倒会把带参文案错误地当成嵌套字典递归下去。
//
// `-readonly` 去掉 `as const` 带来的只读修饰:各语言模块是独立声明的普通对象,
// 不必强制只读;保留它只会让实现方被迫也写 as const,徒增噪音。
export type Dict<T> = {
  -readonly [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends object
      ? Dict<T[K]>
      : string
}

/** 其余五语的类型:结构锁死为源语言,值放宽。少一条 key 与多一条 key 都会 typecheck 失败 */
export type Locale = Dict<typeof import('./zh').zh>
