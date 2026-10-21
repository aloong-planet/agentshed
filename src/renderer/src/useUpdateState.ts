// The app update lifecycle as the renderer sees it (app-update): the state the main process pushes, and one
// read on mount. A push always carries the newer state, so the read answers only if no push has overtaken it —
// one rule, kept here for every surface that shows the update (the rail's button, settings' Updates section).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IDLE_UPDATE, type UpdateState } from '@shared/update'

/** `onPush` runs with each pushed state, for what a surface must do as the update moves (not on the read) */
export function useUpdateState(onPush?: (state: UpdateState) => void): UpdateState {
  const [state, setState] = useState<UpdateState>(IDLE_UPDATE)
  // The subscription is made once at mount; the callback it calls must be the current render's
  const onPushRef = useRef(onPush)
  useLayoutEffect(() => {
    onPushRef.current = onPush
  })

  useEffect(() => {
    let alive = true
    let pushed = false
    const off = window.agentshed.onUpdateState((s) => {
      pushed = true
      setState(s)
      onPushRef.current?.(s)
    })
    void window.agentshed.getUpdateState().then((s) => {
      if (alive && !pushed) setState(s)
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return state
}
