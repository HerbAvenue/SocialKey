import { MAX_MEDIA_PER_POST, MAX_POST_LENGTH } from '@socialkey/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { agent } from '../lib/agent'

export function Composer() {
  const client = useQueryClient()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const publish = useMutation({
    mutationFn: async () => {
      const media = await Promise.all(files.map(async (f) => (await agent.uploadMedia(f)).cid))
      return agent.createPost(text, media)
    },
    onSuccess: () => {
      setText('')
      setFiles([])
      return client.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim() || files.length) publish.mutate()
  }

  return (
    <form onSubmit={submit} className="border-b border-stone-200 p-4 dark:border-stone-800">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_POST_LENGTH}
        rows={3}
        placeholder="What's happening?"
        className="w-full resize-none rounded-lg border border-stone-300 bg-transparent p-3 dark:border-stone-700"
      />
      <div className="mt-2 flex items-center gap-3 text-sm">
        <label className="cursor-pointer text-stone-600 hover:underline dark:text-stone-400">
          {files.length ? `${files.length} image${files.length > 1 ? 's' : ''}` : 'Add images'}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, MAX_MEDIA_PER_POST))}
          />
        </label>
        <span className="ml-auto text-stone-500">
          {text.length}/{MAX_POST_LENGTH}
        </span>
        <button
          type="submit"
          disabled={publish.isPending}
          className="rounded-full bg-stone-900 px-4 py-1.5 font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
        >
          {publish.isPending ? 'Publishing…' : 'Post'}
        </button>
      </div>
      {publish.error && <p className="mt-2 text-sm text-red-600">{publish.error.message}</p>}
    </form>
  )
}
