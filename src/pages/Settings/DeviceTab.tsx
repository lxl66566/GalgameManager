import type { Device } from '@bindings/Device'
import { Input, SettingRow, SettingSection } from '@components/ui/settings'
import { VariableEditor } from '@components/VariableEditor'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { createResource, Show, Suspense, type Component } from 'solid-js'
import { unwrap } from 'solid-js/store'

export const DeviceTab: Component = () => {
  const { actions } = useConfig()
  const { t } = useI18n()

  const [device, { mutate }] = createResource(async () => {
    return await actions.getCurrentDeviceOrDefault()
  })

  // 2. 核心修改逻辑：克隆 -> 修改 -> 乐观更新 UI -> 提交到 Store
  const modifyDevice = async (modifier: (d: Device) => void) => {
    const current = device()
    if (!current) return

    // 第一步：深拷贝 (Deep Clone)
    // 使用 structuredClone 创建一个全新的、非 Proxy 的普通 JavaScript 对象。
    // 如果没有 unwrap，直接 structuredClone(current) 在现代浏览器通常也行，
    // 但加上 unwrap 是 SolidJS 的标准做法，确保剥离 Proxy。
    const next = structuredClone(unwrap(current))

    // 第二步：在副本上应用修改 (此时 next 是普通对象，可以随意修改)
    modifier(next)

    // 第三步：乐观更新 (Optimistic Update)
    // 将修改后的新对象塞回 Resource，触发 UI 更新
    mutate(next)

    await actions.updateCurrentDevice(next)
  }

  const handleNameChange = (name: string) => {
    modifyDevice(d => (d.name = name))
  }

  const handleAddVar = (key: string, value: string) => {
    modifyDevice(d => {
      // 确保 variables 对象存在
      if (!d.variables) d.variables = {}
      d.variables[key] = value
    })
  }

  const handleRemoveVar = (key: string) => {
    modifyDevice(d => {
      if (d.variables) delete d.variables[key]
    })
  }

  const handleUpdateVarValue = (key: string, val: string) => {
    modifyDevice(d => {
      if (d.variables) d.variables[key] = val
    })
  }

  const handleRenameVarKey = (oldKey: string, newKey: string) => {
    modifyDevice(d => {
      if (!d.variables) return
      const val = d.variables[oldKey]
      // 只有当旧值存在时才迁移
      if (val !== undefined) {
        delete d.variables[oldKey]
        d.variables[newKey] = val
      }
    })
  }

  return (
    <div class="max-w-4xl w-full mx-auto">
      <Suspense
        fallback={<div class="p-8 text-center text-gray-500">Loading device info...</div>}
      >
        <Show
          when={device()}
          fallback={<div class="p-8 text-center text-red-500">Device not found.</div>}
        >
          {dev => (
            <>
              <SettingSection title={t('settings.device.deviceIdentity')}>
                <SettingRow
                  label={t('settings.device.deviceName')}
                  description={t('settings.device.deviceNameAlias')}
                >
                  <Input
                    value={dev().name}
                    onChange={e => handleNameChange(e.currentTarget.value)}
                    class="max-w-xs"
                  />
                </SettingRow>

                <SettingRow
                  label={t('settings.device.uuid')}
                  description={t('settings.device.uuidDesc')}
                >
                  <div class="flex items-center gap-2">
                    <code class="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400 select-all">
                      {dev().uid}
                    </code>
                  </div>
                </SettingRow>
              </SettingSection>

              <SettingSection title={t('settings.device.variables')}>
                <div class="p-4">
                  <VariableEditor
                    variables={dev().variables || {}}
                    onAdd={handleAddVar}
                    onRemove={handleRemoveVar}
                    onUpdateValue={handleUpdateVarValue}
                    onRenameKey={handleRenameVarKey}
                  />
                </div>
              </SettingSection>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  )
}
