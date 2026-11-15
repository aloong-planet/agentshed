// The combination a run's scans store their group results under (token-stats, Implementation Decisions, Cache). The
// rule is scanCombination; that the app's launch asks it is the lifecycle e2e case of a second unpackaged launch.
//
// Gap: that the combination reaches the scanner — through startScans to the scan worker's data and the main process's
// fallback scanner, and from there to the token engine — is not driven. In an unpackaged run a combination dropped on
// the way is the token engine's own, one per engine, which gives what the run's own would; only a packaged build tells
// them apart, every launch then combining every group again, and no case here launches one. A case is due once an e2e
// case can launch a packaged build, or a scan reports the combination it stored under.
import { describe, expect, it } from 'vitest'
import { scanCombination } from './scan-protocol'

describe('the combination a run\'s scans store their group results under (token-stats, Implementation Decisions, Cache)', () => {
  it('a packaged build\'s is its version: every launch of one version sums what the one before stored', () => {
    expect([scanCombination(true, '1.4.0'), scanCombination(true, '1.4.0')]).toEqual(['1.4.0', '1.4.0'])
  })

  it('an unpackaged run\'s is its own: two runs of one version never share one, nor take the version\'s', () => {
    const [a, b] = [scanCombination(false, '1.4.0'), scanCombination(false, '1.4.0')]
    expect(a).not.toBe(b)
    expect([a, b]).not.toContain('1.4.0')
  })
})
