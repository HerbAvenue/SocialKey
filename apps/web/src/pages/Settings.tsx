import type { Profile } from '@socialkey/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router'
import { agent } from '../lib/agent'
import { useManifest, useMe } from '../lib/queries'

export function Settings() {
  const me = useMe()
  const own = useManifest(me.data?.did)
  if (!me.isPending && !me.data) return <Navigate to="/connect" />
  if (own.error) {
    return <p className="p-8 text-center text-stone-500">Couldn't load your profile: {own.error.message}</p>
  }
  if (!own.data) return <p className="p-8 text-center text-stone-500">Loading…</p>
  return <ProfileForm profile={own.data.profile} />
}

function ProfileForm({ profile }: { profile: Profile }) {
  const client = useQueryClient()
  const [fields, setFields] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    location: profile.location ?? '',
    website: profile.website ?? '',
  })
  const [avatar, setAvatar] = useState<File | null>(null)
  const save = useMutation({
    mutationFn: async () => {
      const avatarCid = avatar ? (await agent.uploadMedia(avatar)).cid : undefined
      return agent.updateProfile({ ...fields, avatar: avatarCid })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['me'] }),
  })

  const input = (name: keyof typeof fields, label: string, multiline = false) => {
    const props = {
      id: name,
      value: fields[name],
      onChange: (e: { target: { value: string } }) => setFields((f) => ({ ...f, [name]: e.target.value })),
      className: 'w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 dark:border-stone-700',
    }
    return (
      <div className="space-y-1">
        <label htmlFor={name} className="block text-sm font-semibold">
          {label}
        </label>
        {multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
      className="space-y-4 p-6"
    >
      {input('displayName', 'Display name')}
      {input('bio', 'Bio', true)}
      {input('location', 'Location')}
      {input('website', 'Website')}
      <label className="block space-y-1">
        <span className="text-sm font-semibold">Avatar</span>
        <input type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
      </label>
      <button
        type="submit"
        disabled={save.isPending}
        className="rounded-lg bg-stone-900 px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
      >
        {save.isPending ? 'Publishing…' : 'Save'}
      </button>
      {save.isSuccess && <p className="text-sm text-green-700">Published.</p>}
      {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
    </form>
  )
}
