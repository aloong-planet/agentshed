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
    languageFollowSystem: (name) => `Теперь следует системе · сейчас ${name}`,
    saveSchemeFailed: 'Не удалось сохранить палитру',
    saveModeFailed: 'Не удалось сохранить режим оформления',
    saveLanguageFailed: 'Не удалось сохранить язык'
  },

  errors: {
    badArgs: (channel, field) =>
      field
        ? `Недопустимые аргументы вызова: ${channel} (поле ${field})`
        : `Недопустимые аргументы вызова: ${channel}`,
    sessionNotWhitelisted:
      'Этой сессии нет в списке разрешённых — сначала откройте сведения о проекте или обновите',
    engineNotReady: 'Движок сканирования ещё не готов — повторите попытку чуть позже',
    turnOutOfRange: (i, total) => `Индекс хода вне диапазона: ${i} (всего ходов: ${total})`,
    artifactNotWhitelisted: 'Этого пути к продукту нет в списке разрешённых',
    pluginRootNotRegistered:
      'Корень этого плагина не зарегистрирован — сначала обновите или откройте сведения',
    projectNotOpened: 'Проект не открыт — сначала откройте сведения о нём',
    skillPackageUnavailable: 'Пакет skill недоступен или находится вне разрешённых корней',
    skillFileNotWhitelisted: 'Этого пути к файлу skill нет в списке разрешённых',
    skillFileUnreadable: 'Не удаётся прочитать файл skill',
    sessionNotIndexed: 'Эта сессия не проиндексирована — сначала выполните полное обновление',
    sessionFileUnreadable: 'Файл сессии больше не читается (перемещён или удалён?)',
    sessionMetaUnreadable:
      'Первая строка сессии не читается, поэтому индекс невозможно перестроить',
    sessionParseFailed: 'Не удалось разобрать файл сессии',
    prefsStoreNotReady: 'Хранилище настроек не готово',
    invalidPref: (field) => `Недопустимое значение настройки: ${field}`
  },

  subagentError: {
    unreadable: 'Не читается',
    parseFailed: 'Ошибка разбора'
  }
}
