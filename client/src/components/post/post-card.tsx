import { memo, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { Heart, MessageCircle, Share2 } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useIntersection } from "@/hooks/useIntersection"
import { Skeleton } from "@/components/ui/skeleton"

import type { Post } from "@/pages/Feed"
import type { User } from "@/types/auth"

interface PostCardProps {
  post: Post
  onLike: (postId: string) => Promise<void>
  currentUser: User | null
}

const PostCard = memo(({ post, onLike, currentUser }: PostCardProps) => {
  const { ref, isIntersecting } = useIntersection({
    triggerOnce: true,
    rootMargin: '100px'
  })

  const handleLike = useCallback(async () => {
    if (currentUser?.id) {
      await onLike(post.id)
    }
  }, [post.id, currentUser?.id, onLike])

  const handleShare = useCallback(async () => {
    try {
      await navigator.share({
        title: `Post by ${post.author.name}`,
        text: post.content,
        url: window.location.href
      })
    } catch (err) {
      console.error('Sharing failed:', err)
    }
  }, [post.author.name, post.content])

  return (
    <Card 
      ref={ref}
      role="article" 
      aria-labelledby={`post-title-${post.id}`}
      className="mb-4 break-inside-avoid hover:bg-background/50 transition-colors"
    >
      <CardHeader className="flex flex-row items-start gap-4 pb-2">
        <Avatar className="flex-shrink-0">
          <AvatarImage 
            src={post.author.avatar} 
            alt={post.author.name} 
            width={40}
            height={40}
            loading="lazy"
          />
          <AvatarFallback aria-hidden="true">
            {post.author.name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 
                id={`post-title-${post.id}`}
                className="font-semibold truncate"
              >
                {post.author.name}
              </h2>
              <time 
                dateTime={post.createdAt}
                className="text-xs text-muted-foreground"
              >
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </time>
            </div>
            {post.visibility === 'course' && (
              <Badge variant="secondary" className="flex-shrink-0">
                {post.course}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pb-0">
        <p className="whitespace-pre-wrap mb-4">{post.content}</p>
        {post.media && (
          <div className="relative aspect-video">
            {!isIntersecting ? (
              <Skeleton className="w-full h-full rounded-lg" />
            ) : (
              <img 
                src={post.media} 
                alt="" 
                className="rounded-lg w-full h-full object-cover"
                loading="lazy"
                width={800}
                height={450}
                decoding="async"
              />
            )}
          </div>
        )}
        {post.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-4">
            {post.tags.map(tag => (
              <li key={tag}>
                <Badge variant="outline">#{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      
      <CardFooter className="flex gap-2 border-t pt-3">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleLike}
          aria-label={post.hasLiked ? "Unlike post" : "Like post"}
          disabled={!currentUser}
          className="flex-1 gap-1.5 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Heart 
            className={`size-[1.125rem] transition-colors ${
              post.hasLiked ? "fill-primary stroke-primary" : ""
            }`} 
          />
          <span aria-hidden="true">{post.likes}</span>
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          disabled={!currentUser}
          className="flex-1 gap-1.5 hover:bg-background"
          aria-label="View comments"
        >
          <MessageCircle className="size-[1.125rem]" />
          <span aria-hidden="true">{post.commentCount}</span>
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleShare}
          className="flex-1 gap-1.5 hover:bg-background"
          aria-label="Share post"
        >
          <Share2 className="size-[1.125rem]" />
        </Button>
      </CardFooter>
    </Card>
  )
})

PostCard.displayName = "PostCard"
export { PostCard }
