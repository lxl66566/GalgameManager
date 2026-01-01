import type { ArchiveAlgo } from '@bindings/ArchiveAlgo'
import type { ArchiveConfig } from '@bindings/ArchiveConfig'
import type { S3Config } from '@bindings/S3Config'
import type { StorageProvider } from '@bindings/StorageProvider'
import type { WebDavConfig } from '@bindings/WebDavConfig'
import {
  Button,
  Input,
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup
} from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '~/i18n'
import { checkAndPullRemote, performUpload, useConfig } from '~/store'
import { FiDownload, FiLoader, FiUpload } from 'solid-icons/fi'
import { createMemo, createSignal, Match, Show, Switch, type Component } from 'solid-js'

const COMPRESSION_RULES: Record<string, { min: number; max: number; disabled: boolean }> =
  {
    squashfsZstd: { min: 1, max: 22, disabled: false }, // Zstd 通常 1-22
    tar: { min: 0, max: 0, disabled: true } // Tar 通常仅归档不压缩，禁用等级
  }

// --- 子组件：WebDAV 表单 ---
const WebDavForm: Component<{
  config: WebDavConfig
  onChange: (key: keyof WebDavConfig, value: string) => void
}> = props => {
  const { t } = useI18n()

  return (
    <SettingSubGroup>
      <SettingRow label={t('settings.storage.Endpoint')} indent>
        <Input
          value={props.config.endpoint}
          onChange={e => props.onChange('endpoint', e.currentTarget.value)}
          placeholder="https://dav.example.com"
        />
      </SettingRow>
      <SettingRow label={t('settings.storage.Username')} indent>
        <Input
          value={props.config.username}
          onChange={e => props.onChange('username', e.currentTarget.value)}
        />
      </SettingRow>
      <SettingRow label={t('settings.storage.Password')} indent>
        <Input
          type="password"
          value={props.config.password || ''}
          onChange={e => props.onChange('password', e.currentTarget.value)}
        />
      </SettingRow>
      <SettingRow label={t('settings.storage.Root')} indent>
        <Input
          value={props.config.rootPath}
          onChange={e => props.onChange('rootPath', e.currentTarget.value)}
          placeholder=""
        />
      </SettingRow>
    </SettingSubGroup>
  )
}

// --- 子组件：S3 表单 ---
const S3Form: Component<{
  config: S3Config
  onChange: (key: keyof S3Config, value: string) => void
}> = props => (
  <SettingSubGroup>
    <SettingRow label="Endpoint" description="Leave empty for AWS" indent>
      <Input
        value={props.config.endpoint || ''}
        onChange={e => props.onChange('endpoint', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
    <SettingRow label="Region" indent>
      <Input
        class="w-32"
        value={props.config.region}
        onChange={e => props.onChange('region', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
    <SettingRow label="Bucket Name" indent>
      <Input
        value={props.config.bucket}
        onChange={e => props.onChange('bucket', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
    <SettingRow label="Access Key" indent>
      <Input
        type="password"
        value={props.config.accessKey}
        onChange={e => props.onChange('accessKey', e.currentTarget.value)}
      />
    </SettingRow>
    <SettingRow label="Secret Key" indent>
      <Input
        type="password"
        value={props.config.secretKey}
        onChange={e => props.onChange('secretKey', e.currentTarget.value)}
      />
    </SettingRow>
  </SettingSubGroup>
)

// --- 新增子组件：Local 表单 ---
const LocalForm: Component<{
  path: string
  onChange: (value: string) => void
}> = props => {
  const { t } = useI18n()
  return (
    <SettingSubGroup>
      <SettingRow label={t('settings.storage.localPath')} indent>
        <Input
          value={props.path}
          onChange={e => props.onChange(e.currentTarget.value)}
          placeholder={t('hint.supportVar')}
        />
      </SettingRow>
    </SettingSubGroup>
  )
}

const CompressionForm: Component<{
  config: ArchiveConfig
  actions: ReturnType<typeof useConfig>['actions']
}> = props => {
  const { t } = useI18n()

  const currentRule = createMemo(
    () => COMPRESSION_RULES[props.config.algorithm] ?? COMPRESSION_RULES['squashfsZstd']
  )

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
      const resetVal = rule.min
      props.actions.updateSettings(s => (s.archive.level = resetVal))
      target.value = resetVal.toString() // 强制回填
      return
    }

    // 2. 解析与边界限制 (Clamping)
    let val = parseInt(rawValue)

    if (isNaN(val)) {
      val = rule.min
    } else {
      if (val < rule.min) val = rule.min
      if (val > rule.max) val = rule.max
    }

    // 3. 更新 Store
    props.actions.updateSettings(s => (s.archive.level = val))

    // 4. 关键步骤：如果 DOM 显示的值与计算后的值不一致，手动强制回填
    // 这解决了 "输入99 -> Store保持22 -> 界面仍显示99" 的问题
    if (target.value !== val.toString()) {
      target.value = val.toString()
    }
  }

  return (
    <SettingSection title={t('settings.compression.self')}>
      <SettingSubGroup>
        <SettingRow label={t('settings.compression.algorithm')} indent>
          <Select
            value={props.config.algorithm}
            onChange={e =>
              props.actions.updateSettings(
                s => (s.archive.algorithm = e.currentTarget.value as ArchiveAlgo)
              )
            }
            options={[
              { label: 'Squashfs + Zstd', value: 'squashfsZstd' },
              { label: 'tar', value: 'tar' }
            ]}
          />
        </SettingRow>

        <SettingRow label={t('settings.compression.level')} indent>
          <Input
            type="number" // 建议加上 type="number"
            value={currentRule().disabled ? '' : props.config.level}
            // 传入事件对象 e，而不是 e.currentTarget.value
            onChange={e => handleLevelChange(e)}
            disabled={currentRule().disabled}
            placeholder={
              currentRule().disabled ? 'N/A' : `${currentRule().min}-${currentRule().max}`
            }
            // 增加 min/max 属性辅助浏览器原生校验 UI
            min={currentRule().min}
            max={currentRule().max}
          />
        </SettingRow>
      </SettingSubGroup>
    </SettingSection>
  )
}

// --- 主组件 ---

export const StorageTab: Component = () => {
  const { config, actions } = useConfig()
  const { t } = useI18n()

  // 获取当前的 provider 字符串
  const currentProvider = () => config.settings.storage.provider

  // 切换 Provider：只修改 provider 字段，不触碰具体配置
  const handleProviderChange = (e: Event) => {
    const newProvider = (e.target as HTMLSelectElement).value as StorageProvider
    actions.updateSettings(s => {
      s.storage.provider = newProvider
    })
    invoke('clean_current_operator')
  }

  // 更新 WebDAV 配置
  const updateWebDav = (key: keyof WebDavConfig, value: string) => {
    actions.updateSettings(s => {
      s.storage.webdav[key] = value
    })
    invoke('clean_current_operator')
  }

  // 更新 S3 配置
  const updateS3 = (key: keyof S3Config, value: string) => {
    actions.updateSettings(s => {
      s.storage.s3[key] = value
    })
    invoke('clean_current_operator')
  }

  // 更新 Local 配置
  const updateLocal = (value: string) => {
    actions.updateSettings(s => {
      s.storage.local.path = value
    })
    invoke('clean_current_operator')
  }

  // 上传配置
  const [uploading, setUploading] = createSignal(false)
  const handleUploadConfig = async () => {
    setUploading(true)
    await performUpload(t, false)
    setUploading(false)
  }
  const [downloading, setDownloading] = createSignal(false)
  const handleDownloadConfig = async () => {
    setDownloading(true)
    await checkAndPullRemote(t, true, 'Force updated config from remote.')
    setDownloading(false)
  }

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('settings.storage.self')}>
        <SettingRow label={t('settings.storage.provider')} class="z-10 relative">
          <Select
            value={currentProvider()}
            onChange={handleProviderChange}
            options={[
              { label: t('settings.storage.none'), value: 'none' },
              { label: t('settings.storage.localStorage'), value: 'local' },
              { label: 'WebDAV', value: 'webDav' },
              { label: 'S3', value: 's3' }
            ]}
          />
        </SettingRow>

        <Switch>
          {/* Local Case */}
          <Match when={currentProvider() === 'local'}>
            <LocalForm path={config.settings.storage.local.path} onChange={updateLocal} />
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
      </SettingSection>

      <CompressionForm config={config.settings.archive} actions={actions} />

      <SettingSection title={t('settings.config.self')}>
        <SettingRow
          label={t('settings.config.autoSyncInterval')}
          description={t('settings.config.autoSyncIntervalDesc')}
        >
          <Input
            value={config.settings.autoSyncInterval}
            onChange={e =>
              actions.updateSettings(
                s => (s.autoSyncInterval = parseInt(e.currentTarget.value))
              )
            }
          />
        </SettingRow>
        <SettingRow
          label={t('settings.config.manualSync')}
          description={t('settings.config.forceOp')}
        >
          <Button
            onClick={handleUploadConfig}
            disabled={uploading()}
            class="min-w-[100px] mx-1" // 保证加载时宽度不跳动
          >
            <Show
              when={!uploading()}
              fallback={<FiLoader class="animate-spin h-3.5 w-3.5 mr-1.5" />}
            >
              <FiUpload class="h-3.5 w-3.5 mr-1.5 text-gray-500 dark:text-gray-400" />
            </Show>
            {uploading() ? 'Syncing...' : t('ui.push')}
          </Button>

          <Button
            onClick={handleDownloadConfig}
            disabled={downloading()}
            class="min-w-[100px] mx-1"
          >
            <Show
              when={!downloading()}
              fallback={<FiLoader class="animate-spin h-3.5 w-3.5 mr-1.5" />}
            >
              <FiDownload class="h-3.5 w-3.5 mr-1.5 text-gray-500 dark:text-gray-400" />
            </Show>
            {downloading() ? 'Syncing...' : t('ui.pull')}
          </Button>
        </SettingRow>
      </SettingSection>
    </div>
  )
}
