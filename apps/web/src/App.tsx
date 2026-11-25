import { NavLink, Route, Routes } from 'react-router'
import { useMe } from './lib/queries'
import { Connect } from './pages/Connect'
import { Home } from './pages/Home'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'

export function App() {
  const me = useMe().data
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'font-semibold' : 'text-stone-500')
  return (
    <div className="mx-auto min-h-screen max-w-xl border-x border-stone-200 dark:border-stone-800">
      <nav className="sticky top-0 flex gap-4 border-b border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <NavLink to="/" end className={link}>
          Home
        </NavLink>
        {me && (
          <NavLink to={`/u/${me.did}`} className={link}>
            Profile
          </NavLink>
        )}
        {me && (
          <NavLink to="/settings" className={link}>
            Settings
          </NavLink>
        )}
        <NavLink to="/connect" className={(s) => `ml-auto ${link(s)}`}>
          {me ? 'Agent' : 'Connect'}
        </NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/u/:did" element={<Profile />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
