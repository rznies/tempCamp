import api from './api';
import { type APIResponse } from '@/types/api';
import { ErrorTracking } from '@/lib/error-tracking';

interface Post {
  _id: string;
  author: {
    _id: string;
    name: string;
    avatar: string;
  };
  content: string;
  media?: string;
  likes: number;
  comments: number;
  createdAt: string;
  trendingScore?: number;
}

interface FeedResponse extends APIResponse<Post[]> {
  meta?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

// Client-side cache with 1-minute TTL
const feedCache = new Map<string, { data: Post[]; timestamp: number }>();
const CACHE_TTL = 60_000; // 1 minute

// Debounced fetch requests
let abortController: AbortController | null = null;
const DEBOUNCE_DELAY = 300;

export const getFeedPosts = async (
  page = 1,
  limit = 10,
  options: {
    refresh?: boolean;
  } = {}
): Promise<FeedResponse> => {
  const cacheKey = `feed-${page}-${limit}`;
  
  // Return cached data if valid and not forced refresh
  if (!options.refresh && feedCache.has(cacheKey)) {
    const cached = feedCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return { data: cached.data, meta: { page, limit, total: 0, hasMore: true } };
    }
  }

  try {
    // Cancel previous request
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    const response = await api.get<FeedResponse>(`/feed`, {
      params: { page, limit },
      signal: abortController.signal
    });

    // Update cache
    feedCache.set(cacheKey, {
      data: response.data.data,
      timestamp: Date.now()
    });

    return response.data;
  } catch (error) {
    ErrorTracking.captureException(error, {
      context: 'getFeedPosts',
      page,
      limit
    });

    if (abortController?.signal.aborted) {
      throw new Error('Request canceled due to new search');
    }

    // Return cached data even if stale in case of error
    if (feedCache.has(cacheKey)) {
      return { 
        data: feedCache.get(cacheKey)!.data,
        meta: { page, limit, total: 0, hasMore: true },
        error: { 
          code: 'FEED_FETCH_ERROR', 
          message: 'Showing cached data while unable to fetch live feed' 
        }
      };
    }

    throw new Error('Failed to fetch feed posts');
  }
};

export const preloadFeed = async (page: number, limit: number) => {
  const cacheKey = `feed-${page}-${limit}`;
  if (!feedCache.has(cacheKey)) {
    setTimeout(() => getFeedPosts(page, limit), DEBOUNCE_DELAY);
  }
};

export const likePost = async (postId: string): Promise<APIResponse<{ likes: number }>> => {
  try {
    const response = await api.post<APIResponse<{ likes: number }>>('/feed/like', { postId }, {
      headers: { 'X-Idempotency-Key': `like-${postId}-${Date.now()}` }
    });

    // Update cache if exists
    Array.from(feedCache.keys()).forEach(key => {
      const cached = feedCache.get(key)!;
      const updated = cached.data.map(post => 
        post._id === postId ? { ...post, likes: response.data.data.likes } : post
      );
      feedCache.set(key, { ...cached, data: updated });
    });

    return response.data;
  } catch (error) {
    ErrorTracking.captureException(error, {
      context: 'likePost',
      postId
    });

    throw new Error('Failed to like post');
  }
};

export const createPost = async (
  data: { content: string; image?: File },
  options: {
    optimisticId?: string;
  } = {}
): Promise<APIResponse<Post>> => {
  try {
    const formData = new FormData();
    formData.append('content', data.content);
    if (data.image) {
      formData.append('media', data.image);
    }

    const response = await api.post<APIResponse<Post>>('/feed/create', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-Optimistic-Id': options.optimisticId
      }
    });

    // Invalidate first page cache
    feedCache.delete('feed-1-10');

    return response.data;
  } catch (error) {
    ErrorTracking.captureException(error, {
      context: 'createPost',
      contentLength: data.content.length,
      hasMedia: !!data.image
    });

    throw new Error('Failed to create post');
  }
};

// Clear cache on logout/network changes
export const invalidateFeedCache = () => {
  feedCache.clear();
  abortController = null;
};
