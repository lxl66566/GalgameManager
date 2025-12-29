import type { S3Config } from '@bindings/S3Config'
import type { StorageProvider } from '@bindings/StorageProvider'
import type { WebDavConfig } from '@bindings/WebDavConfig'
import {
  Input,
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup
} from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { useConfig } from '~/store'
import { createMemo, Match, Switch, type Component } from 'solid-js'

// --- 子组件：WebDAV 表单 ---
const WebDavForm: Component<{
  config: WebDavConfig
  onChange: (key: keyof WebDavConfig, value: string) => void
}> = props => (
  <SettingSubGroup>
    <SettingRow label="Endpoint" indent>
      <Input
        value={props.config.endpoint}
        onInput={e => props.onChange('endpoint', e.currentTarget.value)}
        placeholder="https://dav.example.com"
      />
    </SettingRow>
    <SettingRow label="Username" indent>
      <Input
        value={props.config.username}
        onInput={e => props.onChange('username', e.currentTarget.value)}
      />
    </SettingRow>
    <SettingRow label="Password" indent>
      <Input
        type="password"
        value={props.config.password || ''}
        onInput={e => props.onChange('password', e.currentTarget.value)}
      />
    </SettingRow>
    <SettingRow label="Root" indent>
      <Input
        value={props.config.rootPath}
        onInput={e => props.onChange('rootPath', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
  </SettingSubGroup>
)

// --- 子组件：S3 表单 ---
const S3Form: Component<{
  config: S3Config
  onChange: (key: keyof S3Config, value: string) => void
}> = props => (
  <SettingSubGroup>
    <SettingRow label="Endpoint" description="Leave empty for AWS" indent>
      <Input
        value={props.config.endpoint || ''}
        onInput={e => props.onChange('endpoint', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
    <SettingRow label="Region" indent>
      <Input
        class="w-32"
        value={props.config.region}
        onInput={e => props.onChange('region', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
    <SettingRow label="Bucket Name" indent>
      <Input
        value={props.config.bucket}
        onInput={e => props.onChange('bucket', e.currentTarget.value)}
        placeholder=""
      />
    </SettingRow>
    <SettingRow label="Access Key" indent>
      <Input
        type="password"
        value={props.config.accessKey}
        onInput={e => props.onChange('accessKey', e.currentTarget.value)}
      />
    </SettingRow>
    <SettingRow label="Secret Key" indent>
      <Input
        type="password"
        value={props.config.secretKey}
        onInput={e => props.onChange('secretKey', e.currentTarget.value)}
      />
    </SettingRow>
  </SettingSubGroup>
)

// --- 新增子组件：Local 表单 ---
const LocalForm: Component<{
  path: string
  onChange: (value: string) => void
}> = props => (
  <SettingSubGroup>
    <SettingRow label="Path" description="Absolute path or path with variables" indent>
      <Input
        value={props.path}
        onInput={e => props.onChange(e.currentTarget.value)}
        placeholder="(None)"
      />
    </SettingRow>
  </SettingSubGroup>
)

// --- 主组件 ---

export const StorageTab: Component = () => {
  const { config, actions } = useConfig()

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
  }

  // 更新 S3 配置
  const updateS3 = (key: keyof S3Config, value: string) => {
    actions.updateSettings(s => {
      s.storage.s3[key] = value
    })
  }

  // 更新 Local 配置
  const updateLocal = (value: string) => {
    actions.updateSettings(s => {
      s.storage.local = value
    })
  }

  return (
    <div class="max-w-4xl">
      <SettingSection title="Storage Backend">
        <SettingRow
          label="Provider"
          description="Select where to sync your saves"
          class="z-10 relative"
        >
          <Select
            value={currentProvider()}
            onChange={handleProviderChange}
            options={[
              { label: 'Local Storage', value: 'local' },
              { label: 'WebDAV', value: 'webDav' },
              { label: 'S3 Compatible', value: 's3' }
            ]}
          />
        </SettingRow>

        <Switch>
          {/* Local Case */}
          <Match when={currentProvider() === 'local'}>
            <LocalForm path={config.settings.storage.local} onChange={updateLocal} />
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

      <SettingSection title="Compression">
        <SettingRow label="Algorithm">
          <Select
            value={config.settings.archive.algorithm}
            onChange={e =>
              actions.updateSettings(
                s => (s.archive.algorithm = e.currentTarget.value as any)
              )
            }
            options={[
              { label: 'Squashfs + Zstd', value: 'squashfsZstd' },
              { label: 'tar', value: 'tar' }
            ]}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
