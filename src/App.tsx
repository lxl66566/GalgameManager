import { Route, Router } from '@solidjs/router'
import { BiRegularExtension } from 'solid-icons/bi'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import Game from './pages/Game'
import Plugin from './pages/Plugin'
import Settings from './pages/Settings'
import { Sidebar, SidebarItem } from './Sidebar'

const App = () => {
  return (
    <div class="flex min-h-screen dark h-screen">
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
    </div>
  )
}

export default App
