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
    invalidPref: (field) => `Valor de preferencia no válido: ${field}`
  },

  subagentError: {
    unreadable: 'Ilegible',
    parseFailed: 'Error de análisis'
  }
}
