import type { Locale } from './types'
import { plural } from './index'

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

  skillDeepHint: 'По рекомендациям глубина ссылок skill должна быть меньше 2 — стоит переработать этот skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  /** 随语言变化的展示名(其余如 Anthropic / Claude 是专有名词,不译) */
  detail: {
    notInSnapshot: 'Этого проекта нет в снимке (обновите и попробуйте снова)',
    staleTag: 'Устарел',
    tabOverview: 'Обзор',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'Сессии',
    tabCfg: 'Конфигурация',
    tabArts: 'Продукты',
    loading: 'Загрузка…',
    byModel: 'По моделям',
    recentSessions: 'Недавние сессии',
    noSessions: 'В этом проекте пока нет сессий',
    sessionCountNote: (n) => `Всего сессий: ${n} — все они во вкладке «Сессии».`,
    noSessionsHint: 'В этом проекте пока нет сессий. Они появятся сами, как только один из агентов проведёт диалог в этом каталоге.',
    searching: 'Поиск…',
    noHits: 'Совпадений нет. По умолчанию ищутся только вопросы — попробуйте «Полный текст».',
    hitsFound: (hits, sessions) => `Найдено: ${hits} · сессий: ${sessions}`,
    folded: (n) => ` · свёрнуто совпадений: ${n} (повторы или заброшенные ветки)`,
    recentFirst: 'Сначала новые',
    oldestFirst: 'Сначала старые',
    forkUncertain: '⑂? отсечение под вопросом',
    hitCount: (n) => `совпадений: ${n}`,
    inBody: 'Тело',
    sortNote: (order, n) => `По последней активности, ${order} · сессий: ${n}`,
    descending: 'по убыванию',
    ascending: 'по возрастанию',
    forkTip: 'Эта сессия ответвлена от другой; повторённый префикс уже отсечён',
    forkUncertainTip: 'Родительская сессия вне набора сканирования или не проходит проверку, поэтому повторённый префикс отсечён лишь эвристически — часть могла остаться (дубликаты)',
    questionCount: (n) => `вопросов: ${n}`,
    sessionsFoot: 'Перечислены только сессии зарегистрированных проектов; сессии subagent и прогрева отдельно не перечисляются, но их токены учитываются — поэтому это число и знаменатель карточек токенов выше не одно и то же.',
    sessionsFoot2: '«Последняя активность» берёт наибольшую метку времени внутри файла — это другой канал, нежели активность в списке проектов (там используется mtime файла).',
    searchPlaceholder: (n) => `Искать среди ${n} сессий этого проекта…`,
    scopeQuestions: 'Вопросы',
    scopeFullText: 'Полный текст',
    levelPlugin: 'Пакет плагина',
    levelProject: 'Уровень проекта',
    levelGlobal: 'Глобальный уровень',
    uninstall: 'Удалить',
    uninstalled: (name) => `${name} удалён (обновлён только этот проект)`,
    uninstallFailed: (detail) => `Не удалось удалить: ${detail}`,
    secClaudeProject: 'Уровень проекта · .claude/skills',
    secClaudeGlobal: 'Глобальный уровень · Claude',
    secCodexProject: 'Уровень проекта · .agents/skills',
    secCodexGlobal: 'Глобальный уровень · Codex',
    secPlugin: 'Из плагинов · фактически включены здесь (с пространством имён, только чтение)',
    noSkills: 'Для этого проекта нет действующих skills',
    confirmTitle: 'Удалить skill уровня проекта?',
    confirmBody: 'Будет удалён следующий каталог (за состояние git проекта отвечаете вы; сверка различий копий не выполняется):',
    cancel: 'Отмена',
    del: 'Удалить',
    mcpTitle: 'Уровень проекта · .mcp.json (enabled/disabled берётся из настроек проекта)',
    noMcp: 'В проекте нет .mcp.json; глобальный MCP см. на странице Agents',
    mcpEnabled: 'Включено',
    mcpDisabled: 'Отключено',
    mcpDefault: 'По умолчанию',
    filterAll: 'Все',
    noArtifacts: 'По соглашению ничего не отложено (проект не по восьмишаговому процессу; это не ошибка)',
    noArtifactsOfType: 'Продуктов этого типа нет',
    openInBrowser: 'HTML → браузер',
    settingsSummary: 'сводка settings',
    noSettings: 'Под ключом проекта нет отображаемых настроек',
    fileMissing: 'Файл не существует'
  },
  projects: {
    searchPlaceholder: 'Поиск проектов…',
    filterAll: 'Все',
    showStale: 'Показывать устаревшие проекты',
    staleFiltered: (n) =>
      `Отфильтровано ${n} ${plural('ru', n, { one: 'устаревший проект', few: 'устаревших проекта', many: 'устаревших проектов', other: 'устаревших проекта' })}`,
    noMatch: 'Нет подходящих проектов',
    hiddenCount: (n) =>
      `${n} ${plural('ru', n, { one: 'скрытый проект', few: 'скрытых проекта', many: 'скрытых проектов', other: 'скрытых проекта' })}`,
    expandHint: '(нажмите, чтобы развернуть)',
    collapseHint: '(нажмите, чтобы свернуть)',
    staleTag: 'Устарел',
    restore: 'Восстановить',
    hide: 'Скрыть'
  },
  token: {
    totalCard: (note) => `Всего (обе стороны${note ? ` · ${note}` : ''})`,
    inOut: 'Ввод / Вывод',
    inOutNote: 'По каждой стороне в её собственных единицах учёта',
    cacheCard: 'Из них кэш (уже учтён в итоге, по методике ccusage)',
    cacheReadWrite: (read, write) => `Чтение ${read} · Запись ${write}`,
    trendTitle: 'Последние 30 дней (местный часовой пояс · по дням)',
    legendNote: 'Высота столбца — итог за день; сегменты — доли провайдеров',
    tipTotal: (label, total) => `${label} · итого ${total}`,
    tipArchived: ' · из архива (исходные файлы уже удалены)',
    tipNoUsage: 'Нет расхода',
    noModelData: 'Пока нет данных по моделям'
  },
  label: {
    providerOther: 'Прочие',
    trendTotal: 'Итого'
  },

  placeholder: {
    unreadableLine: '(эту строку больше не прочитать)',
    untitledSession: '(сессия без названия)',
    unknownTool: '(неизвестный инструмент)',
    unknown: '(неизвестно)',
    notSet: 'Не задано',
    codexGlobalMemory: '(глобальная память Codex)',
    truncated: '…(обрезано)'
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
    invalidPref: (field) => `Недопустимое значение настройки: ${field}`,
    contractMissing: (path) => `Получена некорректная полезная нагрузка: отсутствует ${path}`,
    contractType: (path, expect) => `Получена некорректная полезная нагрузка: ${path} должен быть ${expect}`,
    contractEnum: (path, value) =>
      `Получена некорректная полезная нагрузка: значение ${value} в ${path} вне допустимого диапазона`,
    untrustedSender: (sender) => `Недоверенный вызывающий IPC: ${sender}`,
    linkProtocolUnsupported: 'Неподдерживаемый протокол ссылки',
    linkOutOfScope: 'Цель ссылки вне читаемой области',
    skillBadName: 'Недопустимое имя skill',
    skillStaleTarget: 'Цель — устаревший проект (его каталог больше не существует)',
    skillMissingSource: (name) => `В глобальной библиотеке нет такого skill: ${name}`,
    skillCopyMissing: 'Копия уровня проекта не существует',
    skillConflict: 'В цели уже есть skill с таким именем на уровне проекта — ничего не перезаписано',
    skillCopyFailed: (detail) => `Копирование не удалось, выполнена очистка: ${detail}`,
    skillDeleteFailed: (detail) => `Не удалось удалить: ${detail}`,
    registryProjectsInvalid: 'Ключ projects в реестре отсутствует или не является объектом',
    registryParseFailed: (detail) => `Не удалось разобрать реестр: ${detail}`,
    subagentUnreadable: 'Файл не читается (права доступа или ошибка ввода-вывода)',
    subagentTomlFailed: (detail) => `Не удалось разобрать toml: ${detail}`,
    subagentMissingName: 'Нет корректного поля name (Codex не загрузит этот файл)'
  },

  subagentError: {
    unreadable: 'Не читается',
    parseFailed: 'Ошибка разбора',
    detail: (msg) => `${msg}. Остальные записи не затронуты.`
  }
}
