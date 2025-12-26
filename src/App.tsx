import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager
} from '@kobalte/core'
import { Route, Router } from '@solidjs/router'
import { BiRegularExtension } from 'solid-icons/bi'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import Game from './pages/Game'
import Plugin from './pages/Plugin'
import Setting from './pages/Setting'
import { Sidebar, SidebarItem } from './Sidebar'

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
            label="Setting"
            icon={<IoSettingsOutline class="w-6 h-6" />}
            href="/Settings"
          />
        </Sidebar>
        <div class="flex-1 p-0 overflow-y-auto dark:bg-slate-800 dark:text-gray-400 min-h-screen">
          <Router>
            <Route path={['/Game', '/', '']} component={Game} />
            <Route path="/Plugin" component={Plugin} />
            <Route path="/Setting" component={Setting} />
          </Router>
        </div>
      </ColorModeProvider>
    </div>
  )
}

export default App
