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

// Route-level code splitting (string-literal dynamic imports only, so types
// stay fully static). Game is the default route and stays eager; Statistics
// (d3), Settings and Plugin plus their exclusive kobalte components are
// deferred to first visit to shrink the initial bundle.
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
    // onReady fires after init()'s first await, so all synchronous SolidJS
    // effects (Toaster mergeContainerOptions, colorMode dark class) have run
    // and the first toast gets the right position/theme. config is real here,
    // avoiding a misjudged storage.provider based on DEFAULT_CONFIG.
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

  // config.appearance.theme is the cross-device source of truth; kobalte's
  // localStorage is only a per-device cache (already aligned by the bootstrap
  // script in index.html before first paint). This effect syncs config theme
  // into kobalte so both local edits and remote-synced changes take effect.
  createEffect(() => {
    setColorMode(config.settings.appearance.theme)
  })

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

      {/* Pages handle their own overflow scrolling */}
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
