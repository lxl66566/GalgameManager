import type { S3Config } from '@bindings/S3Config'
import type { WebDavConfig } from '@bindings/WebDavConfig'
import {
  Input,
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup
} from '@components/ui/settings'
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
        placeholder="https://s3.us-east-1.amazonaws.com"
      />
    </SettingRow>
    <SettingRow label="Region" indent>
      <Input
        class="w-32"
        value={props.config.region}
        onInput={e => props.onChange('region', e.currentTarget.value)}
        placeholder="us-east-1"
      />
    </SettingRow>
    <SettingRow label="Bucket Name" indent>
      <Input
        value={props.config.bucket}
        onInput={e => props.onChange('bucket', e.currentTarget.value)}
        placeholder="my-game-saves"
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
        placeholder="D:/Backups"
      />
    </SettingRow>
  </SettingSubGroup>
)

// --- 主组件 ---
export const StorageTab: Component = () => {
  const { config, actions } = useConfig()

  const currentBackendType = createMemo(() => config.settings.storage.backend.type)

  const handleProviderChange = (e: Event) => {
    const newType = (e.target as HTMLSelectElement).value

    actions.updateSettings(s => {
      if (newType === 'webDav') {
        s.storage.backend = {
          type: 'webDav',
          config: { endpoint: '', username: '', password: '', rootPath: '' }
        }
      } else if (newType === 's3') {
        s.storage.backend = {
          type: 's3',
          config: {
            endpoint: '',
            region: 'auto',
            bucket: '',
            accessKey: '',
            secretKey: ''
          }
        }
      } else if (newType === 'local') {
        s.storage.backend = {
          type: 'local',
          config: '' // Local config 是一个字符串路径
        }
      }
    })
  }

  // 通用的对象型配置更新 (WebDAV, S3)
  const updateBackendObjectConfig = <T extends WebDavConfig | S3Config>(
    key: keyof T,
    value: string
  ) => {
    actions.updateSettings(s => {
      // 仅当当前类型不是 local 时才执行对象属性赋值
      if (s.storage.backend.type !== 'local') {
        ;(s.storage.backend.config as any)[key] = value
      }
    })
  }

  // 专用的 Local 路径更新
  const updateLocalPath = (value: string) => {
    actions.updateSettings(s => {
      if (s.storage.backend.type === 'local') {
        s.storage.backend.config = value
      }
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
            value={currentBackendType()}
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
          <Match when={currentBackendType() === 'local'}>
            <LocalForm
              // 此时 config 是 string
              path={(config.settings.storage.backend as any).config}
              onChange={updateLocalPath}
            />
          </Match>

          {/* WebDAV Case */}
          <Match when={currentBackendType() === 'webDav'}>
            <WebDavForm
              config={(config.settings.storage.backend as any).config}
              onChange={(k, v) => updateBackendObjectConfig<WebDavConfig>(k, v)}
            />
          </Match>

          {/* S3 Case */}
          <Match when={currentBackendType() === 's3'}>
            <S3Form
              config={(config.settings.storage.backend as any).config}
              onChange={(k, v) => updateBackendObjectConfig<S3Config>(k, v)}
            />
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
              { label: 'None', value: 'none' }
            ]}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
