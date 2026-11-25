import { Bell, Compass, House, KeyRound, Mail, Search, Settings, SquarePen, User } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useMe, useOwnManifest } from '../lib/queries'
import { useUnreadMessages } from '../pages/Messages'
import { useUnreadCount } from '../pages/Notifications'
import { useApp } from './AppContext'
import { Avatar } from './Avatar'
import { inputClass } from './ui'
import { WhoToFollow } from './WhoToFollow'

export function Logo({ withText = true }: { withText?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-extrabold tracking-tight">
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <KeyRound className="size-5" />
      </span>
      {withText && <span className="text-xl">SocialKey</span>}
    </span>
  )
}

export function Layout() {
  const me = useMe().data
  const own = useOwnManifest()
  const { compose } = useApp()
  const unread = useUnreadCount()
  const unreadMessages = useUnreadMessages()
  const { pathname } = useLocation()

  const nav: { to: string; label: string; icon: ReactNode; badge?: number; end?: boolean }[] = [
    { to: '/', label: 'Home', icon: <House />, end: true },
    { to: '/explore', label: 'Explore', icon: <Compass /> },
    ...(me
      ? [
          { to: '/notifications', label: 'Notifications', icon: <Bell />, badge: unread },
          { to: '/messages', label: 'Messages', icon: <Mail />, badge: unreadMessages },
          { to: `/u/${me.did}`, label: 'Profile', icon: <User /> },
          { to: '/settings', label: 'Settings', icon: <Settings /> },
        ]
      : [{ to: '/connect', label: 'Connect', icon: <KeyRound /> }]),
  ]

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl justify-center">
      {/* Left rail: icons on tablets, full labels on desktops. */}
      <header className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center gap-1 px-2 py-4 sm:flex xl:w-64 xl:items-stretch xl:px-4">
        <NavLink to="/" className="mb-4 px-2" aria-label="SocialKey home">
          <span className="xl:hidden">
            <Logo withText={false} />
          </span>
          <span className="hidden xl:block">
            <Logo />
          </span>
        </NavLink>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-full px-3 py-3 text-lg transition-colors hover:bg-stone-100 dark:hover:bg-stone-900 [&_svg]:size-6 ${isActive ? 'font-bold' : ''}`
              }
              title={item.label}
            >
              <span className="relative">
                {item.icon}
                {item.badge ? (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-brand-600 px-1 text-center text-[11px] font-bold text-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </span>
              <span className="hidden xl:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {me && (
          <button
            type="button"
            onClick={() => compose()}
            className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand-600 p-3 font-bold text-white shadow-sm transition-colors hover:bg-brand-700 xl:py-3.5"
          >
            <SquarePen className="size-6 xl:hidden" />
            <span className="hidden text-lg xl:inline">Post</span>
          </button>
        )}
        {own && (
          <NavLink
            to={`/u/${own.author}`}
            className="mt-auto flex items-center gap-3 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-900"
          >
            <Avatar cid={own.profile.avatar} name={own.profile.displayName} seed={own.author} size="sm" />
            <span className="hidden min-w-0 xl:block">
              <span className="block truncate text-sm font-bold">{own.profile.displayName}</span>
              <span className="block truncate text-xs text-stone-500">
                {own.profile.handle ? `@${own.profile.handle}` : 'Your profile'}
              </span>
            </span>
          </NavLink>
        )}
      </header>

      <main className="min-h-screen w-full max-w-[600px] min-w-0 border-stone-200 pb-20 sm:border-x sm:pb-0 dark:border-stone-800">
        <Outlet />
      </main>

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 xl:w-80 space-y-4 overflow-y-auto px-6 py-3 lg:block">
        <SearchBox />
        {me && pathname !== '/explore' && <WhoToFollow limit={4} compact />}
        <AboutCard />
      </aside>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-stone-800 dark:bg-stone-950/95">
        {nav.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-label={item.label}
            className={({ isActive }) =>
              `relative p-4 [&_svg]:size-6 ${isActive ? 'text-brand-600' : 'text-stone-500'}`
            }
          >
            {item.icon}
            {item.badge ? <span className="absolute top-3 right-3 size-2 rounded-full bg-brand-600" /> : null}
          </NavLink>
        ))}
      </nav>
      {me && (
        <button
          type="button"
          onClick={() => compose()}
          aria-label="New post"
          className="fixed right-4 bottom-20 z-30 rounded-full bg-brand-600 p-4 text-white shadow-lg sm:hidden"
        >
          <SquarePen className="size-6" />
        </button>
      )}
    </div>
  )
}

export function SearchBox({ autoFocus = false, initial = '' }: { autoFocus?: boolean; initial?: string }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }
  return (
    <form onSubmit={submit} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-stone-400" />
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people, posts, @handles, IDs"
        className={`${inputClass} rounded-full bg-stone-100 pl-10 dark:bg-stone-900`}
      />
    </form>
  )
}

function AboutCard() {
  return (
    <section className="rounded-2xl border border-stone-200 p-4 text-sm dark:border-stone-800">
      <h2 className="font-bold">Your posts, your computer</h2>
      <p className="mt-1 text-stone-500">
        SocialKey has no central server. Everyone hosts their own profile on the peer-to-peer IPFS network, signed with
        a key only they hold.
      </p>
      <p className="mt-3 text-xs text-stone-400">Free · No ads · No algorithm</p>
    </section>
  )
}
