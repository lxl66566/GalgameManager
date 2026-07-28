/**
 * Creates a debounced version of `fn`. The returned function delays invoking
 * `fn` until `delay` ms have elapsed since the last call; multiple calls within
 * the window coalesce into a single trailing invocation.
 *
 * The returned function also exposes a `cancel()` method to clear any pending
 * invocation.
 */
export function debounce<Args extends unknown[]>(
  function_: (...args: Args) => void,
  delay: number
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      function_(...args)
    }, delay)
  }
  debounced.cancel = () => {
    if (!timer) {
      return
    }

    clearTimeout(timer)
    timer = undefined
  }
  return debounced
}
