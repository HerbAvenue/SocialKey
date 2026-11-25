import { useParams } from 'react-router'
import { useApp } from '../components/AppContext'
import { PostList } from '../components/PostList'
import { PageHeader } from '../components/ui'
import { postsWithTag } from '../lib/social'

export function Tag() {
  const { tag = '' } = useParams()
  const { network } = useApp()
  const posts = network ? postsWithTag(network.posts, tag) : []
  return (
    <>
      <PageHeader
        title={`#${tag}`}
        subtitle={`${posts.length} post${posts.length === 1 ? '' : 's'} in your network`}
        back
      />
      <PostList entries={posts} empty={`Nobody in your network has used #${tag} yet.`} />
    </>
  )
}
