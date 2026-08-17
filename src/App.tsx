import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
  useColorMode
} from '@kobalte/core'
import { Navigate, Route, Router } from '@solidjs/router'
import { BiRegularBarChartSquare, BiRegularExtension } from 'solid-icons/bi'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import {
  createEffect,
  createSignal,
  lazy,
  Show,
  type Component,
  type JSX
} from 'solid-js'
import { Toaster } from 'solid-toast'

import { I18nProvider, useI18n, type Locale } from './i18n'
import Game from './pages/Game'
import { Sidebar, SidebarItem } from './Sidebar'
import { checkAndPullRemote, performAutoUpload, useConfig, useConfigInit } from './store'
import { useAutoUploadService } from './store/AutoUploadService'
import { initGameRuntime } from './store/gameRuntime'

// 路由级代码分割（字符串字面量动态 import，类型完全静态可推导）：
// Game 是默认路由保持静态引入；Statistics（d3）、Settings、Plugin 及其
// 独占的 kobalte 组件推迟到首次切换时才加载/执行，降低首屏 JS 体积。
const Statistics = lazy(() => import('./pages/Statistics'))
const Plugin = lazy(() => import('./pages/Plugin'))
const Settings = lazy(() => import('./pages/Settings'))

// Persistent shell: stays mounted across route changes (it's the router
// root), so the sidebar and all startup side effects run once.
const MainLayout: Component<{ children?: JSX.Element }> = props => {
  const { config } = useConfig()
  const { setLocale, t } = useI18n()
  const { colorMode, setColorMode } = useColorMode()
  const [isServiceReady, setServiceReady] = createSignal(false)

  useConfigInit(t, () => {
    // onReady 在 useConfigInit 的 init() 完成（至少一次 await）后触发，
    // 此时 SolidJS 的所有同步 effects（含 Toaster 的 mergeContainerOptions
    // 与 colorMode 的 dark class 同步）都已执行，首个 toast 位置/主题才正确。
    // 同时此处 config 已是真实值，避免基于 DEFAULT_CONFIG 误判 storage.provider。
    void (async () => {
      try {
        await checkAndPullRemote(t)
      } finally {
        setServiceReady(true)
      }
    })()
  })

  // Recover running-game state once at startup; listeners live for the app
  // lifetime in the global runtime store.
  void initGameRuntime(t)

  useAutoUploadService({
    enabled: isServiceReady,
    execUploadFunc: async () => {
      await performAutoUpload(t)
    }
  })

  // config.appearance.theme 是跨设备同步的主题真相；kobalte 的 localStorage
  // 只是设备本地缓存（首帧已由 index.html 的 bootstrap 脚本对齐）。这里用
  // effect 把 config 主题同步到 kobalte，本地修改与远端同步下发的主题变更
  // 都会生效。
  createEffect(() => {
    setColorMode(config.settings.appearance.theme)
  })

  // 同步 Kobalte 状态到 HTML class
  createEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', colorMode() === 'dark')
  })

  createEffect(() => {
    const lang = config.settings.appearance.language
    if (lang) {
      setLocale(lang as Locale)
    }
  })

  return (
    <>
      <Sidebar>
        <SidebarItem
          href="/Game"
          icon={<CgGames class="h-6 w-6" />}
          label={t('sidebar.game')}
        />
        <SidebarItem
          href="/Plugin"
          icon={<BiRegularExtension class="h-6 w-6" />}
          label={t('sidebar.plugin')}
        />
        <Show when={config.settings.launch.dailyStat}>
          <SidebarItem
            href="/Statistics"
            icon={<BiRegularBarChartSquare class="h-6 w-6" />}
            label={t('sidebar.statistics')}
          />
        </Show>
        <SidebarItem
          href="/Settings"
          icon={<IoSettingsOutline class="h-6 w-6" />}
          label={t('sidebar.settings')}
        />
      </Sidebar>

      {/* 让页面内容自己处理 overflow 滚动 */}
      <div class="relative h-full min-w-0 flex-1 overflow-hidden p-0 transition-colors duration-200 dark:bg-slate-800 dark:text-gray-400">
        {props.children}
      </div>
    </>
  )
}

const App: Component = () => {
  const storageManager = createLocalStorageManager('vite-ui-theme')

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-white text-gray-900 dark:bg-slate-900 dark:text-gray-100">
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <I18nProvider>
          <Router root={MainLayout}>
            <Route component={Game} path="/Game" />
            <Route component={() => <Navigate href="/Game" />} path="/" />
            <Route component={Statistics} path="/Statistics" />
            <Route component={Plugin} path="/Plugin" />
            <Route component={Settings} path="/Settings" />
          </Router>
          <Toaster
            position="bottom-left"
            toastOptions={{
              className: `
                !bg-white !text-gray-900 
                dark:!bg-slate-800 dark:!text-gray-100
                border border-gray-200 dark:border-slate-700
                shadow-lg rounded-md
              `
            }}
          />
        </I18nProvider>
      </ColorModeProvider>
    </div>
  )
}

export default App
