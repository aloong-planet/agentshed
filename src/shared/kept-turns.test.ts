// The total limit on kept turns (session-view, the in-turn fetch states; ADR-0053): the main process and the renderer
// decide with these same functions which kept turns leave when a new one is kept.
import { describe, expect, it } from 'vitest'
import { keptTurnsUnitsArg, keptTurnUnits, turnsToRelease } from './kept-turns'
import { KEPT_TURNS_ARG } from './ipc'

describe('turnsToRelease', () => {
  const kept: [string, number][] = [['a', 40], ['b', 30], ['c', 20]]
  it('releases nothing when the new turn fits beside the kept ones, exactly at the limit included', () => {
    expect(turnsToRelease(kept, 10, 200)).toEqual([])
    expect(turnsToRelease(kept, 10, 100)).toEqual([])
  })
  it('releases the earliest fetched first, and only until the new turn fits', () => {
    expect(turnsToRelease(kept, 11, 100)).toEqual(['a'])
    expect(turnsToRelease(kept, 71, 100)).toEqual(['a', 'b'])
    expect(turnsToRelease(kept, 100, 100)).toEqual(['a', 'b', 'c'])
  })
  it('keeps nothing new, and releases nothing, for a turn over the limit alone', () => {
    expect(turnsToRelease(kept, 101, 100)).toBeNull()
    expect(turnsToRelease([], 101, 100)).toBeNull()
  })
})

describe('keptTurnUnits', () => {
  it("is the length of the turn's serialised form, in UTF-16 units", () => {
    expect(keptTurnUnits({ blocks: [], bytesRead: 9 })).toBe(27)
    expect(keptTurnUnits({ blocks: [{ kind: 'text', role: 'assistant', at: null, body: '\u{1F600}' }], bytesRead: 9 })).toBe(83)
  })
})

describe('keptTurnsUnitsArg', () => {
  it('is 128 Mi units unless the launch argument gives a positive number', () => {
    expect(keptTurnsUnitsArg([])).toBe(134_217_728)
    expect(keptTurnsUnitsArg([`${KEPT_TURNS_ARG}`])).toBe(134_217_728)
    expect(keptTurnsUnitsArg([`${KEPT_TURNS_ARG}0`])).toBe(134_217_728)
    expect(keptTurnsUnitsArg([`${KEPT_TURNS_ARG}-5`])).toBe(134_217_728)
    expect(keptTurnsUnitsArg([`${KEPT_TURNS_ARG}x`])).toBe(134_217_728)
    expect(keptTurnsUnitsArg(['--other=1', `${KEPT_TURNS_ARG}300`, '--more'])).toBe(300)
  })
})
