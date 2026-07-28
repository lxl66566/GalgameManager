/**
 * Resolve `<i18n.key>` tokens in backend-provided strings.
 *
 * Backend messages may contain `<i18n.key>` tokens which are replaced with
 * the translated string. Everything outside `<>` is kept as-is. Nested or
 * unclosed tags are left untouched.
 *
 * Example: `"AutoUpload: <hint.syncFailed>game X"` → `"AutoUpload: 同步失败: game X"`
 *
 * Kept dependency-free (the translator is just `(key) => string`) so it can be
 * unit-tested in isolation without pulling in the i18n provider or any JSX.
 */

export function resolveBackendI18n(raw: string, t: (key: string) => string): string {
  return raw.replaceAll(/<([\w.]+)>/g, (_match, key: string) => t(key))
}
