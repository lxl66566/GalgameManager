/// Stub for `@tauri-apps/api/core`.
///
/// The real module talks to the Tauri IPC bridge which doesn't exist
/// outside of a running Tauri window. These stubs keep imports from
/// throwing at module-load time and let individual tests override
/// behaviour with `vi.mock('@tauri-apps/api/core', ...)` when they
/// actually need to assert on `invoke()` calls.

export function invoke<T = unknown>(
  _cmd: string,
  _args?: Record<string, unknown>
): Promise<T> {
  return Promise.reject(
    new Error(
      `invoke() stub called in test without a mock — implement vi.mock for command "${_cmd}"`
    )
  )
}

export const convertFileSrc = (filePath: string): string => filePath
