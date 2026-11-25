import { didKey, normalizeHandle } from '@socialkey/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, KeyRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { agent } from '../lib/agent'
import { copyText } from '../lib/clipboard'
import { didForHandle } from '../lib/dns'
import { useMe, useOwnManifest } from '../lib/queries'
import { profileLink } from '../lib/share'
import { useApp } from './AppContext'
import { QrCode } from './QrCode'
import { Button, inputClass } from './ui'

const DONE_KEY = 'socialkey.onboarded'

function isDone(did: string): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === did
  } catch {
    return false
  }
}

/** First-run setup for a brand-new profile: name and photo, then finding people. */
export function Onboarding() {
  const me = useMe().data
  const own = useOwnManifest()
  const [activeDid, setActiveDid] = useState<string>()
  const fresh =
    own !== undefined && own.profile.displayName === 'Anonymous' && !own.profile.bio && own.posts.length === 0
  // Once started, stay open until finished: saving the name makes the profile no longer "fresh".
  useEffect(() => {
    if (fresh && own && !isDone(own.author)) setActiveDid(own.author)
  }, [fresh, own])
  if (!me || !activeDid) return null
  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, activeDid)
    } catch {
      // Without storage the dialog may return after a reload; harmless.
    }
    setActiveDid(undefined)
  }
  return <OnboardingDialog did={activeDid} onDone={finish} />
}

function OnboardingDialog({ did, onDone }: { did: string; onDone: () => void }) {
  const [step, setStep] = useState<'profile' | 'people'>('profile')
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set up your profile"
        className="w-full max-w-md animate-slide-up rounded-3xl bg-white p-6 shadow-2xl dark:bg-stone-900"
      >
        <div className="mb-5 flex items-center gap-2">
          {['profile', 'people'].map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${step === s || (step === 'people' && i === 0) ? 'bg-brand-500' : 'bg-stone-200 dark:bg-stone-700'}`}
            />
          ))}
        </div>
        {step === 'profile' ? (
          <ProfileStep onNext={() => setStep('people')} />
        ) : (
          <PeopleStep did={did} onDone={onDone} />
        )}
      </div>
    </div>
  )
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const { toast } = useApp()
  const client = useQueryClient()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : undefined), [avatar])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const save = useMutation({
    mutationFn: async () => {
      const avatarCid = avatar ? (await agent.uploadMedia(avatar)).cid : undefined
      return agent.updateProfile({ displayName: name.trim(), bio: bio.trim() || null, avatar: avatarCid })
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['me'] })
      onNext()
    },
    onError: (err) => toast(err.message, 'error'),
  })

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="rounded-2xl bg-brand-600 p-2.5 text-white">
          <KeyRound className="size-6" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold">Welcome to SocialKey</h2>
          <p className="text-sm text-stone-500">Your profile is ready. Let's give it a face.</p>
        </div>
      </div>
      <label className="group relative mx-auto mt-6 flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
        {preview ? <img src={preview} alt="" className="size-full object-cover" /> : <Camera className="size-8" />}
        <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
        <input type="file" accept="image/*" hidden onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
      </label>
      <p className="mt-2 text-center text-xs text-stone-500">Add a photo (optional)</p>
      <div className="mt-4 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          placeholder="Your name"
          className={inputClass}
          autoFocus
        />
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="A short bio (optional)"
          className={`${inputClass} resize-none`}
        />
      </div>
      <Button
        size="lg"
        className="mt-5 w-full"
        disabled={!name.trim()}
        busy={save.isPending}
        onClick={() => save.mutate()}
      >
        Continue
      </Button>
    </>
  )
}

function PeopleStep({ did, onDone }: { did: string; onDone: () => void }) {
  const { toast } = useApp()
  const client = useQueryClient()
  const [friend, setFriend] = useState('')
  const [followed, setFollowed] = useState<string[]>([])
  const follow = useMutation({
    mutationFn: async (input: string) => {
      const value = input.trim().replace(/^.*#\/u\//, '')
      const target = didKey.safeParse(value).success ? value : normalizeHandle(value) ? await didForHandle(value) : null
      if (!target) throw new Error("That isn't a SocialKey ID or a verified handle")
      if (target === did) throw new Error("That's you!")
      await agent.follow(target)
      return target
    },
    onSuccess: async (target) => {
      setFollowed((f) => [...f, target])
      setFriend('')
      await client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast(err.message, 'error'),
  })
  const link = profileLink(did)

  return (
    <>
      <h2 className="text-xl font-extrabold">Find your people</h2>
      <p className="mt-1 text-sm text-stone-500">
        SocialKey has no central directory. You connect by sharing IDs, links or handles, like swapping phone numbers.
      </p>
      <div className="mt-5 flex items-center gap-4 rounded-2xl bg-stone-50 p-3 dark:bg-stone-800/50">
        <div className="rounded-xl bg-white p-1.5">
          <QrCode value={link} size={88} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Your profile link</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={async () => {
              await copyText(link)
              toast('Link copied: send it to your friends')
            }}
          >
            Copy link
          </Button>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (friend.trim()) follow.mutate(friend)
        }}
        className="mt-5"
      >
        <label className="text-sm font-bold" htmlFor="friend-id">
          Follow a friend
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="friend-id"
            value={friend}
            onChange={(e) => setFriend(e.target.value)}
            placeholder="Their ID, link or @handle"
            className={inputClass}
          />
          <Button type="submit" busy={follow.isPending} disabled={!friend.trim()}>
            Follow
          </Button>
        </div>
      </form>
      {followed.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-green-700 dark:text-green-500">
          <Check className="size-4" /> Following {followed.length} {followed.length === 1 ? 'person' : 'people'}
        </p>
      )}
      <Button size="lg" className="mt-6 w-full" onClick={onDone}>
        {followed.length ? 'Go to my timeline' : "I'll do this later"}
      </Button>
    </>
  )
}
