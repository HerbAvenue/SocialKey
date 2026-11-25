import { Route, Routes } from 'react-router'
import { AppProvider } from './components/AppContext'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import { Connect } from './pages/Connect'
import { Explore } from './pages/Explore'
import { GetApp } from './pages/GetApp'
import { Home } from './pages/Home'
import { Notifications } from './pages/Notifications'
import { PostPage } from './pages/PostPage'
import { FollowList, Profile } from './pages/Profile'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { Tag } from './pages/Tag'

export function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/search" element={<Search />} />
          <Route path="/tag/:tag" element={<Tag />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/u/:id" element={<Profile />} />
          <Route path="/u/:id/following" element={<FollowList kind="following" />} />
          <Route path="/u/:id/followers" element={<FollowList kind="followers" />} />
          <Route path="/p/:cid" element={<PostPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/get" element={<GetApp />} />
          <Route path="*" element={<EmptyState title="Page not found" />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
