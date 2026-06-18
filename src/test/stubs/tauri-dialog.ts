/// Stub for `@tauri-apps/plugin-dialog`.

export async function open(_options?: unknown): Promise<string | string[] | null> {
  return null
}

export async function save(_options?: unknown): Promise<string | null> {
  return null
}

export async function message(_message: string, _options?: unknown): Promise<void> {}

export async function ask(_message: string, _options?: unknown): Promise<boolean> {
  return false
}

export async function confirm(_message: string, _options?: unknown): Promise<boolean> {
  return false
}
