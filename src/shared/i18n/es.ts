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
    badgeDefault: 'Predeterminado',
    appearanceFoot:
      'El modo claro / oscuro sigue la apariencia del sistema de macOS. Los cambios de tema se aplican de inmediato en toda la app, sin necesidad de guardar.',
    schemePurple: 'Violeta',
    schemeBlue: 'Azul niebla',
    schemeAmber: 'Ámbar',
    schemePurpleDesc:
      'El violeta de la marca. Apariencia predeterminada tras la instalación, igual que en versiones anteriores.',
    schemeBlueDesc:
      'Fondo de papel gris cálido con acento azul sereno, cómodo para lecturas largas.',
    schemeAmberDesc: 'Papel cálido con acento marrón, más cercano a la sensación de un libro impreso.'
  },

  toast: {
    languageSwitched: (name) => `Idioma de la interfaz cambiado a ${name}`,
    languageFollowSystem: (name) => `Ahora sigue el sistema · actualmente ${name}`
  }
}
