/// Stub for `@tauri-apps/api/event`.

export type UnlistenFn = () => void

export async function emit(_event: string, _payload?: unknown): Promise<void> {}

// The single-use type parameter mirrors the real `@tauri-apps/api/event`
// signature (which has the same shape) so test call sites keep their
// `event.payload` typing. Disabling the rule locally preserves that
// ergonomics instead of forcing callers to cast from `unknown`.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export async function listen<T = unknown>(
  _event: string,
  _handler: (event: { payload: T }) => void
): Promise<UnlistenFn> {
  return () => {}
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export async function once<T = unknown>(
  _event: string,
  _handler: (event: { payload: T }) => void
): Promise<UnlistenFn> {
  return () => {}
}
