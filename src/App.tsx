import { Route, Router } from '@solidjs/router'
import { CgGames } from 'solid-icons/cg'
import { IoSettingsOutline } from 'solid-icons/io'
import Game from './pages/Game'
import Settings from './pages/Settings'
import { Sidebar, SidebarItem } from './Sidebar'

const App = () => {
  return (
    <div class="flex min-h-screen">
      <Sidebar>
        <SidebarItem label="Game" icon={<CgGames class="w-6 h-6" />} href="/Game" />
        <SidebarItem
          label="Settings"
          icon={<IoSettingsOutline class="w-6 h-6" />}
          href="/Settings"
        />
      </Sidebar>
      <div class="flex-1 p-6 overflow-y-auto">
        <Router>
          <Route path={['/Game', '/']} component={Game} />
          <Route path="/Settings" component={Settings} />
        </Router>
      </div>
    </div>
  )
}

export default App
