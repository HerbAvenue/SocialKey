import { useQuery } from '@tanstack/react-query'
import { Download, Globe, HardDrive, KeyRound, Lock, ShieldCheck, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo, SearchBox } from '../components/Layout'
import { AGENT_URL } from '../lib/config'
import { DOWNLOAD_URL } from '../lib/share'

/** What visitors without the desktop app see at the home page. */
export function Landing() {
  const agentRunning = useAgentRunning()
  return (
    <div>
      {agentRunning && (
        <Link
          to="/connect"
          className="flex items-center justify-between gap-3 bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <span className="flex items-center gap-2">
            <KeyRound className="size-4" /> Your SocialKey app is running on this computer.
          </span>
          <span className="underline">Connect</span>
        </Link>
      )}
      <section className="relative overflow-hidden border-b border-stone-200 px-6 pt-10 pb-12 dark:border-stone-800">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-brand-100),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--color-brand-600)_25%,transparent),transparent_70%)]" />
        <div className="sm:hidden">
          <Logo />
        </div>
        <h1 className="mt-6 text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
          The social network <span className="text-brand-600 dark:text-brand-400">you own.</span>
        </h1>
        <p className="mt-4 text-lg text-stone-600 dark:text-stone-300">
          Post, follow friends and build a following, without a company in the middle. Your profile lives on your
          computer, signed with a key only you hold.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {DOWNLOAD_URL ? (
            <a
              href={DOWNLOAD_URL}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-brand-700"
            >
              <Download className="size-5" /> Get SocialKey for desktop
            </a>
          ) : (
            <Link
              to="/get"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-brand-700"
            >
              <Download className="size-5" /> Get SocialKey for desktop
            </Link>
          )}
          <Link
            to="/connect"
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-3 font-bold hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
          >
            I have the app
          </Link>
        </div>
        <p className="mt-3 text-sm text-stone-500">Free for Windows, macOS and Linux.</p>
      </section>

      <section className="grid gap-px bg-stone-200 sm:grid-cols-2 dark:bg-stone-800">
        <Feature icon={<HardDrive />} title="Hosted by you">
          Your posts are stored on your own computer and shared peer to peer over IPFS. No company can delete your
          account.
        </Feature>
        <Feature icon={<KeyRound />} title="Signed by you">
          Every post carries your digital signature, so nobody can fake one, not even the people relaying it.
        </Feature>
        <Feature icon={<Users />} title="Your feed, in order">
          See the people you follow, newest first. No algorithm deciding what you see and no ads.
        </Feature>
        <Feature icon={<Globe />} title="Your domain, your name">
          Prove you own a website and use it as your handle, like @alice.com. Verified with one DNS record.
        </Feature>
        <Feature icon={<ShieldCheck />} title="Portable identity">
          Your identity is a key, not a username on someone's server. Take it anywhere, keep it forever.
        </Feature>
        <Feature icon={<Lock />} title="Private by design">
          No tracking and no profiling. The app talks to the network directly, from your machine.
        </Feature>
      </section>

      <section className="space-y-3 px-6 py-8">
        <h2 className="text-xl font-bold">Look someone up</h2>
        <p className="text-sm text-stone-500">Paste a SocialKey ID or a handle to see their profile.</p>
        <SearchBox />
      </section>

      <section className="border-t border-stone-200 px-6 py-8 dark:border-stone-800">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="mt-4 space-y-4">
          <Step n={1} title="Install the app">
            It creates your key and runs a small IPFS node in the background, in your system tray.
          </Step>
          <Step n={2} title="Set up your profile">
            Pick a name, a photo and a bio. Your profile is published to the network in seconds.
          </Step>
          <Step n={3} title="Find your people">
            Share your ID or handle, follow friends, and discover people they follow.
          </Step>
        </ol>
      </section>
    </div>
  )
}

/**
 * Whether a SocialKey app answers on this computer. A no-cors request can't
 * read the reply, but it only succeeds if something is listening.
 */
function useAgentRunning(): boolean {
  return (
    useQuery({
      queryKey: ['agent-running'],
      queryFn: async () => {
        await fetch(`${AGENT_URL}/health`, { mode: 'no-cors', signal: AbortSignal.timeout(1500) })
        return true
      },
      retry: false,
      staleTime: 30_000,
    }).data ?? false
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="bg-white p-6 dark:bg-stone-950">
      <div className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-600/15 dark:text-brand-400 [&_svg]:size-5">
        {icon}
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-stone-500">{children}</p>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
        {n}
      </span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="text-sm text-stone-500">{children}</span>
      </span>
    </li>
  )
}
