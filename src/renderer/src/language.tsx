// The renderer's currently effective language.
//
// Why context rather than a module-level variable: the spec requires that "an error notice on screen
// re-renders in the new language
// when the language is switched" — which means an error has to be held as **a code plus parameters** and
// composed at render time, and the language that composition reads
// has to be **reactive**. Changing a module-level variable triggers no re-render, so it cannot do this.
//
// Why not thread it down as a prop: the error render sites are scattered across the session page, the
// plugin list and the skill expansion blocks,
// and carrying the language from App through ProjectsPane and DetailPane just to reach the deepest level
// would give every component along the way one more parameter with no stake in it.
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

/** The currently effective language */
export function useLanguage(): Language {
  return useContext(LanguageContext)
}

/** The current language's dictionary (the usual entry point for reading copy) */
export function useDict(): Locale {
  return dictOf(useContext(LanguageContext))
}
