// Counted nouns: every entry that puts a number next to a noun, checked at the counts where the language
// changes plural category.
//
// **Expectations are literal fragments, not a property.** A property test ("n=1 renders differently from
// n=2") would pass on any two *wrong* forms that merely differ, and choosing the wrong form is the actual
// defect here. So the expected text is spelled out.
//
// The counts come from measuring `Intl.PluralRules`: English has 1=one and everything else=other, so only
// n=1 is at risk. Chinese has a single category and is excluded by construction, not by omission.
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
    expect(d.agents.unreadableConversations(1)).toBe('1 conversation couldn’t be read')
    expect(d.agents.unreadableConversations(2)).toBe('2 conversations couldn’t be read')
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

  it('the global search counts', () => {
    expect(d.search.placeholder(1, 1)).toBe('Search the questions in 1 session across 1 project…')
    expect(d.search.placeholder(2, 3)).toBe('Search the questions in 3 sessions across 2 projects…')
    expect(d.search.hitsFound(1, 1, 1)).toBe('Found **1** hit · 1 session · 1 project')
    expect(d.search.hitsFound(2, 3, 4)).toBe('Found **2** hits · 3 sessions · 4 projects')
    expect(d.search.projectCounts(1, 1)).toBe('1 session · 1 hit')
    expect(d.search.projectCounts(2, 3)).toBe('2 sessions · 3 hits')
  })

  it('a count in an uppercased slot still carries its noun', () => {
    // `.day-group` and the main-line header are `text-transform: uppercase`, so a bare numeral sits between
    // two words with nothing to say what it counts — "QUESTIONS (MAIN LINE) · 12 · 3 DAYS". The source
    // language carries a counter word here, and English had dropped the noun.
    expect(d.session.mainline(1, '')).toBe('Questions (main line) · 1 question')
    expect(d.session.mainline(12, ' · 3 days')).toBe('Questions (main line) · 12 questions · 3 days')
    expect(d.session.dayGroup('Mon', 1)).toBe('Mon · 1 question')
    expect(d.session.dayGroup('Mon', 4)).toBe('Mon · 4 questions')
  })
})
