/**
 * 支持在窗口获得焦点后再执行操作
 */

import { getCurrentWindow } from '@tauri-apps/api/window'
import { log } from '@utils/log'

const pending: (() => void)[] = []
let isListenerInitialized = false

/** fn() 为需要在获得焦点后再执行的操作 */
export function showOrDefer(function_: () => void): void {
  if (document.hasFocus()) {
    function_()
  } else {
    pending.push(function_)
    ensureListener()
  }
}

async function ensureListener(): Promise<void> {
  if (isListenerInitialized) return
  isListenerInitialized = true
  try {
    await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || pending.length === 0) return
      void flush()
    })
  } catch (error) {
    isListenerInitialized = false
    log.error(`Focus listener failed: ${error}`)
  }
}

// Drain the pending queue only when the window is focused, visible, and
// not minimized — a minimized/hidden window means the user isn't watching,
// so toasts would go unnoticed.
async function flush(): Promise<void> {
  const w = getCurrentWindow()
  const [visible, minimized] = await Promise.all([w.isVisible(), w.isMinimized()])
  if (!visible || minimized) return
  for (const show of pending) show()
  pending.length = 0
}
