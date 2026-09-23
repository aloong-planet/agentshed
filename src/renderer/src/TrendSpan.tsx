import { createContext, useContext } from 'react'
import { TREND_WINDOW_DAYS, type TrendSpan } from '@shared/trend'

export const TrendSpanContext = createContext<{
  span: TrendSpan
  onSpan: (span: TrendSpan) => void
}>({ span: TREND_WINDOW_DAYS, onSpan: () => {} })

export function useTrendSpan(): React.ContextType<typeof TrendSpanContext> {
  return useContext(TrendSpanContext)
}
