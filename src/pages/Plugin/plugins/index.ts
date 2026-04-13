/**
 * Plugin registry — collects all plugin definitions.
 *
 * ## Adding a new plugin
 * 1. Create a new file exporting a PluginDefinition<K> object.
 * 2. Import it below and add to the PLUGIN_REGISTRY array.
 */
import { AUTO_UPLOAD_PLUGIN } from './AutoUploadConfigEditor'
import { EXECUTE_PLUGIN } from './ExecuteConfigEditor'
import { GAME_WRAPPER_PLUGIN } from './GameWrapperConfigEditor'
import { LOCALE_EMULATOR_PLUGIN } from './LocaleEmulatorConfigEditor'
import { TRANSLATOR_PLUGIN } from './TranslatorConfigEditor'
import type { AnyPluginDef } from './types'
import { VOICE_SPEEDUP_PLUGIN } from './VoiceSpeedupConfigEditor'
import { VOICE_ZEROINTERRUPT_PLUGIN } from './VoiceZerointerruptConfigEditor'

export const PLUGIN_REGISTRY: readonly AnyPluginDef[] = [
  EXECUTE_PLUGIN,
  AUTO_UPLOAD_PLUGIN,
  GAME_WRAPPER_PLUGIN,
  LOCALE_EMULATOR_PLUGIN,
  TRANSLATOR_PLUGIN,
  VOICE_SPEEDUP_PLUGIN,
  VOICE_ZEROINTERRUPT_PLUGIN
]

export {
  type PluginInfo,
  type PluginDefinition,
  type ConfigEditorProps,
  type AnyPluginDef
} from './types'
export { EXECUTE_PLUGIN } from './ExecuteConfigEditor'
export { AUTO_UPLOAD_PLUGIN } from './AutoUploadConfigEditor'
export { GAME_WRAPPER_PLUGIN } from './GameWrapperConfigEditor'
export { LOCALE_EMULATOR_PLUGIN } from './LocaleEmulatorConfigEditor'
export { TRANSLATOR_PLUGIN } from './TranslatorConfigEditor'
export { VOICE_SPEEDUP_PLUGIN } from './VoiceSpeedupConfigEditor'
export { VOICE_ZEROINTERRUPT_PLUGIN } from './VoiceZerointerruptConfigEditor'
