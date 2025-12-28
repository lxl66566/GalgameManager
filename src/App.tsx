import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager
} from '@kobalte/core'
import { Route, Router } from '@solidjs/router'
import { BiRegularExtension } from 'solid-icons/bi'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import { Toaster } from 'solid-toast'
import Game from './pages/Game'
import Plugin from './pages/Plugin'
import Settings from './pages/Settings'
import { Sidebar, SidebarItem } from './Sidebar'
import { initConfig } from './store'

await initConfig()

const App = () => {
  const storageManager = createLocalStorageManager('vite-ui-theme')

  return (
    <div class="flex min-h-screen dark h-screen">
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <Sidebar>
          <SidebarItem label="Game" icon={<CgGames class="w-6 h-6" />} href="/Game" />
          <SidebarItem
            label="Plugin"
            icon={<BiRegularExtension class="w-6 h-6" />}
            href="/Plugin"
          />
          <SidebarItem
            label="Settings"
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
          // 2. 必须：去掉默认的内联背景色，否则 className 里的背景色会被覆盖
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
