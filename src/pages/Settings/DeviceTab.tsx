import type { Device } from '@bindings/Device'
import { FormTableEditor } from '@components/ui/FormTableEditor'
import { Input, SettingRow, SettingSection } from '@components/ui/settings'
import { log } from '@utils/log'
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
  const modifyDevice = async (
    modifier: (d: Device) => void,
    commit: (device: Device) => Promise<void>
  ) => {
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
    await commit(next)
  }

  // 设备名是文本输入，debounce 磁盘写入
  const handleNameChange = (name: string) => {
    void modifyDevice(
      d => (d.name = name),
      d => actions.updateCurrentDeviceDebounced(d)
    )
  }

  // 变量表是表单提交（非频繁回调），立即写入
  const handleVariablesCommit = (newVariables: Record<string, string>) => {
    void modifyDevice(
      d => (d.variables = newVariables),
      d => actions.updateCurrentDevice(d)
    )
    log.info('Variables updated')
  }

  return (
    <div class="max-w-4xl w-full mx-auto">
      <Suspense
        fallback={
          <div class="p-8 text-center text-gray-500">
            {t('settings.device.loadingInfo')}
          </div>
        }
      >
        <Show
          fallback={
            <div class="p-8 text-center text-red-500">
              {t('settings.device.notFound')}
            </div>
          }
          when={device()}
        >
          {development => (
            <>
              <SettingSection title={t('settings.device.deviceIdentity')}>
                <SettingRow
                  description={t('settings.device.deviceNameAlias')}
                  label={t('settings.device.deviceName')}
                >
                  <Input
                    class="max-w-xs"
                    onChange={e => {
                      handleNameChange(e.currentTarget.value)
                    }}
                    value={development().name}
                  />
                </SettingRow>

                <SettingRow
                  description={t('settings.device.uuidDesc')}
                  label={t('settings.device.uuid')}
                >
                  <div class="flex items-center gap-2">
                    <code class="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400 select-all">
                      {development().uid}
                    </code>
                  </div>
                </SettingRow>
              </SettingSection>

              <SettingSection title={t('settings.device.variables')}>
                <div class="p-4">
                  <FormTableEditor
                    addLabel={t('settings.device.addVariable')}
                    description={t('settings.device.variablesDesc')}
                    emptyText={t('settings.device.noVariablesDefined')}
                    label={t('settings.device.variables')}
                    onCommit={handleVariablesCommit}
                    values={development().variables || {}}
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
