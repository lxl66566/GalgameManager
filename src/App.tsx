import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
  useColorMode
} from '@kobalte/core'
import { Route, Router, useLocation } from '@solidjs/router'
import { BiRegularExtension } from 'solid-icons/bi'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import { createEffect, createMemo, createSignal, onMount, type Component } from 'solid-js'
import { Toaster } from 'solid-toast'
import { I18nProvider, useI18n, type Locale } from './i18n'
import Game from './pages/Game'
import Plugin from './pages/Plugin'
import Settings from './pages/Settings'
import { Sidebar, SidebarItem } from './Sidebar'
import { checkAndPullRemote, performAutoUpload, useConfig, useConfigInit } from './store'
import { useAutoUploadService } from './store/AutoUploadService'

const MainLayout: Component = () => {
  const { config } = useConfig()
  const { t, setLocale } = useI18n()
  const { colorMode } = useColorMode()
  const [isServiceReady, setServiceReady] = createSignal(false)

  useConfigInit()

  checkAndPullRemote(t).finally(() => {
    setServiceReady(true)
  })
  useAutoUploadService({
    enabled: isServiceReady,
    execUploadFunc: async () => {
      await performAutoUpload(t)
    }
  })

  // 同步 Kobalte 状态到 HTML class
  createEffect(() => {
    const root = document.documentElement
    if (colorMode() === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  })

  createEffect(() => {
    const lang = config.settings?.appearance?.language
    if (lang) {
      setLocale(lang as Locale)
    }
  })

  return (
    <>
      <Sidebar>
        <SidebarItem
          label={t('sidebar.game')}
          icon={<CgGames class="w-6 h-6" />}
          href="/Game"
        />
        <SidebarItem
          label={t('sidebar.plugin')}
          icon={<BiRegularExtension class="w-6 h-6" />}
          href="/Plugin"
        />
        <SidebarItem
          label={t('sidebar.settings')}
          icon={<IoSettingsOutline class="w-6 h-6" />}
          href="/Settings"
        />
      </Sidebar>

      <div class="flex-1 p-0 overflow-y-auto dark:bg-slate-800 dark:text-gray-400 min-h-screen transition-colors duration-200">
        <Router>
          <Route path={['/Game', '/', '']} component={Game} />
          <Route path="/Plugin" component={Plugin} />
          <Route path="/Settings" component={Settings} />
        </Router>
      </div>
    </>
  )
}

const App: Component = () => {
  const storageManager = createLocalStorageManager('vite-ui-theme')

  return (
    <div class="flex min-h-screen h-screen bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100">
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <I18nProvider>
          <MainLayout />
          <Toaster
            position="bottom-left"
            toastOptions={{
              className: `
                !bg-white !text-gray-900 
                dark:!bg-slate-800 dark:!text-gray-100
                border border-gray-200 dark:border-slate-700
                shadow-lg rounded-md
              `,
              style: {
                background: 'transparent',
                'box-shadow': 'none'
              }
            }}
          />
        </I18nProvider>
      </ColorModeProvider>
    </div>
  )
}

export default App
function parsePath(pathname: string): any {
  throw new Error('Function not implemented.')
}
