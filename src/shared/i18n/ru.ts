import type { Locale } from './types'
import { plural } from './plural'

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
    lead: 'Параметры только этого приложения. Они применяются ко всему интерфейсу и никогда не записываются в конфигурацию ни одной стороны агента.',
    sectionLanguage: 'Язык',
    interfaceLanguage: 'Язык интерфейса',
    followSystem: 'Следовать системе',
    languageFoot:
      'При выборе «Следовать системе» интерфейс следует предпочитаемым языкам macOS; если ни один из них не поддерживается, используется английский.',
    sectionAppearance: 'Оформление',
    mode: 'Режим',
    modeLight: 'Светлый',
    modeDark: 'Тёмный',
    palette: 'Тема',
    appearanceFoot:
      'Когда режим — «Следовать системе», светлое и тёмное оформление следует оформлению macOS; выбор светлого или тёмного закрепляет светлое/тёмное за этим выбором, и последующие изменения системы на него не влияют. Тема и режим независимы и сочетаются свободно; без выбора используется фиолетовая. Изменения применяются сразу во всём приложении — сохранять не нужно.',
    themePurple: 'Фиолетовая',
    themeBlue: 'Туманно-синяя',
    themeAmber: 'Янтарная'
  },

  menu: {
    about: 'О программе Agentshed', hide: 'Скрыть Agentshed', hideOthers: 'Скрыть остальные',
    unhide: 'Показать все', quit: 'Завершить Agentshed',
    edit: 'Правка', undo: 'Отменить', redo: 'Повторить', cut: 'Вырезать', copy: 'Копировать', paste: 'Вставить', selectAll: 'Выбрать все',
    view: 'Вид', reload: 'Перезагрузить', toggleDevTools: 'Инструменты разработчика', resetZoom: 'Фактический размер',
    zoomIn: 'Увеличить', zoomOut: 'Уменьшить', fullscreen: 'Перейти в полноэкранный режим',
    window: 'Окно', minimize: 'Свернуть', close: 'Закрыть'
  },

  toast: {
    languageSwitched: (name) => `Язык интерфейса переключён на ${name}`,
    languageFollowSystem: (name) => `Теперь следует системе · сейчас ${name}`,
    saveThemeFailed: 'Не удалось сохранить тему',
    saveModeFailed: 'Не удалось сохранить режим оформления',
    saveLanguageFailed: 'Не удалось сохранить язык'
  },

  skillDeepHint: 'По рекомендациям глубина ссылок skill должна быть меньше 2 — стоит переработать этот skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  agents: {
    sideSummary: (projects, skills, subagents) => `проектов: ${projects} · глобальных skills: ${skills} · subagents: ${subagents}`,
    tabCfg: 'Конфигурация',
    notDetected: 'На этой машине не обнаружен каталог данных ни одной стороны агента',
    notDetectedHint: (refreshLabel) =>
      `Установите и используйте любой из агентов, затем нажмите «${refreshLabel}» слева внизу, чтобы увидеть обзор`,
    archivedNote: (days, earliest) => `Для ${days} из этих дней (самый ранний ${earliest}) исходные файлы сессий уже удалены агентом автоматически; значения взяты из локального архива (штрихованные столбцы)`,
    byModel: 'По моделям (по всем проектам; на стороне Codex — приближение основной модели сессии)',
    detected: 'Обнаружено', undetected: 'Не обнаружено',
    emptyGlobalLib: 'Глобальные библиотеки всех сторон пусты',
    sideMismatch: (project) => `${project} не относится к той стороне агента, где находится этот skill`,
    installed: (skill, project, side) => `${skill} установлен → ${project} (${side}); обновлён только этот проект`,
    grokBorrowHint: 'Grok во время работы читает глобальные skills / subagents / plugins / MCP Claude Code; эти заимствованные компоненты принадлежат стороне Claude и не входят в списки Grok',
    skillsHint: 'Объединено в один список · нажмите строку, чтобы увидеть файлы пакета · файл — для предпросмотра · без diff между сторонами · плагины только для чтения',
    levelPluginPkg: 'Пакет плагина', levelGlobalLib: 'Глобальная библиотека',
    installTo: 'Установить в…',
    pickTarget: 'Выберите целевой проект (установка копированием; устаревшие проекты исключены)',
    srcGlobalConfig: 'глобальная конфигурация', srcPlugin: 'в составе плагина',
    globalMcp: 'Глобальный MCP',
    noGlobalMcp: 'Глобального MCP нет (файлы .mcp.json уровня проекта относятся к деталям проекта)',
    noMcpSection: 'В config.toml нет секции mcp_servers',
    cfgClaudeMd: 'Глобальный CLAUDE.md', cfgAgentsMd: 'Глобальный AGENTS.md', cfgToml: 'сводка config.toml',
    tomlMissing: 'config.toml не существует', fileMissing: 'Файл не существует'
  },

  shell: {
    pickProject: 'Выберите проект, чтобы увидеть детали',
    scanning: 'Сканирование сторон агентов…'
  },
  skills: {
    searchPlaceholder: 'Поиск skill…',
    noNameMatch: 'Нет skill с подходящим именем',
    listFailed: (detail) => `Не удалось перечислить: ${detail}`,
    pillPlugin: 'Плагин', pillProject: 'Проект', pillGlobal: 'Глобально', pillSymlink: 'симлинк',
    pkgSummary: (files, size) => `файлов: ${files} · ${size}`,
    srcPluginPkg: 'Пакет плагина', srcProject: 'Проект', srcGlobal: 'Глобальная библиотека',
    listing: 'Перечисление…',
    deeperPaths: (paths) => `Более глубокие пути не перечислены: ${paths}`,
    colFile: 'Файл', colLines: 'Строк', colSize: 'Размер', colMtime: 'Изменён',
    noPreviewable: 'В пакете нет текстовых файлов для предпросмотра',
    tagEntry: 'Вход', close: 'Закрыть', raw: 'Исходник', preview: 'Предпросмотр',
    loading: 'Загрузка…', emptyFile: 'Пустой файл',
    installMissing: 'Каталог установки отсутствует', pkgUnreadable: 'Пакет skill не читается'
  },

  subagents: {
    noneGlobal: 'Определений subagent нет ни с одной стороны (~/.claude/agents и ~/.codex/agents)',
    globalHint: 'Обе стороны в одном списке · одинаковые имена в одной строке (без diff содержимого) · нажмите для полного определения',
    noDescription: '(нет description)',
    noneProject: 'Определений subagent нет ни на уровне проекта, ни глобально',
    projectHint: 'Действующий вид · на обеих сторонах уровень проекта перекрывает глобальный · нажмите для полного определения',
    levelProject: 'Проект', levelGlobal: 'Глобально',
    overridesBuiltin: 'Замещает встроенное', shadows: 'Перекрывает одноимённое', shadowed: 'Перекрыто уровнем проекта',
    metaShadows: ' · перекрывает одноимённое определение нижнего уровня',
    metaShadowed: ' · перекрыто определением уровня проекта (не действует)',
    noSideDef: 'С этой стороны определения нет', inherited: '— (унаследовано)'
  },

  memory: {
    codexLegacy: 'Память Codex не включена; выше — оставшиеся файлы в каталоге.',
    codexEmpty: 'Память Codex включена, но пуста.',
    codexDisabled: 'Память Codex не включена — включите её командой /memories внутри Codex либо через «Настройки → Персонализация → Enable memories» (экспериментально).',
    noneGlobal: 'Ни в одном проекте нет автоматической памяти',
    globalHint: 'По времени изменения, сначала новые · включая устаревшие (со значком) · нажмите на строку, чтобы увидеть файлы, на файл — содержимое',
    stale: 'Устарел',
    codexGlobalDir: 'Каталог глобальной памяти', noMainFile: 'Нет MEMORY.md',
    noneProject: 'В этом проекте пока нет автоматической памяти',
    claudeOnly: 'Memory — механизм стороны Claude (память Codex глобальна, см. вкладку Memory на глобальной странице)',
    mainTitle: 'MEMORY.md (главный файл автоматической памяти)',
    noMain: 'Нет MEMORY.md (только файлы topic)',
    topicsTitle: (n) => `Файлы topic (${n}) · нажмите, чтобы открыть`,
    noTopics: 'Нет файлов topic',
    topicMeta: (ago) => `файл topic · ${ago}`,
    unreadable: (detail) => `Файл не читается: ${detail}`,
    loading: 'Загрузка…'
  },

  plugins: {
    projectMissing: '(проект устарел)',
    installMissing: 'Каталог установки отсутствует (кэш очищен) — видна только запись реестра, вложенные компоненты прочитать нельзя',
    noBundled: 'Ни одного из четырёх типов вложенных компонентов',
    codexCacheEnum: 'Перечисление кэша',
    cachedVersions: (n) => `(версий в кэше: ${n})`,
    cacheOnly: 'только перечисление кэша',
    codexFoot: 'В группе Codex перечислены только плагины, присутствующие в кэше; семантики включения нет, вложенные skills можно предпросмотреть, но они не попадают во вкладку Skills',
    codexFootDetail: '; плагины Codex действуют глобально, без семантики включения на уровне проекта',
    claudeGlobalHint: 'Основание включения: слой user · нажмите, чтобы раскрыть вложенные компоненты',
    noPlugins: 'Плагины не установлены',
    enabled: 'Включено', notEnabled: 'Не включено',
    claudeProjectHint: 'Основание включения: действующий набор этого проекта (local > project > user)',
    enabledShort: 'Включено', disabledShort: 'Отключено',
    noLayerMentions: 'Не упомянут ни в одном слое',
    verdictFrom: (verdict, layer) => `${verdict} — решение принято на ${layer}`,
    layerLocal: 'слое local', layerProject: 'слое project', layerUser: 'слое user'
  },
  session: {
    forkPoints: (n) =>
      `В этой сессии **${n} ${plural('ru', n, { one: 'точка ветвления', few: 'точки ветвления', many: 'точек ветвления', other: 'точки ветвления' })}**. Показанная цепочка построена от последнего сообщения к корню по родительским связям — то есть «как в итоге выглядит этот диалог»; заброшенные ветки не показаны.`,
    forkedFrom: 'Эта сессия ответвлена от',
    anotherSession: 'другой сессии',
    parentTitle: (title) => `«${title}»`,
    forkedFromTail: '— повторённый префикс отсечён, ниже показано только то, что идёт после ветвления. **Более раннюю историю смотрите в той сессии**.',
    stripUncertainOrphan:
      '**Отсечение префикса под вопросом**: эта сессия ответвлена от родителя **вне набора сканирования** (его файл удалён или он принадлежит незарегистрированному проекту), поэтому отсечение выполнено лишь эвристически — **могло отсечься лишнее (потеря сообщений) или недостаточно (дубликаты)**. Сверьтесь с оригиналом. Не ошибиться молча — единственная гарантия, которую здесь можно дать.',
    stripUncertainMismatch: (parent) =>
      `**Отсечение префикса под вопросом**: повторённый фрагмент не совпал построчно с родительской сессией «${parent}» (родительский журнал мог быть переписан), поэтому отсечена только **прошедшая проверку часть** — начало может дублировать родителя или отсутствовать. Сверьтесь с оригиналом.`,
    fetching: 'Получение…',
    rebuilding: 'Подпись индекса не совпала (файл дополнен или переписан) → перестраивается индекс **только этого файла**…',
    turnFailed: (detail) => `Этот ход не удалось получить: ${detail}`,
    fetchedNote: (ms, bytes) =>
      `Получено по требованию за ${ms} мс · прочитан только байтовый диапазон этого хода, ${bytes} — независимо от размера файла`,
    back: (project) => `Назад к ${project} · Сессии`,
    headMeta: (side, questions, tok, mb, ago) =>
      `${side} · вопросов: ${questions} · ${tok} tok · ${mb} · последняя активность ${ago}`,
    cannotOpen: (detail) => `Не удаётся открыть сессию: ${detail}`,
    loading: 'Загрузка…',
    mainline: (n, days) =>
      `Вопросы (основная ветка) · ${n} ${plural('ru', n, { one: 'вопрос', few: 'вопроса', many: 'вопросов', other: 'вопроса' })}${days}`,
    dayCount: (n) => ` · дней: ${n}`,
    expandAll: 'Развернуть всё',
    collapseAll: 'Свернуть всё',
    ascending: 'Сначала старые',
    descending: 'Сначала новые',
    dayGroup: (day, n) => `${day} · ${n} ${plural('ru', n, { one: 'вопрос', few: 'вопроса', many: 'вопросов', other: 'вопроса' })}`,
    foot: 'В основной ветке перечислены только вопросы человека; шум harness не отображается. Все вопросы перечисляются сразу (их текст читается по требованию по байтовому диапазону, независимо от размера файла). Нажмите на вопрос, чтобы развернуть весь ход на месте: тело, вызовы инструментов, передачи subagent и блоки рассуждений.'
  },

  turn: {
    typeSeparator: ', ',
    thinking: 'Размышление',
    thinkingSum: (chars) => `символов: ${chars} · открытый текст доступен`,
    reasoning: 'Рассуждение',
    reasoningSum: (n) => `только заголовки: ${n} · текст недоступен`,
    reasoningNote:
      'Тело рассуждений Codex — это `encrypted_content`, и его **никогда не получить**. Ниже только те открытые подзаголовки, что есть в записи, — они **не эквивалентны** открытому размышлению на стороне Claude, и мы не делаем вид, что это одно и то же.',
    input: 'Ввод',
    output: 'Результат',
    empty: '(пусто)',
    noOutput: '(результат не записан)',
    truncatedNote:
      'Результат превысил ограничение агента на одну запись, поэтому в транскрипте **сохранена только усечённая версия**; оригинал лежит рядом в `tool-results/` (путь выше), и продукт его не читает — здесь показана именно усечённая версия, без притязаний на полноту.',
    subSteps: (n) => `шагов: ${n} · без результата`,
    dispatchPrompt: 'Prompt передачи',
    innerSteps: 'Внутренние шаги',
    unlinkedNote:
      'У внутренних шагов этой передачи **нет устойчивой цепочки ссылок** в записи, которая позволила бы привязать их сюда (проверено с обеих сторон) — они не показаны, и никаких догадок о соответствии не делается; полная расшифровка лежит в отдельном файле, если он есть.',
    backToMain: 'Назад в основную сессию',
    noReturn: '(без результата)',
    unknownRecords: (count, types) =>
      `В этом ходе **нераспознанных записей: ${count}** (типы: ${types}) — сохранены как есть в исходном файле, не отображаются. Обычно это значит, что обновление агента добавило новый тип записи.`
  },
  detail: {
    notInSnapshot: 'Этого проекта нет в снимке (обновите и попробуйте снова)',
    staleTag: 'Устарел',
    tabOverview: 'Обзор',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'Сессии',
    tabCfg: 'Конфигурация',
    tabArts: 'Артефакты',
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
    forkUncertain: 'отсечение спорно',
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
    // `среди` governs the genitive, so this needs a different form set from the usual one: at n=1 it takes
    // the genitive singular, not the nominative that follows a bare numeral. Do not copy the forms from
    // another counted entry here.
    searchPlaceholder: (n) =>
      `Искать среди ${n} ${plural('ru', n, { one: 'сессии', few: 'сессий', many: 'сессий', other: 'сессий' })} этого проекта…`,
    scopeQuestions: 'Вопросы',
    scopeFullText: 'Полный текст',
    levelPlugin: 'Пакет плагина',
    levelProject: 'Уровень проекта',
    levelGlobal: 'Глобальный уровень',
    uninstall: 'Деинсталлировать',
    uninstalled: (name) => `${name} деинсталлирован (обновлён только этот проект)`,
    uninstallFailed: (detail) => `Не удалось деинсталлировать: ${detail}`,
    secClaudeProject: 'Уровень проекта · .claude/skills',
    secClaudeGlobal: 'Глобальный уровень · Claude',
    secCodexProject: 'Уровень проекта · .agents/skills',
    secCodexGlobal: 'Глобальный уровень · Codex',
    secPlugin: 'Из плагинов · фактически включены здесь (с пространством имён, только чтение)',
    noSkills: 'Для этого проекта нет действующих skills',
    confirmTitle: 'Деинсталлировать skill уровня проекта?',
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
    noArtifactsOfType: 'Артефактов этого типа нет',
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
    staleTag: 'Устарел',
  },
  token: {
    winAll: 'Всего · вся история',
    winToday: 'Сегодня',
    winD7: 'Последние 7 дней',
    winD30: 'Последние 30 дней',
    compCacheRead: 'Чтение из кэша',
    compUncached: 'Ввод мимо кэша',
    compOutput: 'Вывод',
    compTipCacheRead: (v) => `${v} — ввод, поданный из кэша и не пересчитанный заново`,
    compTipUncached: (v) => `${v} — включая запись в кэш: всё, что модель прочитала заново на этом шаге`,
    compTipOutput: (v) => `${v} — токены, сгенерированные моделью`,
    byModelIn: (title, win) => `${title} · ${win}`,
    noUsageInWindow: 'За выбранный период расхода нет',
    trendTitle: 'Динамика за последние 30 дней (местный часовой пояс · по дням)',
    legendNote: 'Высота столбца — итог за день; сегменты — доли провайдеров',
    legendDimNote: '; приглушённые — вне выбранного периода',
    tipTotal: (label, total) => `${label} · итого ${total}`,
    tipArchived: ' · из архива (исходные файлы уже удалены)',
    tipNoUsage: 'Нет расхода',
    noModelData: 'Пока нет данных по моделям'
  },
  /** The display names that vary by language (the rest, such as Anthropic / Claude, are proper nouns and
   * are not translated) */
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
    artifactNotWhitelisted: 'Этого пути к артефакту нет в списке разрешённых',
    pluginRootNotRegistered:
      'Корень этого плагина не зарегистрирован — сначала обновите или откройте сведения',
    projectNotOpened: 'Проект не открыт — сначала откройте сведения о нём',
    skillPackageUnavailable: 'Пакет skill недоступен или находится вне разрешённых корней',
    skillFileNotWhitelisted: 'Этого пути к файлу skill нет в списке разрешённых',
    skillFileUnreadable: 'Не удаётся прочитать файл skill',
    sessionNotIndexed: 'Эта сессия не проиндексирована — сначала нажмите «Обновить всё»',
    sessionFileUnreadable: 'Файл сессии больше не читается (перемещён или удалён?)',
    sessionMetaUnreadable:
      'Метаданные в первой строке сессии не читаются, поэтому индекс невозможно перестроить',
    sessionParseFailed: 'Не удалось разобрать файл сессии',
    prefsStoreNotReady: 'Хранилище настроек не готово',
    invalidPref: (field) => `Недопустимое значение настройки: ${field}`,
    contractMissing: (path) => `Получена некорректная полезная нагрузка: отсутствует ${path}`,
    contractType: (path, expect) => `Получена некорректная полезная нагрузка: ${path} должен быть ${expect}`,
    contractEnum: (path, value) =>
      `Получена некорректная полезная нагрузка: значение ${value} в ${path} не входит в число допустимых`,
    untrustedSender: (sender) => `Недоверенный отправитель IPC: ${sender}`,
    linkProtocolUnsupported: 'Неподдерживаемый протокол ссылки',
    linkOutOfScope: 'Цель ссылки вне читаемой области',
    skillBadName: 'Недопустимое имя skill',
    skillStaleTarget: 'Цель — устаревший проект (его каталог больше не существует)',
    skillMissingSource: (name) => `В глобальной библиотеке нет такого skill: ${name}`,
    skillCopyMissing: 'Копия уровня проекта не существует',
    skillConflict: 'Заблокировано: в цели уже есть skill с таким именем на уровне проекта, ничего не перезаписано',
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
