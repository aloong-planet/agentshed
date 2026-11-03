import { describe, expect, test } from 'vitest'
import { sideArrival } from './side-arrival'

const live = { path: '/live', sides: ['claude' as const], stale: false }
const ghost = { path: '/ghost', sides: ['claude' as const], stale: true }
const shared = { path: '/shared', sides: ['claude' as const, 'codex' as const], stale: false }
const otherGhost = { path: '/other-ghost', sides: ['grok' as const], stale: true }

describe('the stale toggle on arrival (projects-list::REQ-002/AC-02)', () => {
  test('on when the side has a stale project among live ones', () => {
    expect(sideArrival([live, ghost], 'claude', null).showStale).toBe(true)
  })

  test('on when the side has only stale projects', () => {
    expect(sideArrival([ghost], 'claude', null).showStale).toBe(true)
  })

  test('off when the side has none', () => {
    expect(sideArrival([live, shared], 'claude', null).showStale).toBe(false)
  })

  test('another side\'s stale project does not turn it on', () => {
    expect(sideArrival([live, otherGhost], 'claude', null).showStale).toBe(false)
  })
})

describe('the selection on arrival (projects-list::REQ-002/AC-04, AC-05)', () => {
  test('a project registered on the side stays', () => {
    expect(sideArrival([live, ghost], 'claude', '/live').keepSelection).toBe(true)
  })

  test('a project registered on several sides stays on each of them', () => {
    expect(sideArrival([shared], 'claude', '/shared').keepSelection).toBe(true)
    expect(sideArrival([shared], 'codex', '/shared').keepSelection).toBe(true)
  })

  test('a stale project registered on the side stays', () => {
    expect(sideArrival([ghost], 'claude', '/ghost').keepSelection).toBe(true)
  })

  test('a project registered only on another side is cleared', () => {
    expect(sideArrival([live, shared], 'codex', '/live').keepSelection).toBe(false)
  })

  test('a selection the snapshot no longer holds is cleared', () => {
    expect(sideArrival([live], 'claude', '/gone').keepSelection).toBe(false)
  })

  test('no selection has nothing to keep', () => {
    expect(sideArrival([live], 'claude', null).keepSelection).toBe(false)
  })
})
