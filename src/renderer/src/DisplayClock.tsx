import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const Clock = createContext<number | null>(null)
/** One wall-clock anchor for every visible date label, window total and chart. scannedAt is untouched. */
export function DisplayClock({ children }: { children: ReactNode }): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = (): void => setNow(Date.now())
    const timer = setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return <Clock.Provider value={now}>{children}</Clock.Provider>
}
export function useDisplayClock(): number {
  const now = useContext(Clock)
  if (now === null) throw new Error('DisplayClock provider missing')
  return now
}
