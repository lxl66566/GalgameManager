/**
 * AutoUpload plugin — self-contained definition file.
 */
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { PluginDefinition } from './types'

export const AUTO_UPLOAD_PLUGIN: PluginDefinition<'autoUpload'> = {
  info: {
    id: 'autoUpload',
    nameKey: 'plugin.autoUpload.name',
    descriptionKey: 'plugin.autoUpload.description',
    version: '1.1.2',
    author: 'BUILTIN',
    links: []
  },
  metaKey: 'autoUpload',
  MetaEditor: AutoAddMetaEditor
}
