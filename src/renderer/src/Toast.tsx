// A lightweight toast: reported from anywhere through a window custom event and rendered uniformly at
// the top of App.
import { useEffect, useState } from 'react'

export interface ToastMsg {
  id: number
  kind: 'ok' | 'err'
  text: string
}

export function toast(kind: 'ok' | 'err', text: string): void {
  window.dispatchEvent(new CustomEvent('agentshed-toast', { detail: { kind, text } }))
}

export function Toasts(): JSX.Element {
  const [items, setItems] = useState<ToastMsg[]>([])
  useEffect(() => {
    let seq = 0
    const onToast = (e: Event): void => {
      const { kind, text } = (e as CustomEvent<{ kind: 'ok' | 'err'; text: string }>).detail
      const id = ++seq
      setItems((prev) => [...prev, { id, kind, text }])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200)
    }
    window.addEventListener('agentshed-toast', onToast)
    return () => window.removeEventListener('agentshed-toast', onToast)
  }, [])
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
