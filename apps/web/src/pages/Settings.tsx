import { handleRecordName, handleRecordValue, normalizeHandle, type Profile } from '@socialkey/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, CircleAlert, Copy, LoaderCircle } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { setSystemNotifications, systemNotificationsEnabled } from '../components/Alerts'
import { useApp } from '../components/AppContext'
import { Avatar } from '../components/Avatar'
import { MediaImage } from '../components/MediaImage'
import { UserRow } from '../components/People'
import { useModerate } from '../components/PostCard'
import { QrCode } from '../components/QrCode'
import { Button, Card, inputClass, PageHeader, Spinner } from '../components/ui'
import { agent } from '../lib/agent'
import { copyText } from '../lib/clipboard'
import { AGENT_URL } from '../lib/config'
import { didForHandle } from '../lib/dns'
import { useMe, useModeration, useOwnManifest } from '../lib/queries'
import { profileLink } from '../lib/share'

export function Settings() {
  const me = useMe()
  const own = useOwnManifest()
  if (!me.isPending && !me.data) return <Navigate to="/connect" />
  if (!own || !me.data) return <Spinner />
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4 p-4">
        <ProfileForm key={own.updatedAt} did={own.author} profile={own.profile} />
        <HandleSettings did={own.author} current={own.profile.handle} />
        <ShareCard did={own.author} handle={own.profile.handle} />
        <NotificationSettings />
        <ModerationCard />
        <BackupCard />
        <ConnectionCard />
      </div>
    </>
  )
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

function useObjectUrl(file: File | null): string | undefined {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  return url
}

function ProfileForm({ did, profile }: { did: string; profile: Profile }) {
  const { toast } = useApp()
  const client = useQueryClient()
  const [fields, setFields] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    location: profile.location ?? '',
    website: profile.website ?? '',
  })
  const [avatar, setAvatar] = useState<File | null>(null)
  const [banner, setBanner] = useState<File | null>(null)
  const avatarPreview = useObjectUrl(avatar)
  const bannerPreview = useObjectUrl(banner)

  const save = useMutation({
    mutationFn: async () => {
      const [avatarCid, bannerCid] = await Promise.all([
        avatar ? agent.uploadMedia(avatar).then((r) => r.cid) : undefined,
        banner ? agent.uploadMedia(banner).then((r) => r.cid) : undefined,
      ])
      const website =
        fields.website.trim() && !/^https?:\/\//.test(fields.website.trim())
          ? `https://${fields.website.trim()}`
          : fields.website.trim()
      return agent.updateProfile({ ...fields, website, avatar: avatarCid, banner: bannerCid })
    },
    onSuccess: async () => {
      toast('Profile published')
      setAvatar(null)
      setBanner(null)
      await client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) =>
      toast(
        err.message.includes('Invalid input')
          ? 'Please check the fields: the website must be a full URL.'
          : err.message,
        'error',
      ),
  })

  const field = (
    name: keyof typeof fields,
    label: string,
    opts: { multiline?: boolean; max: number; placeholder?: string },
  ) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input or textarea is rendered inside, chosen by `multiline`
    <label className="block">
      <span className="flex justify-between text-sm font-semibold">
        {label}
        <span className="font-normal text-stone-400 tabular-nums">
          {fields[name].length}/{opts.max}
        </span>
      </span>
      {opts.multiline ? (
        <textarea
          rows={3}
          maxLength={opts.max}
          placeholder={opts.placeholder}
          value={fields[name]}
          onChange={(e) => setFields((f) => ({ ...f, [name]: e.target.value }))}
          className={`${inputClass} mt-1 resize-none`}
        />
      ) : (
        <input
          maxLength={opts.max}
          placeholder={opts.placeholder}
          value={fields[name]}
          onChange={(e) => setFields((f) => ({ ...f, [name]: e.target.value }))}
          className={`${inputClass} mt-1`}
        />
      )}
    </label>
  )

  return (
    <Section title="Profile" description="Everything here is public.">
      <div className="overflow-hidden rounded-xl">
        <label className="group relative block h-32 cursor-pointer bg-gradient-to-br from-brand-400 to-brand-700">
          {bannerPreview ? (
            <img src={bannerPreview} alt="" className="h-32 w-full object-cover" />
          ) : (
            profile.banner && <MediaImage cid={profile.banner.toString()} className="h-32 w-full" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
            <Camera className="size-6" />
          </span>
          <input type="file" accept="image/*" hidden onChange={(e) => setBanner(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <label className="group relative -mt-10 ml-4 block w-fit cursor-pointer">
        {avatarPreview ? (
          <img
            src={avatarPreview}
            alt=""
            className="relative z-10 size-20 rounded-full border-4 border-white object-cover dark:border-stone-900"
          />
        ) : (
          <Avatar
            cid={profile.avatar}
            name={fields.displayName || '?'}
            seed={did}
            size="lg"
            className="relative z-10 size-20 border-4 border-white dark:border-stone-900"
          />
        )}
        <span className="absolute inset-1 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
          <Camera className="size-5" />
        </span>
        <input type="file" accept="image/*" hidden onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
      </label>
      <div className="mt-4 space-y-4">
        {field('displayName', 'Name', { max: 64 })}
        {field('bio', 'Bio', { multiline: true, max: 500, placeholder: 'Tell people about yourself' })}
        {field('location', 'Location', { max: 64 })}
        {field('website', 'Website', { max: 200, placeholder: 'https://' })}
        <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!fields.displayName.trim()}>
          Save profile
        </Button>
      </div>
    </Section>
  )
}

function HandleSettings({ did, current }: { did: string; current?: string }) {
  const { toast } = useApp()
  const client = useQueryClient()
  const [input, setInput] = useState(current ?? '')
  const handle = normalizeHandle(input)
  const check = useQuery({
    queryKey: ['handle-check', handle],
    enabled: handle !== null,
    queryFn: () => didForHandle(handle ?? ''),
    refetchInterval: (q) => (q.state.data === did ? false : 15_000),
  })
  const verified = handle !== null && check.data === did
  const save = useMutation({
    mutationFn: (value: string | null) => agent.updateProfile({ handle: value }),
    onSuccess: async (_, value) => {
      toast(value ? `You're now @${value}` : 'Handle removed')
      await client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast(err.message, 'error'),
  })

  return (
    <Section
      title="Your handle"
      description="Use a domain you own as your name, like @alice.com. It's verified through DNS, so nobody else can claim it."
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="alice.example.com"
        className={inputClass}
      />
      {input && !handle && <p className="mt-2 text-sm text-red-600">Enter a domain name, like alice.example.com.</p>}
      {handle && (
        <div className="mt-4 space-y-3 text-sm">
          <p>Add this DNS record at your domain provider:</p>
          <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl bg-white p-3 font-mono text-xs dark:bg-stone-950">
            <dt className="font-sans font-semibold text-stone-500">Type</dt>
            <dd>TXT</dd>
            <span />
            <dt className="font-sans font-semibold text-stone-500">Name</dt>
            <dd className="break-all">{handleRecordName(handle)}</dd>
            <CopyButton text={handleRecordName(handle)} />
            <dt className="font-sans font-semibold text-stone-500">Value</dt>
            <dd className="break-all">{handleRecordValue(did)}</dd>
            <CopyButton text={handleRecordValue(did)} />
          </dl>
          <p className="flex items-center gap-2">
            {verified ? (
              <>
                <BadgeCheck className="size-5 text-green-600" />{' '}
                <span className="font-semibold text-green-700 dark:text-green-500">DNS record found</span>
              </>
            ) : check.isFetching ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Checking DNS…
              </>
            ) : (
              <>
                <CircleAlert className="size-4 text-amber-500" /> Record not found yet. DNS changes can take a few
                minutes; this checks again automatically.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => save.mutate(handle)}
              disabled={!verified || handle === current}
              busy={save.isPending}
            >
              {handle === current ? 'Handle saved' : 'Use this handle'}
            </Button>
            {current && (
              <Button variant="ghost" onClick={() => save.mutate(null)}>
                Remove handle
              </Button>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

function CopyButton({ text }: { text: string }) {
  const { toast } = useApp()
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={async () => {
        await copyText(text)
        toast('Copied')
      }}
      className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
    >
      <Copy className="size-4" />
    </button>
  )
}

function ShareCard({ did, handle }: { did: string; handle?: string }) {
  const link = profileLink(handle ?? did)
  return (
    <Section title="Share your profile" description="Send your link or ID to friends so they can follow you.">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-xl bg-white p-2">
          <QrCode value={link} size={132} />
        </div>
        <div className="w-full min-w-0 space-y-3 text-sm">
          <div>
            <p className="font-semibold">Profile link</p>
            <div className="mt-1 flex items-center gap-1">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs dark:bg-stone-950">
                {link}
              </code>
              <CopyButton text={link} />
            </div>
          </div>
          <div>
            <p className="font-semibold">SocialKey ID</p>
            <div className="mt-1 flex items-center gap-1">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs dark:bg-stone-950">
                {did}
              </code>
              <CopyButton text={did} />
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

function NotificationSettings() {
  const { toast } = useApp()
  const [on, setOn] = useState(systemNotificationsEnabled)
  const supported = 'Notification' in window
  return (
    <Section
      title="Notifications"
      description="Get a system notification for new messages and activity while SocialKey is in a background tab."
    >
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={on}
          disabled={!supported}
          onChange={async (e) => {
            const enabled = await setSystemNotifications(e.target.checked)
            setOn(enabled)
            if (e.target.checked && !enabled)
              toast('Notifications are blocked for this site in your browser settings', 'error')
          }}
          className="size-4 accent-brand-600"
        />
        {supported ? 'Show system notifications' : "This browser doesn't support notifications"}
      </label>
    </Section>
  )
}

function ModerationCard() {
  const { muted, blocked } = useModeration()
  const moderate = useModerate()
  const rows = [
    ...[...blocked].map((did) => ({ did, list: 'blocked' as const })),
    ...[...muted].filter((d) => !blocked.has(d)).map((did) => ({ did, list: 'muted' as const })),
  ]
  return (
    <Section
      title="Muted and blocked"
      description="Only you can see these lists. People aren't told when you mute or block them."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">
          You haven't muted or blocked anyone. Use the ⋯ menu on a post or a profile's share menu.
        </p>
      ) : (
        <div className="-mx-4">
          {rows.map(({ did, list }) => (
            <div key={did} className="flex items-center">
              {/* The row's own follow button is hidden: blocked people shouldn't be one click from a follow. */}
              <div className="min-w-0 flex-1 [&_button]:hidden">
                <UserRow did={did} showBio={false} note={list === 'blocked' ? 'Blocked' : 'Muted'} />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mr-4"
                onClick={() => moderate(list, did, false, 'this account')}
              >
                {list === 'blocked' ? 'Unblock' : 'Unmute'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function BackupCard() {
  return (
    <Section
      title="Back up your account"
      description="Your account is a key on your computer. If that computer is lost, your recovery phrase is the only way back."
    >
      <p className="text-sm">
        Open the SocialKey desktop app and choose <b>Show recovery phrase</b>. Write the 24 words down and keep them
        somewhere safe. To move to a new computer, install SocialKey there and use <b>Restore an account</b>: your
        profile, posts and follows come back from the network.
      </p>
    </Section>
  )
}

function ConnectionCard() {
  const client = useQueryClient()
  return (
    <Section
      title="SocialKey app"
      description={
        <>
          Connected to your app at <code>{AGENT_URL}</code>. It holds your key and publishes your posts.
        </>
      }
    >
      <Button
        variant="secondary"
        onClick={() => {
          agent.unpair()
          void client.resetQueries()
        }}
      >
        Disconnect this browser
      </Button>
    </Section>
  )
}
