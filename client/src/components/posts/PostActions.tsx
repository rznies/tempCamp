import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation'
import { api } from '@/lib/api'
import type { Post } from '@/types/post'

interface PostActionsProps {
  post: Post
}

export function PostActions({ post }: PostActionsProps) {
  const { isOnline } = useNetworkStatus()
  
  const { mutate } = useOptimisticMutation<Post>({
    queryKey: ['posts', post.id],
    updater: (old, updated) => ({ ...old, ...updated }),
    offlineFallback: true
  })

  const handleLike = async () => {
    const updatedPost = {
      ...post,
      likes: post.likes + 1,
      hasLiked: true
    }

    try {
      await mutate(
        updatedPost,
        api.patch(`/posts/${post.id}/like`, { liked: true })
      )
    } catch (error) {
      if (!isOnline) {
        // Store action for later sync
        const offlineActions = JSON.parse(
          localStorage.getItem('offlineActions') || '[]'
        )
        offlineActions.push({
          type: 'LIKE_POST',
          payload: { postId: post.id },
          timestamp: Date.now()
        })
        localStorage.setItem('offlineActions', JSON.stringify(offlineActions))
      }
    }
  }

  return (
    <button
      onClick={handleLike}
      className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-primary/10"
      disabled={post.hasLiked}
    >
      <HeartIcon className={post.hasLiked ? 'fill-primary' : ''} />
      <span>{post.likes}</span>
    </button>
  )
}