/// Stub for `@tauri-apps/plugin-fs`.

export enum BaseDirectory {
  AppConfig = 'AppConfig',
  AppData = 'AppData',
  AppLocalData = 'AppLocalData',
  AppCache = 'AppCache',
  AppLog = 'AppLog',
  Audio = 'Audio',
  Cache = 'Cache',
  Config = 'Config',
  Current = 'Current',
  Data = 'Data',
  Desktop = 'Desktop',
  Document = 'Document',
  Downloads = 'Downloads',
  Home = 'Home',
  LocalData = 'LocalData',
  Log = 'Log',
  Picture = 'Picture',
  Public = 'Public',
  Resource = 'Resource',
  Runtime = 'Runtime',
  Temp = 'Temp',
  Template = 'Template',
  Video = 'Video'
}

export async function readTextFile(_path: string, _options?: unknown): Promise<string> {
  throw new Error(`readTextFile stub called without a mock: ${_path}`)
}

export async function writeTextFile(
  _path: string,
  _contents: string,
  _options?: unknown
): Promise<void> {}

export async function readDir(_path: string, _options?: unknown): Promise<unknown[]> {
  return []
}

export async function exists(_path: string, _options?: unknown): Promise<boolean> {
  return false
}

export async function remove(_path: string, _options?: unknown): Promise<void> {}

export async function renameFile(
  _oldPath: string,
  _newPath: string,
  _options?: unknown
): Promise<void> {}
