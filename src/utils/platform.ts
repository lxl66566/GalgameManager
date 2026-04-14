/**
 * Platform detection utilities for the Tauri webview.
 *
 * Uses `navigator.platform` which is deterministic at startup — no async
 * calls needed. In Tauri v2 the webview reports:
 *   - "Win32"  → Windows
 *   - "MacIntel" → macOS
 *   - "Linux …"  → Linux
 */

const _pf = navigator.platform

/** `true` when running on Windows. */
export const isWindows: boolean = _pf === 'Win32'
/** `true` when running on macOS. */
export const isMac: boolean = _pf === 'MacIntel'
/** `true` when running on Linux. */
export const isLinux: boolean = _pf.startsWith('Linux')
