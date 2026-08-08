import type { Locale } from './types'

export const ru: Locale = {
  languageName: 'Русский',
  languageNameEn: 'Russian',
  htmlLang: 'ru',

  rail: {
    agents: 'Agents',
    projects: 'Проекты',
    refresh: 'Обновить всё',
    settings: 'Настройки'
  },

  settings: {
    title: 'Настройки',
    lead: 'Параметры только этого приложения. Они применяются ко всему интерфейсу и никогда не записываются в конфигурацию Claude или Codex.',
    sectionLanguage: 'Язык',
    interfaceLanguage: 'Язык интерфейса',
    followSystem: 'Следовать системе',
    languageFoot:
      'При выборе «Следовать системе» интерфейс следует предпочитаемым языкам macOS; если ни один из них не поддерживается, используется английский.',
    sectionAppearance: 'Оформление',
    badgeDefault: 'По умолчанию',
    appearanceFoot:
      'Светлый / тёмный режим следует системному оформлению macOS. Смена схемы применяется сразу во всём приложении — сохранять не нужно.',
    schemePurple: 'Фиолетовая',
    schemeBlue: 'Туманно-синяя',
    schemeAmber: 'Янтарная',
    schemePurpleDesc:
      'Фирменный фиолетовый. Оформление по умолчанию после установки, как в прежних версиях.',
    schemeBlueDesc: 'Тёплый серый фон и спокойный синий акцент — удобно для долгого чтения.',
    schemeAmberDesc: 'Тёплый бумажный фон и коричневый акцент — ближе к ощущению печатной книги.'
  },

  toast: {
    languageSwitched: (name) => `Язык интерфейса переключён на ${name}`,
    languageFollowSystem: (name) => `Теперь следует системе · сейчас ${name}`
  }
}
