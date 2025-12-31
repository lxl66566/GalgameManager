import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager
} from '@kobalte/core'
import { Route, Router } from '@solidjs/router'
import { BiRegularExtension } from 'solid-icons/bi'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import { createEffect, onMount, type Component } from 'solid-js'
import { Toaster } from 'solid-toast'
import { I18nProvider, useI18n, type Locale } from './i18n'
import Game from './pages/Game'
import Plugin from './pages/Plugin'
import Settings from './pages/Settings'
import { Sidebar, SidebarItem } from './Sidebar'
import { initConfig, useConfig } from './store'

const MainLayout: Component = () => {
  const { config } = useConfig()
  const { t, setLocale } = useI18n()

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

      <div class="flex-1 p-0 overflow-y-auto dark:bg-slate-800 dark:text-gray-400 min-h-screen">
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
  const { actions } = useConfig()

  onMount(() => {
    actions.initConfig()
  })

  return (
    <div class="flex min-h-screen dark h-screen">
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        {/* I18nProvider 包裹住 MainLayout */}
        <I18nProvider>
          <MainLayout />
        </I18nProvider>
      </ColorModeProvider>

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
    </div>
  )
}

export default App
