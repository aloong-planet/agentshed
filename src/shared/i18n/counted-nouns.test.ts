// Counted nouns: every entry that puts a number next to a noun, checked at the counts where the language
// changes plural category.
//
// **Expectations are literal fragments, not a property.** A property test ("n=1 renders differently from
// n=2") would pass on `1 точек` / `2 точек` → wait, it would not — but it would pass on any two *wrong*
// forms that merely differ, and choosing the wrong form is the actual defect here. Russian `точек` for
// n=1 and `точки` for n=2 differ from each other and are both wrong. So the expected text is spelled out.
//
// The counts per language come from measuring `Intl.PluralRules`, and they are not interchangeable:
//   - English   1=one, everything else=other. Only n=1 is at risk.
//   - French    **0 and 1 both=one**, 2+=other. n=0 is at risk too, and English speakers get this backwards.
//   - Spanish   1=one, 0 and 2+=other. Like English.
//   - Russian   1/21/101=one, 2–4/22–24=few, 0/5–20/25–30=many. Four-way, and 0→many / 21→one both
//               contradict intuition.
//   - Chinese and Japanese have a single category and are excluded by construction, not by omission.
import { describe, it, expect } from 'vitest'
import { dictOf } from './index'

describe('English counted nouns', () => {
  const d = dictOf('en')

  it('singular at 1 and plural at 2 wherever a noun follows a count', () => {
    expect(d.agents.sideSummary(1, 1, 1)).toBe('1 project · 1 global skill · 1 subagent')
    expect(d.agents.sideSummary(2, 3, 4)).toBe('2 projects · 3 global skills · 4 subagents')
    expect(d.skills.pkgSummary(1, '1 kB')).toBe('1 file · 1 kB')
    expect(d.skills.pkgSummary(2, '2 kB')).toBe('2 files · 2 kB')
    expect(d.plugins.cachedVersions(1)).toBe('(1 cached version)')
    expect(d.plugins.cachedVersions(3)).toBe('(3 cached versions)')
  })

  it('the session and turn counts', () => {
    expect(d.session.forkPoints(1)).toContain('**1 fork point**')
    expect(d.session.forkPoints(2)).toContain('**2 fork points**')
    expect(d.session.headMeta('Claude', 1, '1k', '1 MB', 'now')).toContain('· 1 question ·')
    expect(d.session.headMeta('Claude', 2, '1k', '1 MB', 'now')).toContain('· 2 questions ·')
    expect(d.session.dayCount(1)).toBe(' · 1 day')
    expect(d.session.dayCount(2)).toBe(' · 2 days')
    expect(d.turn.thinkingSum(1)).toBe('1 char · plain text available')
    expect(d.turn.thinkingSum(2)).toBe('2 chars · plain text available')
    expect(d.turn.reasoningSum(1)).toBe('only 1 heading · body unavailable')
    expect(d.turn.reasoningSum(2)).toBe('only 2 headings · body unavailable')
    expect(d.turn.subSteps(1)).toBe('1 step · no result')
    expect(d.turn.subSteps(2)).toBe('2 steps · no result')
    expect(d.turn.unknownRecords(1, 'x')).toContain('**1 unrecognised record**')
    expect(d.turn.unknownRecords(2, 'x')).toContain('**2 unrecognised records**')
  })

  it('the search and session-list counts', () => {
    expect(d.detail.sessionCountNote(1)).toContain('1 session in total')
    expect(d.detail.sessionCountNote(2)).toContain('2 sessions in total')
    expect(d.detail.hitsFound(1, 1)).toBe('Found 1 hit · 1 session')
    expect(d.detail.hitsFound(2, 3)).toBe('Found 2 hits · 3 sessions')
    expect(d.detail.folded(1)).toContain('1 hit folded away')
    expect(d.detail.folded(2)).toContain('2 hits folded away')
    expect(d.detail.hitCount(1)).toBe('1 hit')
    expect(d.detail.hitCount(2)).toBe('2 hits')
    expect(d.detail.sortNote('descending', 1)).toContain('· 1 session')
    expect(d.detail.sortNote('descending', 2)).toContain('· 2 sessions')
    expect(d.detail.questionCount(1)).toBe('1 question')
    expect(d.detail.questionCount(2)).toBe('2 questions')
    expect(d.detail.searchPlaceholder(1)).toBe('Search across 1 session in this project…')
    expect(d.detail.searchPlaceholder(2)).toBe('Search across 2 sessions in this project…')
    expect(d.projects.staleFiltered(1)).toBe('1 stale project filtered out')
    expect(d.projects.staleFiltered(2)).toBe('2 stale projects filtered out')
    expect(d.errors.turnOutOfRange(0, 1)).toBe('Turn index out of range: 0 (of 1 turn)')
    expect(d.errors.turnOutOfRange(9, 5)).toBe('Turn index out of range: 9 (of 5 turns)')
  })

  it('a count in an uppercased slot still carries its noun', () => {
    // `.day-group` and the main-line header are `text-transform: uppercase`, so a bare numeral sits between
    // two words with nothing to say what it counts — "QUESTIONS (MAIN LINE) · 12 · 3 DAYS". The source
    // language and Japanese both carry a counter word here; English, French, Spanish and Russian dropped it.
    expect(d.session.mainline(1, '')).toBe('Questions (main line) · 1 question')
    expect(d.session.mainline(12, ' · 3 days')).toBe('Questions (main line) · 12 questions · 3 days')
    expect(d.session.dayGroup('Mon', 1)).toBe('Mon · 1 question')
    expect(d.session.dayGroup('Mon', 4)).toBe('Mon · 4 questions')
  })
})

describe('French counted nouns', () => {
  const d = dictOf('fr')

  // French is the one language here where **0 takes the singular**, so every case below checks 0 as well as
  // 1. An English speaker reading these entries sees nothing wrong at 0 — which is why they were all wrong.
  it('0 and 1 both take the singular, 2 takes the plural', () => {
    expect(d.agents.sideSummary(0, 1, 2)).toBe('0 projet · 1 skill global · 2 subagents')
    expect(d.agents.sideSummary(2, 2, 1)).toBe('2 projets · 2 skills globaux · 1 subagent')
    expect(d.skills.pkgSummary(0, '0 o')).toBe('0 fichier · 0 o')
    expect(d.skills.pkgSummary(1, '1 ko')).toBe('1 fichier · 1 ko')
    expect(d.skills.pkgSummary(2, '2 ko')).toBe('2 fichiers · 2 ko')
    expect(d.plugins.cachedVersions(1)).toBe('(1 version en cache)')
    expect(d.plugins.cachedVersions(2)).toBe('(2 versions en cache)')
  })

  it('the session and turn counts', () => {
    expect(d.session.forkPoints(1)).toContain('**1 point de bifurcation**')
    expect(d.session.forkPoints(2)).toContain('**2 points de bifurcation**')
    expect(d.session.headMeta('Claude', 1, '1k', '1 Mo', 'x')).toContain('· 1 question ·')
    expect(d.session.headMeta('Claude', 2, '1k', '1 Mo', 'x')).toContain('· 2 questions ·')
    expect(d.session.dayCount(0)).toBe(' · 0 jour')
    expect(d.session.dayCount(1)).toBe(' · 1 jour')
    expect(d.session.dayCount(2)).toBe(' · 2 jours')
    expect(d.turn.thinkingSum(1)).toBe('1 caractère · texte clair disponible')
    expect(d.turn.thinkingSum(2)).toBe('2 caractères · texte clair disponible')
    expect(d.turn.reasoningSum(1)).toBe('seulement 1 intertitre · corps indisponible')
    expect(d.turn.reasoningSum(2)).toBe('seulement 2 intertitres · corps indisponible')
    expect(d.turn.subSteps(1)).toBe('1 étape · sans retour')
    expect(d.turn.subSteps(2)).toBe('2 étapes · sans retour')
    expect(d.turn.unknownRecords(1, 'x')).toContain('**1 enregistrement non reconnu**')
    expect(d.turn.unknownRecords(2, 'x')).toContain('**2 enregistrements non reconnus**')
    expect(d.session.mainline(1, '')).toBe('Questions (fil principal) · 1 question')
    expect(d.session.mainline(4, ' · 2 jours')).toBe('Questions (fil principal) · 4 questions · 2 jours')
    expect(d.session.dayGroup('lun.', 1)).toBe('lun. · 1 question')
    expect(d.session.dayGroup('lun.', 4)).toBe('lun. · 4 questions')
  })

  it('the search and session-list counts', () => {
    expect(d.detail.sessionCountNote(1)).toContain('1 session au total')
    expect(d.detail.sessionCountNote(2)).toContain('2 sessions au total')
    expect(d.detail.hitsFound(1, 1)).toBe('1 résultat · 1 session')
    expect(d.detail.hitsFound(2, 3)).toBe('2 résultats · 3 sessions')
    expect(d.detail.folded(1)).toContain('1 résultat replié')
    expect(d.detail.folded(2)).toContain('2 résultats repliés')
    expect(d.detail.hitCount(1)).toBe('1 résultat')
    expect(d.detail.hitCount(2)).toBe('2 résultats')
    expect(d.detail.sortNote('décroissant', 1)).toContain('· 1 session')
    expect(d.detail.sortNote('décroissant', 2)).toContain('· 2 sessions')
    expect(d.detail.questionCount(1)).toBe('1 question')
    expect(d.detail.questionCount(2)).toBe('2 questions')
    expect(d.detail.searchPlaceholder(1)).toBe('Rechercher parmi 1 session de ce projet…')
    expect(d.detail.searchPlaceholder(9)).toBe('Rechercher parmi 9 sessions de ce projet…')
    expect(d.errors.turnOutOfRange(0, 1)).toBe('Indice de tour hors limites : 0 (sur 1 tour)')
    expect(d.errors.turnOutOfRange(9, 5)).toBe('Indice de tour hors limites : 9 (sur 5 tours)')
  })

  it('the hand-rolled n > 1 ternaries agree with Intl at every integer, and at 1.5 they do not', () => {
    // `projects.staleFiltered` used `n > 1 ? 's' : ''`. That gets the French-specific trap
    // right (0 → singular) and is correct for every integer, so this is not a live bug — it is the reason
    // the rule must come from Intl anyway: at 1.5 French still takes the singular and the ternary does not.
    expect(d.projects.staleFiltered(0)).toBe('0 projet obsolète filtré')
    expect(d.projects.staleFiltered(1)).toBe('1 projet obsolète filtré')
    expect(d.projects.staleFiltered(2)).toBe('2 projets obsolètes filtrés')
  })
})

describe('Spanish counted nouns', () => {
  const d = dictOf('es')

  it('singular at 1, plural at 0 and 2', () => {
    expect(d.agents.sideSummary(1, 1, 1)).toBe('1 proyecto · 1 skill global · 1 subagent')
    expect(d.agents.sideSummary(2, 3, 4)).toBe('2 proyectos · 3 skills globales · 4 subagents')
    expect(d.skills.pkgSummary(1, '1 kB')).toBe('1 archivo · 1 kB')
    expect(d.skills.pkgSummary(0, '0 B')).toBe('0 archivos · 0 B')
    expect(d.plugins.cachedVersions(1)).toBe('(1 versión en caché)')
    expect(d.plugins.cachedVersions(2)).toBe('(2 versiones en caché)')
    // "carácter" carries an accent that "caracteres" loses — a naive -s/-es rule gets this one wrong
    expect(d.turn.thinkingSum(1)).toBe('1 carácter · texto claro disponible')
    expect(d.turn.thinkingSum(2)).toBe('2 caracteres · texto claro disponible')
  })

  it('the session, turn and search counts', () => {
    expect(d.session.forkPoints(1)).toContain('**1 punto de bifurcación**')
    expect(d.session.forkPoints(2)).toContain('**2 puntos de bifurcación**')
    expect(d.session.headMeta('Claude', 1, '1k', '1 MB', 'x')).toContain('· 1 pregunta ·')
    expect(d.session.headMeta('Claude', 2, '1k', '1 MB', 'x')).toContain('· 2 preguntas ·')
    expect(d.session.dayCount(1)).toBe(' · 1 día')
    expect(d.session.dayCount(2)).toBe(' · 2 días')
    expect(d.session.mainline(1, '')).toBe('Preguntas (línea principal) · 1 pregunta')
    expect(d.session.dayGroup('lun', 1)).toBe('lun · 1 pregunta')
    expect(d.session.dayGroup('lun', 4)).toBe('lun · 4 preguntas')
    expect(d.turn.subSteps(1)).toBe('1 paso · sin retorno')
    expect(d.turn.subSteps(2)).toBe('2 pasos · sin retorno')
    expect(d.turn.unknownRecords(1, 'x')).toContain('**1 registro no reconocido**')
    expect(d.turn.unknownRecords(2, 'x')).toContain('**2 registros no reconocidos**')
    expect(d.detail.sessionCountNote(1)).toContain('1 sesión en total')
    expect(d.detail.sessionCountNote(2)).toContain('2 sesiones en total')
    expect(d.detail.hitsFound(1, 1)).toBe('1 resultado · 1 sesión')
    expect(d.detail.hitsFound(2, 3)).toBe('2 resultados · 3 sesiones')
    expect(d.detail.hitCount(1)).toBe('1 resultado')
    expect(d.detail.questionCount(1)).toBe('1 pregunta')
    expect(d.detail.searchPlaceholder(1)).toBe('Buscar entre 1 sesión de este proyecto…')
    expect(d.detail.searchPlaceholder(9)).toBe('Buscar entre 9 sesiones de este proyecto…')
    expect(d.projects.staleFiltered(1)).toBe('1 proyecto obsoleto excluido')
    expect(d.projects.staleFiltered(2)).toBe('2 proyectos obsoletos excluidos')
    expect(d.errors.turnOutOfRange(0, 1)).toBe('Índice de turno fuera de rango: 0 (de 1 turno)')
    expect(d.errors.turnOutOfRange(9, 5)).toBe('Índice de turno fuera de rango: 9 (de 5 turnos)')
  })
})

describe('Russian counted nouns', () => {
  const d = dictOf('ru')

  // Russian mostly sidesteps agreement with an invariant genitive label ("вопросов: 5"), which is correct
  // at every count and is left alone. Only the entries that inline a numeral next to a noun are at risk.
  it('the four categories on the entries that inline a numeral', () => {
    expect(d.session.forkPoints(1)).toContain('**1 точка ветвления**')
    expect(d.session.forkPoints(2)).toContain('**2 точки ветвления**')
    expect(d.session.forkPoints(5)).toContain('**5 точек ветвления**')
    // 21 → one, not many. The single most counter-intuitive case in the whole language set.
    expect(d.session.forkPoints(21)).toContain('**21 точка ветвления**')
  })

  it('“среди” governs the genitive, which is a different form set from the usual one', () => {
    // After `среди`, n=1 takes the genitive singular `сессии` — not the nominative `сессия` that follows a
    // bare numeral. Copying the form set from another entry is exactly how this goes wrong.
    expect(d.detail.searchPlaceholder(1)).toBe('Искать среди 1 сессии этого проекта…')
    expect(d.detail.searchPlaceholder(2)).toBe('Искать среди 2 сессий этого проекта…')
    expect(d.detail.searchPlaceholder(5)).toBe('Искать среди 5 сессий этого проекта…')
    expect(d.detail.searchPlaceholder(21)).toBe('Искать среди 21 сессии этого проекта…')
  })

  it('the bare numerals in the day group and main line get a noun', () => {
    expect(d.session.mainline(1, '')).toBe('Вопросы (основная ветка) · 1 вопрос')
    expect(d.session.mainline(2, '')).toBe('Вопросы (основная ветка) · 2 вопроса')
    expect(d.session.mainline(5, '')).toBe('Вопросы (основная ветка) · 5 вопросов')
    expect(d.session.dayGroup('пн', 1)).toBe('пн · 1 вопрос')
    expect(d.session.dayGroup('пн', 3)).toBe('пн · 3 вопроса')
    expect(d.session.dayGroup('пн', 8)).toBe('пн · 8 вопросов')
  })

  it('the existing plural() call sites keep all four forms right, including 0 → many', () => {
    expect(d.projects.staleFiltered(1)).toBe('Отфильтровано 1 устаревший проект')
    expect(d.projects.staleFiltered(2)).toBe('Отфильтровано 2 устаревших проекта')
    expect(d.projects.staleFiltered(5)).toBe('Отфильтровано 5 устаревших проектов')
  })
})
