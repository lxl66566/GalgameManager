// src/pages/settings/tabs/DeviceTab.tsx
import { Input, SettingRow, SettingSection } from '@components/ui/settings'
import { useConfig } from '~/store'
import { For, type Component } from 'solid-js'

export const DeviceTab: Component = () => {
  const { config, actions } = useConfig()

  const addVariable = () => {
    actions.updateSettings(s => {
      // 避免 key 冲突，生成临时 key
      s.currentDevice.variables['NEW_VAR_' + Date.now()] = ''
    })
  }

  const removeVariable = (key: string) => {
    actions.updateSettings(s => {
      delete s.currentDevice.variables[key]
    })
  }

  // 修改 Key 比较麻烦，通常建议删除重建，或者 UI 上做特殊处理
  // 这里简化为只修改 Value，Key 在创建时定好或用特殊 UI 修改
  const updateVarValue = (key: string, val: string) => {
    actions.updateSettings(s => {
      s.currentDevice.variables[key] = val
    })
  }

  return (
    <div class="max-w-4xl">
      <SettingSection title="Device Identity">
        <SettingRow label="Device Name">
          <Input
            value={config.settings.currentDevice.name}
            onInput={e =>
              actions.updateSettings(s => (s.currentDevice.name = e.currentTarget.value))
            }
          />
        </SettingRow>
        <SettingRow label="UUID" description="Unique ID for sync identification">
          <div class="text-sm font-mono text-gray-500">
            {config.settings.currentDevice.uuid}
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Path Variables">
        <div class="p-4 space-y-3">
          <div class="text-sm text-gray-500 mb-2">
            Define variables to use in game paths (e.g., <code>%STEAM_ROOT%</code>).
          </div>

          <div class="grid grid-cols-12 gap-2 font-medium text-xs text-gray-400 uppercase">
            <div class="col-span-4">Variable Name</div>
            <div class="col-span-7">Local Path</div>
            <div class="col-span-1"></div>
          </div>

          <For each={Object.entries(config.settings.currentDevice.variables)}>
            {([key, value]) => (
              <div class="grid grid-cols-12 gap-2 items-center">
                <div class="col-span-4">
                  <Input
                    disabled
                    value={key}
                    class="!w-full font-mono text-xs bg-gray-100 dark:bg-gray-800"
                  />
                </div>
                <div class="col-span-7">
                  <Input
                    value={value}
                    onInput={e => updateVarValue(key, e.currentTarget.value)}
                    class="!w-full font-mono text-xs"
                    placeholder="C:/Games/..."
                  />
                </div>
                <div class="col-span-1 flex justify-center">
                  <button
                    onClick={() => removeVariable(key)}
                    class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  ></button>
                </div>
              </div>
            )}
          </For>

          <div class="pt-2">
            {/* 实际实现中，添加变量应该是一个弹窗或者底部的输入行，输入 Key 和 Value 后确认 */}
            <button
              onClick={addVariable}
              class="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add Variable
            </button>
          </div>
        </div>
      </SettingSection>
    </div>
  )
}
