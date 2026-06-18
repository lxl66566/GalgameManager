/// Stub for `@tauri-apps/api/event`.

export type UnlistenFn = () => void

export async function listen<T = unknown>(
  _event: string,
  _handler: (event: { payload: T }) => void
): Promise<UnlistenFn> {
  return () => {}
}

export async function once<T = unknown>(
  _event: string,
  _handler: (event: { payload: T }) => void
): Promise<UnlistenFn> {
  return () => {}
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {}
