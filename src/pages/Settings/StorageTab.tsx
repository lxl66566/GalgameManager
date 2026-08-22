import type { ArchiveAlgo } from '@bindings/ArchiveAlgo'
import type { ArchiveConfig } from '@bindings/ArchiveConfig'
import type { S3Config } from '@bindings/S3Config'
import type { StorageProvider } from '@bindings/StorageProvider'
import type { WebDavConfig } from '@bindings/WebDavConfig'
import { FieldHint } from '@components/ui/FieldHint'
import {
  Button,
  Input,
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup
} from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { debounce } from '@utils/debounce'
import { useVarWarning } from '@utils/useVarWarning'
import { FiDownload, FiLoader, FiUpload } from 'solid-icons/fi'
import { createMemo, createSignal, Match, onCleanup, Show, Switch, type Component } from 'solid-js'

import { useI18n } from '~/i18n'
import { checkAndPullRemote, performManualUpload, useConfig } from '~/store'

// Keyed by ArchiveAlgo (a finite union), not `string`: with
// noUncheckedIndexedAccess a Record<string, T> lookup returns T | undefined
// even on the `?? fallback` branch, polluting every downstream use. A finite
// key union makes each access a concrete property lookup (always defined).
const COMPRESSION_RULES: Record<
  ArchiveAlgo,
  { disabled: boolean; max: number; min: number }
> = {
  squashfsZstd: { disabled: false, max: 22, min: 1 }, // Zstd 通常 1-22
  tar: { disabled: true, max: 0, min: 0 } // Tar 通常仅归档不压缩，禁用等级
}

// --- 子组件：WebDAV 表单 ---
const WebDavForm: Component<{
  config: WebDavConfig
  onChange: (key: keyof WebDavConfig, value: string) => void
}> = props => {
  const { t } = useI18n()

  return (
    <SettingSubGroup>
      <SettingRow indent label={t('settings.storage.Endpoint')}>
        <Input
          onChange={e => {
            props.onChange('endpoint', e.currentTarget.value)
          }}
          placeholder="https://dav.example.com"
          value={props.config.endpoint}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.Username')}>
        <Input
          onChange={e => {
            props.onChange('username', e.currentTarget.value)
          }}
          value={props.config.username}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.Password')}>
        <Input
          onChange={e => {
            props.onChange('password', e.currentTarget.value)
          }}
          type="password"
          value={props.config.password ?? ''}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.Root')}>
        <Input
          onChange={e => {
            props.onChange('rootPath', e.currentTarget.value)
          }}
          placeholder=""
          value={props.config.rootPath}
        />
      </SettingRow>
    </SettingSubGroup>
  )
}

// --- 子组件：S3 表单 ---
const S3Form: Component<{
  config: S3Config
  onChange: (key: keyof S3Config, value: string) => void
}> = props => {
  const { t } = useI18n()
  return (
    <SettingSubGroup>
      <SettingRow
        description={t('settings.storage.s3EndpointDesc')}
        indent
        label={t('settings.storage.Endpoint')}
      >
        <Input
          onChange={e => {
            props.onChange('endpoint', e.currentTarget.value)
          }}
          placeholder=""
          value={props.config.endpoint ?? ''}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.s3Region')}>
        <Input
          class="w-32"
          onChange={e => {
            props.onChange('region', e.currentTarget.value)
          }}
          placeholder=""
          value={props.config.region}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.s3Bucket')}>
        <Input
          onChange={e => {
            props.onChange('bucket', e.currentTarget.value)
          }}
          placeholder=""
          value={props.config.bucket}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.s3AccessKey')}>
        <Input
          onChange={e => {
            props.onChange('accessKey', e.currentTarget.value)
          }}
          type="password"
          value={props.config.accessKey}
        />
      </SettingRow>
      <SettingRow indent label={t('settings.storage.s3SecretKey')}>
        <Input
          onChange={e => {
            props.onChange('secretKey', e.currentTarget.value)
          }}
          type="password"
          value={props.config.secretKey}
        />
      </SettingRow>
    </SettingSubGroup>
  )
}

// --- 新增子组件：Local 表单 ---
const LocalForm: Component<{
  onChange: (value: string) => void
  path: string
}> = props => {
  const { t } = useI18n()

  const variableWarning = useVarWarning(() => props.path)

  return (
    <SettingSubGroup>
      <SettingRow indent label={t('settings.storage.localPath')}>
        <Input
          onChange={e => {
            props.onChange(e.currentTarget.value)
          }}
          placeholder={t('hint.supportVar')}
          value={props.path}
        />
      </SettingRow>
      <Show when={variableWarning()}>
        <div class="px-3 pb-2">
          <FieldHint text={variableWarning()} variant="warning" />
        </div>
      </Show>
    </SettingSubGroup>
  )
}

const CompressionForm: Component<{
  actions: ReturnType<typeof useConfig>['actions']
  config: ArchiveConfig
}> = props => {
  const { t } = useI18n()

  const currentRule = createMemo(() => COMPRESSION_RULES[props.config.algorithm])

  // 优化：接收 Event 对象以便直接操作 DOM
  const handleLevelChange = (
    e: Event & {
      currentTarget: HTMLInputElement
      target: HTMLInputElement
    }
  ) => {
    const target = e.currentTarget
    const rule = currentRule()
    const rawValue = target.value

    // 1. 如果规则禁用，强制重置为默认/最小值
    if (rule.disabled) {
      const resetValue = rule.min
      props.actions.updateSettingsDebounced({ archive: { level: resetValue } })
      target.value = resetValue.toString() // 强制回填
      return
    }

    // 2. 解析与边界限制 (Clamping)
    let value = parseInt(rawValue)

    if (Number.isNaN(value)) {
      value = rule.min
    } else {
      if (value < rule.min) value = rule.min
      if (value > rule.max) value = rule.max
    }

    // 3. 更新 Store（debounce 磁盘写入）
    props.actions.updateSettingsDebounced({ archive: { level: value } })

    // 4. 关键步骤：如果 DOM 显示的值与计算后的值不一致，手动强制回填
    // 这解决了 "输入99 -> Store保持22 -> 界面仍显示99" 的问题
    if (target.value !== value.toString()) {
      target.value = value.toString()
    }
  }

  return (
    <SettingSection title={t('settings.compression.self')}>
      <SettingRow indent label={t('settings.compression.algorithm')}>
        <Select
          onChange={e => {
            props.actions.updateSettings({
              archive: { algorithm: e.currentTarget.value as ArchiveAlgo }
            })
          }}
          options={[
            { label: 'Squashfs + Zstd', value: 'squashfsZstd' },
            { label: 'tar', value: 'tar' }
          ]}
          value={props.config.algorithm}
        />
      </SettingRow>

      <SettingRow indent label={t('settings.compression.level')}>
        <Input
          disabled={currentRule().disabled}
          max={currentRule().max}
          // 增加 min/max 属性辅助浏览器原生校验 UI
          min={currentRule().min}
          // 传入事件对象 e，而不是 e.currentTarget.value
          onChange={e => {
            handleLevelChange(e)
          }}
          placeholder={
            currentRule().disabled ? 'N/A' : `${currentRule().min}-${currentRule().max}`
          }
          type="number" // 建议加上 type="number"
          value={currentRule().disabled ? '' : props.config.level}
        />
      </SettingRow>
    </SettingSection>
  )
}

// --- 主组件 ---

export const StorageTab: Component = () => {
  const { actions, config } = useConfig()
  const { t } = useI18n()

  // 获取当前的 provider 字符串
  const currentProvider = () => config.settings.storage.provider

  // Debounced operator cache invalidation: avoids an IPC call per keystroke
  // while editing storage connection fields. The returned promise is
  // intentionally ignored (fire-and-forget cleanup).
  const cleanOperatorDebounced = debounce(
    () => void invoke('clean_current_operator'),
    500
  )
  // Drop a pending IPC when the tab is unmounted (e.g. user switches tabs
  // mid-typing) — the debounced call must not fire after disposal.
  onCleanup(() => {
    cleanOperatorDebounced.cancel()
  })

  // 切换 Provider：只修改 provider 字段，不触碰具体配置
  const handleProviderChange = (e: Event) => {
    const newProvider = (e.target as HTMLSelectElement).value as StorageProvider
    actions.updateSettings({ storage: { provider: newProvider } })
    void invoke('clean_current_operator')
  }

  // 更新 WebDAV 配置（文本输入，debounce 磁盘写入）
  const updateWebDav = (key: keyof WebDavConfig, value: string) => {
    actions.updateSettingsDebounced({ storage: { webdav: { [key]: value } } })
    cleanOperatorDebounced()
  }

  // 更新 S3 配置（文本输入，debounce 磁盘写入）
  const updateS3 = (key: keyof S3Config, value: string) => {
    actions.updateSettingsDebounced({ storage: { s3: { [key]: value } } })
    cleanOperatorDebounced()
  }

  // 更新 Local 配置（文本输入，debounce 磁盘写入）
  const updateLocal = (value: string) => {
    actions.updateSettingsDebounced({ storage: { local: { path: value } } })
    cleanOperatorDebounced()
  }

  // 上传配置
  const [uploading, setUploading] = createSignal(false)
  const handleUploadConfig = async () => {
    setUploading(true)
    await performManualUpload(t)
    setUploading(false)
  }
  const [downloading, setDownloading] = createSignal(false)
  const handleDownloadConfig = async () => {
    setDownloading(true)
    await checkAndPullRemote(t, true)
    setDownloading(false)
  }

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('settings.storage.self')}>
        <SettingRow class="relative z-10" label={t('settings.storage.provider')}>
          <Select
            onChange={handleProviderChange}
            options={[
              { label: t('settings.storage.none'), value: 'none' },
              { label: t('settings.storage.localStorage'), value: 'local' },
              { label: 'WebDAV', value: 'webDav' },
              { label: 'S3', value: 's3' }
            ]}
            value={currentProvider()}
          />
        </SettingRow>

        <Switch>
          {/* Local Case */}
          <Match when={currentProvider() === 'local'}>
            <LocalForm onChange={updateLocal} path={config.settings.storage.local.path} />
          </Match>

          {/* WebDAV Case */}
          <Match when={currentProvider() === 'webDav'}>
            <WebDavForm config={config.settings.storage.webdav} onChange={updateWebDav} />
          </Match>

          {/* S3 Case */}
          <Match when={currentProvider() === 's3'}>
            <S3Form config={config.settings.storage.s3} onChange={updateS3} />
          </Match>
        </Switch>

        <SettingRow
          description={t('settings.storage.ioTimeoutDesc')}
          label={t('settings.storage.ioTimeout')}
        >
          <Input
            onChange={e => {
              actions.updateSettingsDebounced({
                syncIoTimeoutSecs: parseInt(e.currentTarget.value) || 60
              })
            }}
            placeholder="60"
            type="number"
            value={config.settings.syncIoTimeoutSecs}
          />
        </SettingRow>
        <SettingRow
          description={t('settings.storage.nonIoTimeoutDesc')}
          label={t('settings.storage.nonIoTimeout')}
        >
          <Input
            onChange={e => {
              actions.updateSettingsDebounced({
                syncNonIoTimeoutSecs: parseInt(e.currentTarget.value) || 15
              })
            }}
            placeholder="15"
            type="number"
            value={config.settings.syncNonIoTimeoutSecs}
          />
        </SettingRow>
      </SettingSection>

      <CompressionForm actions={actions} config={config.settings.archive} />

      <SettingSection title={t('settings.config.self')}>
        <SettingRow
          description={t('settings.config.autoSyncIntervalDesc')}
          label={t('settings.config.autoSyncInterval')}
        >
          <Input
            onChange={e => {
              actions.updateSettingsDebounced({
                autoSyncInterval: parseInt(e.currentTarget.value)
              })
            }}
            placeholder={t('settings.config.autoSyncIntervalPlaceholder')}
            value={config.settings.autoSyncInterval}
          />
        </SettingRow>
        <SettingRow
          description={t('settings.config.forceOp')}
          label={t('settings.config.manualSync')}
        >
          {/* Matches the Input width (w-64) above: two flex-1 buttons */}
          <div class="flex w-64 gap-2">
            <Button
              class="flex-1"
              disabled={uploading()}
              onClick={handleUploadConfig}
            >
              <Show
                fallback={<FiLoader class="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                when={!uploading()}
              >
                <FiUpload class="mr-1.5 h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              </Show>
              {uploading() ? t('ui.syncing') : t('ui.push')}
            </Button>

            <Button
              class="flex-1"
              disabled={downloading()}
              onClick={handleDownloadConfig}
            >
              <Show
                fallback={<FiLoader class="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                when={!downloading()}
              >
                <FiDownload class="mr-1.5 h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              </Show>
              {downloading() ? t('ui.syncing') : t('ui.pull')}
            </Button>
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  )
}
