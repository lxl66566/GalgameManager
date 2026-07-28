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
import { createEffect, createSignal, Show, type Component, type JSX } from 'solid-js'
import { Toaster } from 'solid-toast'
import { I18nProvider, useI18n, type Locale } from './i18n'
import Game from './pages/Game'
import Plugin from './pages/Plugin'
import Settings from './pages/Settings'
import Statistics from './pages/Statistics'
import { Sidebar, SidebarItem } from './Sidebar'
import { checkAndPullRemote, performAutoUpload, useConfig, useConfigInit } from './store'
import { useAutoUploadService } from './store/AutoUploadService'
import { initGameRuntime } from './store/gameRuntime'

// Persistent shell: stays mounted across route changes (it's the router
// root), so the sidebar and all startup side effects run once.
const MainLayout: Component<{ children?: JSX.Element }> = props => {
  const { config } = useConfig()
  const { setLocale, t } = useI18n()
  const { colorMode } = useColorMode()
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
          icon={<CgGames class="w-6 h-6" />}
          label={t('sidebar.game')}
        />
        <SidebarItem
          href="/Plugin"
          icon={<BiRegularExtension class="w-6 h-6" />}
          label={t('sidebar.plugin')}
        />
        <Show when={config.settings.launch.dailyStat}>
          <SidebarItem
            href="/Statistics"
            icon={<BiRegularBarChartSquare class="w-6 h-6" />}
            label={t('sidebar.statistics')}
          />
        </Show>
        <SidebarItem
          href="/Settings"
          icon={<IoSettingsOutline class="w-6 h-6" />}
          label={t('sidebar.settings')}
        />
      </Sidebar>

      {/* 让页面内容自己处理 overflow 滚动 */}
      <div class="flex-1 min-w-0 p-0 dark:bg-slate-800 dark:text-gray-400 h-full overflow-hidden relative transition-colors duration-200">
        {props.children}
      </div>
    </>
  )
}

const App: Component = () => {
  const storageManager = createLocalStorageManager('vite-ui-theme')

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100">
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
