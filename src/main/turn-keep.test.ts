// The keep size (session-view, the in-turn fetch states; #485): a turn whose body is over it is shown but kept neither in
// the display copy nor in memory, measured on the body as the turn limit is.
import { describe, expect, it } from 'vitest'
import { turnKeepBytes, turnKept } from './turn-keep'

describe('turnKeepBytes', () => {
  it('is 8 MiB unless the test seam lowers it to a positive number', () => {
    expect(turnKeepBytes(undefined)).toBe(8_388_608)
    expect(turnKeepBytes('')).toBe(8_388_608)
    expect(turnKeepBytes('not a number')).toBe(8_388_608)
    expect(turnKeepBytes('0')).toBe(8_388_608)
    expect(turnKeepBytes('-5')).toBe(8_388_608)
    expect(turnKeepBytes('300')).toBe(300)
  })
})

describe('turnKept', () => {
  it('keeps a turn whose body is exactly the keep size, and not one a byte over', () => {
    expect(turnKept(8_388_608, 8_388_608)).toBe(true)
    expect(turnKept(8_388_609, 8_388_608)).toBe(false)
  })
})
