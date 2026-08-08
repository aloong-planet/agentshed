import type { Locale } from './types'

export const es: Locale = {
  languageName: 'Español',
  languageNameEn: 'Spanish',
  htmlLang: 'es',

  rail: {
    agents: 'Agents',
    projects: 'Proyectos',
    refresh: 'Actualizar todo',
    settings: 'Ajustes'
  },

  settings: {
    title: 'Ajustes',
    lead: 'Preferencias exclusivas de esta app. Se aplican a toda la interfaz y nunca se escriben en tu configuración de Claude o Codex.',
    sectionLanguage: 'Idioma',
    interfaceLanguage: 'Idioma de la interfaz',
    followSystem: 'Seguir el sistema',
    languageFoot:
      'Con «Seguir el sistema», la interfaz sigue tus idiomas preferidos de macOS; se usa el inglés si ninguno es compatible.',
    sectionAppearance: 'Apariencia',
    mode: 'Modo',
    modeLight: 'Claro',
    modeDark: 'Oscuro',
    palette: 'Paleta',
    appearanceFoot:
      'Con el modo «Seguir el sistema», el claro y el oscuro siguen la apariencia de macOS; al elegir Claro u Oscuro la app queda fijada aunque el sistema cambie después. La paleta y el modo son independientes y se combinan libremente; se usa Violeta si no eliges nada. Los cambios se aplican de inmediato en toda la app, sin necesidad de guardar.',
    schemePurple: 'Violeta',
    schemeBlue: 'Azul niebla',
    schemeAmber: 'Ámbar'
  },

  toast: {
    languageSwitched: (name) => `Idioma de la interfaz cambiado a ${name}`,
    languageFollowSystem: (name) => `Ahora sigue el sistema · actualmente ${name}`,
    saveSchemeFailed: 'No se pudo guardar la paleta',
    saveModeFailed: 'No se pudo guardar el modo de apariencia',
    saveLanguageFailed: 'No se pudo guardar el idioma'
  },

  skillDeepHint: 'La buena práctica es una profundidad de referencia de skill menor que 2: considera reestructurar este skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  /** 随语言变化的展示名(其余如 Anthropic / Claude 是专有名词,不译) */
  agents: {
    sideSummary: (projects, skills, subagents) => `${projects} proyectos · ${skills} skills globales · ${subagents} subagents`,
    tabCfg: 'Configuración',
    notDetected: 'No se detectó ningún directorio de datos de Claude Code ni de Codex en este equipo',
    notDetectedHint: 'Instala y usa cualquiera de los dos agents y pulsa ↻ al final del rail para actualizar y ver el panorama',
    totalsNote: 'incluye proyectos ocultos/obsoletos',
    archivedNote: (days, earliest) => `En ${days} de esos días (el más antiguo ${earliest}) el agent ya limpió los archivos de sesión de origen; los valores vienen del archivo local (barras rayadas)`,
    byModel: 'Por modelo (entre proyectos; en el lado Codex es una aproximación del modelo principal de la sesión)',
    detected: 'Detectado', undetected: 'No detectado',
    emptyGlobalLib: 'Ambas bibliotecas globales están vacías',
    sideMismatch: (project) => `${project} no pertenece al lado del agent donde vive este skill`,
    installed: (skill, project, side) => `${skill} instalado → ${project} (${side}); solo se actualizó este proyecto`,
    skillsHint: 'Fusionado en una lista · haz clic en una fila para los archivos del paquete · en un archivo para la vista previa · sin diff entre lados · los plugins son de solo lectura',
    levelPluginPkg: 'Paquete de plugin', levelGlobalLib: 'Biblioteca global',
    installTo: 'Instalar en…',
    pickTarget: 'Elige un proyecto de destino (se instala por copia; los proyectos obsoletos quedan excluidos)',
    srcGlobalConfig: 'configuración global', srcPlugin: 'incluido con el plugin',
    globalMcp: 'MCP global',
    noGlobalMcp: 'No hay MCP global (los .mcp.json de nivel de proyecto están en el detalle del proyecto)',
    noMcpSection: 'config.toml no tiene sección mcp_servers',
    cfgClaudeMd: 'CLAUDE.md global', cfgAgentsMd: 'AGENTS.md global', cfgToml: 'resumen de config.toml',
    tomlMissing: 'config.toml no existe', fileMissing: 'El archivo no existe'
  },

  shell: {
    pickProject: 'Selecciona un proyecto para ver su detalle',
    scanning: 'Analizando Claude Code / Codex… (no se muestra una lista vacía hasta que termine)'
  },
  skills: {
    listFailed: (detail) => `Error al listar: ${detail}`,
    pillPlugin: 'Plugin', pillProject: 'Proyecto', pillGlobal: 'Global', pillSymlink: '⤷ enlace',
    pkgSummary: (files, size) => `${files} archivos · ${size}`,
    srcPluginPkg: 'Paquete de plugin', srcProject: 'Proyecto', srcGlobal: 'Biblioteca global',
    listing: 'Listando…',
    deeperPaths: (paths) => `Rutas más profundas no listadas: ${paths}`,
    colFile: 'Archivo', colLines: 'Líneas', colSize: 'Tamaño', colMtime: 'Modificado',
    noPreviewable: 'No hay archivos de texto previsualizables en el paquete',
    tagEntry: 'Entrada', close: 'Cerrar', raw: 'Original', preview: 'Vista previa',
    loading: 'Cargando…', emptyFile: 'Archivo vacío',
    installMissing: 'Falta el directorio de instalación', pkgUnreadable: 'Paquete de skill ilegible'
  },

  subagents: {
    noneGlobal: 'No hay definiciones de subagent en ninguno de los dos lados (~/.claude/agents y ~/.codex/agents)',
    globalHint: 'Ambos lados en una sola lista · mismo nombre en una fila (sin diff de contenido) · haz clic para ver la definición completa',
    noDescription: '(sin description)',
    noneProject: 'No hay definiciones de subagent ni de proyecto ni globales',
    projectHint: 'Vista efectiva · en ambos lados el nivel de proyecto tapa · haz clic para ver la definición completa',
    levelProject: 'Proyecto', levelGlobal: 'Global',
    overridesBuiltin: 'Sustituye al integrado', shadows: 'Tapa el mismo nombre', shadowed: 'Tapado por el nivel de proyecto',
    metaShadows: ' · prevalece sobre una definición de nivel inferior con el mismo nombre',
    metaShadowed: ' · tapado por una definición de nivel de proyecto (sin efecto)',
    noSideDef: 'Sin definición en este lado', inherited: '— (heredado)'
  },

  memory: {
    codexLegacy: 'La memoria de Codex está desactivada; lo de arriba son archivos residuales del directorio.',
    codexEmpty: 'La memoria de Codex está activada pero vacía.',
    codexDisabled: 'La memoria de Codex está desactivada: actívala con el comando /memories dentro de Codex, o en Ajustes → Personalización → Enable memories (experimental).',
    noneGlobal: 'Ningún proyecto tiene memoria automática',
    globalHint: 'Por modificación más reciente · incluye obsoletos/ocultos (con distintivo) · haz clic en una fila para sus archivos y en un archivo para su contenido',
    stale: 'Obsoleto', hidden: 'Oculto',
    codexGlobalDir: 'Directorio de memoria global', noMainFile: 'Sin MEMORY.md',
    noneProject: 'Este proyecto aún no tiene memoria automática',
    claudeOnly: 'Memory es un mecanismo del lado Claude (la memoria de Codex es global: mira la pestaña Memory de la página global)',
    mainTitle: 'MEMORY.md (archivo principal de memoria automática)',
    noMain: 'Sin MEMORY.md (solo archivos topic)',
    topicsTitle: (n) => `Archivos topic (${n}) · haz clic para ver`,
    noTopics: 'Sin archivos topic',
    topicMeta: (ago) => `archivo topic · ${ago}`,
    unreadable: (detail) => `No se puede leer el archivo: ${detail}`,
    loading: 'Cargando…'
  },

  plugins: {
    projectMissing: '(proyecto perdido)',
    installMissing: 'Falta el directorio de instalación (caché limpiada): solo se ve el registro; los componentes incluidos no se pueden leer',
    noBundled: 'Ninguno de los cuatro tipos de componentes incluidos',
    codexCacheEnum: 'enumeración de caché',
    cachedVersions: (n) => `(${n} versiones en caché)`,
    cacheOnly: 'solo enumeración de caché',
    codexFoot: 'El grupo Codex solo lista los plugins presentes en la caché; no hay semántica de activación, y los skills incluidos se pueden previsualizar pero no se fusionan en la pestaña Skills',
    codexFootDetail: '; los plugins de Codex son de efecto global, sin semántica de activación por proyecto',
    claudeGlobalHint: 'Criterio de activación: capa user · haz clic para desplegar los componentes incluidos',
    noPlugins: 'No hay ningún plugin instalado',
    enabled: 'Habilitado', notEnabled: 'No habilitado',
    claudeProjectHint: 'Criterio de activación: conjunto efectivo de este proyecto (local > project > user)',
    enabledShort: 'Habilitado', disabledShort: 'Deshabilitado',
    noLayerMentions: 'No se menciona en ninguna capa',
    verdictFrom: (verdict, layer) => `${verdict}: decidido por la ${layer}`,
    layerLocal: 'capa local', layerProject: 'capa project', layerUser: 'capa user'
  },
  session: {
    forkPoints: (n) =>
      `Esta sesión tiene **${n} puntos de bifurcación**. La cadena mostrada se traza desde el último mensaje hacia la raíz siguiendo los enlaces al padre, es decir «cómo queda finalmente esta conversación»; las ramas abandonadas no se muestran.`,
    forkedFrom: 'Esta sesión se bifurcó de',
    anotherSession: 'otra sesión',
    forkedFromTail: '— el prefijo repetido ya se recortó, así que abajo solo se muestra lo posterior a esta bifurcación. **El historial anterior está en esa sesión**.',
    stripUncertainOrphan:
      '**Recorte del prefijo dudoso**: esta sesión se bifurcó de un padre **fuera del conjunto analizado** (su archivo se limpió o pertenece a un proyecto no registrado), así que el recorte solo pudo ser heurístico: **puede haber recortado de más (perdiendo mensajes) o de menos (duplicados)**. Compruébalo con el original. No fallar en silencio es la única garantía posible aquí.',
    stripUncertainMismatch: (parent) =>
      `**Recorte del prefijo dudoso**: el segmento repetido no coincide entrada por entrada con la sesión padre «${parent}» (el registro padre pudo reescribirse), así que solo se recortó **la parte que supera la verificación**: el comienzo puede duplicar al padre o faltar. Compruébalo con el original.`,
    fetching: 'Recuperando…',
    rebuilding: 'La firma del índice no coincide (el archivo se amplió o reescribió) → reconstruyendo el índice **solo de este archivo**…',
    turnFailed: (detail) => `No se pudo recuperar este turno: ${detail}`,
    fetchedNote: (ms, bytes) =>
      `⚡ Recuperado bajo demanda en ${ms} ms · se leyó solo el rango de bytes de este turno, ${bytes}, con independencia del tamaño del archivo`,
    back: (project) => `‹ Volver a ${project} · Sesiones`,
    headMeta: (side, questions, tok, mb, ago) =>
      `${side} · ${questions} preguntas · ${tok} tok · ${mb} · última actividad ${ago}`,
    cannotOpen: (detail) => `No se puede abrir la sesión: ${detail}`,
    loading: 'Cargando…',
    mainline: (n, days) => `Preguntas (línea principal) · ${n}${days}`,
    dayCount: (n) => ` · ${n} días`,
    expandAll: 'Desplegar todo',
    collapseAll: 'Plegar todo',
    ascending: 'Más antiguas primero',
    descending: 'Más recientes primero',
    dayGroup: (day, n) => `${day} · ${n}`,
    foot: 'La línea principal solo lista preguntas humanas; el ruido del harness no se renderiza. Todas las preguntas se listan de una vez (su texto se lee bajo demanda por rango de bytes, con independencia del tamaño del archivo). Haz clic en una pregunta para desplegar el turno completo ahí mismo: cuerpo, llamadas a herramientas, delegaciones a subagents y bloques de razonamiento.'
  },

  turn: {
    typeSeparator: ', ',
    thinking: 'Pensamiento',
    thinkingSum: (chars) => `${chars} caracteres · texto claro disponible`,
    reasoning: 'Razonamiento',
    reasoningSum: (n) => `solo ${n} subtítulos · cuerpo no disponible`,
    reasoningNote:
      'El cuerpo del razonamiento de Codex es `encrypted_content` y **nunca podrá obtenerse**. Abajo están los únicos subtítulos en texto claro del registro: **no son equivalentes** al pensamiento en claro del lado Claude, y no se finge que lo sean.',
    input: 'Entrada',
    output: 'Retorno',
    empty: '(vacío)',
    noOutput: '(sin retorno registrado)',
    truncatedNote:
      'El retorno superó el límite por entrada del agent, así que la transcripción **solo guardó una versión truncada**; el original queda al lado en `tool-results/` (ruta arriba) y este producto no lo lee: lo que se muestra aquí es la versión truncada, sin afirmar que esté completa.',
    subSteps: (n) => `${n} pasos · sin retorno`,
    dispatchPrompt: 'Prompt de delegación',
    innerSteps: 'Pasos internos',
    unlinkedNote:
      'Los pasos internos de esta delegación **no tienen una cadena de referencias estable** en el registro que permita ubicarlos aquí (comprobado en ambos lados): no se muestran y no se hace emparejamiento especulativo; la transcripción completa está en su propio archivo, si existe.',
    backToMain: 'Volver a la sesión principal',
    noReturn: '(sin retorno)',
    unknownRecords: (count, types) =>
      `▧ Este turno tiene **${count} registros no reconocidos** (tipos: ${types}): se conservan tal cual en el archivo de origen y no se renderizan. Suele significar que una actualización del agent introdujo un tipo nuevo.`
  },
  detail: {
    notInSnapshot: 'Este proyecto no está en la instantánea (actualiza e inténtalo de nuevo)',
    staleTag: 'Obsoleto',
    tabOverview: 'Resumen',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'Sesiones',
    tabCfg: 'Configuración',
    tabArts: 'Productos',
    loading: 'Cargando…',
    byModel: 'Por modelo',
    recentSessions: 'Sesiones recientes',
    noSessions: 'Este proyecto aún no tiene sesiones',
    sessionCountNote: (n) => `${n} sesiones en total: todas en la pestaña «Sesiones».`,
    noSessionsHint: 'Este proyecto aún no tiene sesiones. Aparecen automáticamente cuando alguno de los dos agentes conversa en este directorio.',
    searching: 'Buscando…',
    noHits: 'Sin resultados. Por defecto solo se buscan las preguntas: prueba con «Texto completo».',
    hitsFound: (hits, sessions) => `${hits} resultados · ${sessions} sesiones`,
    folded: (n) => ` · ${n} resultados plegados (repeticiones o ramas abandonadas)`,
    recentFirst: 'Más recientes primero',
    oldestFirst: 'Más antiguas primero',
    forkUncertain: '⑂? recorte dudoso',
    hitCount: (n) => `${n} resultados`,
    inBody: 'Cuerpo',
    sortNote: (order, n) => `Por última actividad, ${order} · ${n} sesiones`,
    descending: 'descendente',
    ascending: 'ascendente',
    forkTip: 'Esta sesión se bifurcó de otra; el prefijo repetido ya se recortó',
    forkUncertainTip: 'La sesión padre está fuera del conjunto analizado o no supera la verificación, así que el prefijo repetido solo pudo recortarse de forma heurística: puede quedar algo (duplicados)',
    questionCount: (n) => `${n} preguntas`,
    sessionsFoot: 'Solo se listan las sesiones de proyectos registrados; las de subagent y precalentamiento no se listan aparte, aunque sus tokens sí cuentan, de modo que este número y el denominador de las tarjetas de tokens de arriba no son lo mismo.',
    sessionsFoot2: '«Última actividad» toma la marca de tiempo mayor dentro del archivo, que es una vía distinta de la actividad de la lista de proyectos (que usa el mtime del archivo).',
    searchPlaceholder: (n) => `Buscar entre las ${n} sesiones de este proyecto…`,
    scopeQuestions: 'Preguntas',
    scopeFullText: 'Texto completo',
    levelPlugin: 'Paquete de plugin',
    levelProject: 'Nivel de proyecto',
    levelGlobal: 'Nivel global',
    uninstall: 'Desinstalar',
    uninstalled: (name) => `${name} desinstalado (solo se actualizó este proyecto)`,
    uninstallFailed: (detail) => `Error al desinstalar: ${detail}`,
    secClaudeProject: 'Nivel de proyecto · .claude/skills',
    secClaudeGlobal: 'Nivel global · Claude',
    secCodexProject: 'Nivel de proyecto · .agents/skills',
    secCodexGlobal: 'Nivel global · Codex',
    secPlugin: 'Incluidos en plugins · efectivamente habilitados aquí (con espacio de nombres, solo lectura)',
    noSkills: 'Este proyecto no tiene skills en efecto',
    confirmTitle: '¿Desinstalar el skill de nivel de proyecto?',
    confirmBody: 'Se eliminará el siguiente directorio (gestiona tú el estado de git del proyecto; no se comprueban diferencias de copia):',
    cancel: 'Cancelar',
    del: 'Eliminar',
    mcpTitle: 'Nivel de proyecto · .mcp.json (enabled/disabled viene de los ajustes del proyecto)',
    noMcp: 'Este proyecto no tiene .mcp.json; consulta la página Agents para el MCP global',
    mcpEnabled: 'Habilitado',
    mcpDisabled: 'Deshabilitado',
    mcpDefault: 'Predeterminado',
    filterAll: 'Todos',
    noArtifacts: 'No hay nada depositado según la convención (proyecto fuera del proceso de ocho pasos; no es un error)',
    noArtifactsOfType: 'No hay productos de este tipo',
    openInBrowser: 'HTML → navegador',
    settingsSummary: 'resumen de settings',
    noSettings: 'No hay ajustes mostrables bajo la clave del proyecto',
    fileMissing: 'El archivo no existe'
  },
  projects: {
    searchPlaceholder: 'Buscar proyectos…',
    filterAll: 'Todos',
    showStale: 'Mostrar proyectos obsoletos',
    staleFiltered: (n) => `${n} proyecto${n === 1 ? '' : 's'} obsoleto${n === 1 ? '' : 's'} filtrado${n === 1 ? '' : 's'}`,
    noMatch: 'No hay proyectos coincidentes',
    hiddenCount: (n) => `${n} proyecto${n === 1 ? '' : 's'} oculto${n === 1 ? '' : 's'}`,
    expandHint: '(clic para desplegar)',
    collapseHint: '(clic para plegar)',
    staleTag: 'Obsoleto',
    restore: 'Restaurar',
    hide: 'Ocultar'
  },
  token: {
    totalCard: (note) => `Total acumulado (ambos lados${note ? ` · ${note}` : ''})`,
    inOut: 'Entrada / Salida',
    inOutNote: 'Desglosado por lado, según los criterios propios de cada uno',
    cacheCard: 'De los cuales caché (ya incluido en el total, criterio ccusage)',
    cacheReadWrite: (read, write) => `Lectura ${read} · Escritura ${write}`,
    trendTitle: 'Últimos 30 días (zona horaria local · por día)',
    legendNote: 'Altura = total del día; segmentos = proporción por provider',
    tipTotal: (label, total) => `${label} · total ${total}`,
    tipArchived: ' · archivado (archivos de origen ya limpiados)',
    tipNoUsage: 'Sin consumo',
    noModelData: 'Aún no hay datos de modelos'
  },
  label: {
    providerOther: 'Otros',
    trendTotal: 'Total'
  },

  placeholder: {
    unreadableLine: '(esta línea ya no se puede leer)',
    untitledSession: '(sesión sin título)',
    unknownTool: '(herramienta desconocida)',
    unknown: '(desconocido)',
    notSet: 'Sin definir',
    codexGlobalMemory: '(memoria global de Codex)',
    truncated: '…(truncado)'
  },

  errors: {
    badArgs: (channel, field) =>
      field
        ? `Argumentos de llamada no válidos: ${channel} (campo ${field})`
        : `Argumentos de llamada no válidos: ${channel}`,
    sessionNotWhitelisted:
      'Esta sesión no está en la lista permitida: abre antes el detalle del proyecto o actualiza',
    engineNotReady: 'El motor de escaneo aún no está listo: inténtalo de nuevo en un momento',
    turnOutOfRange: (i, total) => `Índice de turno fuera de rango: ${i} (de ${total} turnos)`,
    artifactNotWhitelisted: 'Esta ruta de artefacto no está en la lista permitida',
    pluginRootNotRegistered:
      'La raíz de este plugin no está registrada: actualiza o abre antes el detalle',
    projectNotOpened: 'El proyecto no está abierto: abre antes su detalle',
    skillPackageUnavailable: 'El paquete de skill no está disponible o queda fuera de las raíces permitidas',
    skillFileNotWhitelisted: 'Esta ruta de archivo de skill no está en la lista permitida',
    skillFileUnreadable: 'No se puede leer el archivo de skill',
    sessionNotIndexed: 'Esta sesión no está indexada: haz antes una actualización global',
    sessionFileUnreadable: 'Ya no se puede leer el archivo de sesión (¿movido o eliminado?)',
    sessionMetaUnreadable:
      'La primera línea de la sesión no se puede leer, así que no es posible reconstruir el índice',
    sessionParseFailed: 'No se pudo analizar el archivo de sesión',
    prefsStoreNotReady: 'El almacén de preferencias no está listo',
    invalidPref: (field) => `Valor de preferencia no válido: ${field}`,
    contractMissing: (path) => `Se recibió una carga no válida: falta ${path}`,
    contractType: (path, expect) => `Se recibió una carga no válida: ${path} debería ser ${expect}`,
    contractEnum: (path, value) =>
      `Se recibió una carga no válida: el valor ${value} en ${path} está fuera de rango`,
    untrustedSender: (sender) => `Llamante IPC no confiable: ${sender}`,
    linkProtocolUnsupported: 'Protocolo de enlace no admitido',
    linkOutOfScope: 'El destino del enlace está fuera del alcance legible',
    skillBadName: 'Nombre de skill no válido',
    skillStaleTarget: 'El destino es un proyecto obsoleto (su carpeta ya no existe)',
    skillMissingSource: (name) => `No hay ningún skill con ese nombre en la biblioteca global: ${name}`,
    skillCopyMissing: 'No existe la copia a nivel de proyecto',
    skillConflict: 'El destino ya tiene un skill con ese nombre a nivel de proyecto: no se sobrescribió nada',
    skillCopyFailed: (detail) => `La copia falló y se limpió: ${detail}`,
    skillDeleteFailed: (detail) => `Error al eliminar: ${detail}`,
    registryProjectsInvalid: 'La clave projects del registro falta o no es un objeto',
    registryParseFailed: (detail) => `No se pudo analizar el registro: ${detail}`,
    subagentUnreadable: 'No se puede leer el archivo (permisos o error de E/S)',
    subagentTomlFailed: (detail) => `No se pudo analizar el toml: ${detail}`,
    subagentMissingName: 'Falta un campo name válido (Codex no cargará este archivo)'
  },

  subagentError: {
    unreadable: 'Ilegible',
    parseFailed: 'Error de análisis',
    detail: (msg) => `${msg}. Las demás entradas no se ven afectadas.`
  }
}
