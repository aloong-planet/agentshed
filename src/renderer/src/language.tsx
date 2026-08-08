// 渲染层的当前生效语言。
//
// 为什么是 context 而不是模块级变量:spec 要求「切换语言时正在显示的错误提示按新语言
// 重新渲染」——那意味着错误必须以**码 + 参数**持有、在渲染时才成句,而成句要拿到的语言
// 得是**响应式**的。模块级变量改了不会触发重渲染,做不到这条。
//
// 为什么不逐层 prop 传:错误渲染点散在会话页、插件列表、skill 展开块里,
// 把语言从 App 一路穿过 ProjectsPane / DetailPane 只为了给最底层用,
// 会让沿途每个组件都多一个与自己无关的参数。
import { createContext, useContext, type JSX, type ReactNode } from 'react'
import { FALLBACK_LANGUAGE, dictOf, type Language, type Locale } from '@shared/i18n'

const LanguageContext = createContext<Language>(FALLBACK_LANGUAGE)

export function LanguageProvider({
  lang,
  children
}: {
  lang: Language
  children: ReactNode
}): JSX.Element {
  return <LanguageContext.Provider value={lang}>{children}</LanguageContext.Provider>
}

/** 当前生效语言 */
export function useLanguage(): Language {
  return useContext(LanguageContext)
}

/** 当前语言的字典(取文案的常用入口) */
export function useDict(): Locale {
  return dictOf(useContext(LanguageContext))
}
