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
    mode: 'Режим',
    modeLight: 'Светлый',
    modeDark: 'Тёмный',
    palette: 'Палитра',
    appearanceFoot:
      'Когда режим — «Следовать системе», светлое и тёмное оформление следует настройкам macOS; выбор светлого или тёмного фиксирует приложение, и последующие изменения системы на него не влияют. Палитра и режим независимы и сочетаются свободно; без выбора используется фиолетовая. Изменения применяются сразу во всём приложении — сохранять не нужно.',
    schemePurple: 'Фиолетовая',
    schemeBlue: 'Туманно-синяя',
    schemeAmber: 'Янтарная'
  },

  toast: {
    languageSwitched: (name) => `Язык интерфейса переключён на ${name}`,
    languageFollowSystem: (name) => `Теперь следует системе · сейчас ${name}`
  }
}
