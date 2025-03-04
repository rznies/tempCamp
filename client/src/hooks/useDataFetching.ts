import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ErrorTracking } from '@/lib/error-tracking';

type CacheStrategy = 'memory' | 'session' | 'none';
type RequestConfig = {
  cacheKey?: string;
  cacheDuration?: number;
  cacheStrategy?: CacheStrategy;
  retries?: number;
  retryDelay?: number;
  autoRefresh?: boolean;
  abortTimeout?: number;
};

const DEFAULT_CONFIG: Required<RequestConfig> = {
  cacheKey: '',
  cacheDuration: 5 * 60 * 1000, // 5 minutes
  cacheStrategy: 'memory',
  retries: 2,
  retryDelay: 1000,
  autoRefresh: false,
  abortTimeout: 30 * 1000 // 30 seconds
};

const memoryCache = new Map<string, { data: any; timestamp: number }>();

export function useDataFetching<T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = [],
  config: RequestConfig = DEFAULT_CONFIG
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const getCache = useCallback(() => {
    switch(fullConfig.cacheStrategy) {
      case 'session':
        const sessionData = sessionStorage.getItem(fullConfig.cacheKey || '');
        return sessionData ? JSON.parse(sessionData) : null;
      case 'memory':
        return memoryCache.get(fullConfig.cacheKey || '');
      default:
        return null;
    }
  }, [fullConfig.cacheKey, fullConfig.cacheStrategy]);

  const setCache = useCallback((data: T) => {
    const cacheItem = { data, timestamp: Date.now() };
    
    switch(fullConfig.cacheStrategy) {
      case 'session':
        if (fullConfig.cacheKey) {
          sessionStorage.setItem(fullConfig.cacheKey, JSON.stringify(cacheItem));
        }
        break;
      case 'memory':
        if (fullConfig.cacheKey) {
          memoryCache.set(fullConfig.cacheKey, cacheItem);
        }
        break;
    }
  }, [fullConfig.cacheKey, fullConfig.cacheStrategy]);

  const clearCache = useCallback(() => {
    if (fullConfig.cacheKey) {
      switch(fullConfig.cacheStrategy) {
        case 'session':
          sessionStorage.removeItem(fullConfig.cacheKey);
          break;
        case 'memory':
          memoryCache.delete(fullConfig.cacheKey);
          break;
      }
    }
  }, [fullConfig.cacheKey, fullConfig.cacheStrategy]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setError(null);
    
    abortController.current?.abort();
    abortController.current = new AbortController();
    
    const timeoutId = setTimeout(
      () => abortController.current?.abort(),
      fullConfig.abortTimeout
    );

    try {
      let cachedData = null;
      if (!forceRefresh && fullConfig.cacheKey && fullConfig.cacheStrategy !== 'none') {
        cachedData = getCache();
        if (cachedData && Date.now() - cachedData.timestamp < fullConfig.cacheDuration) {
          if (currentRequestId === requestId.current) {
            setData(cachedData.data);
            setIsLoading(false);
          }
          return;
        }
      }

      let retries = fullConfig.retries;
      while (retries >= 0) {
        try {
          const response = await fetchFn();
          
          if (currentRequestId === requestId.current) {
            setData(response);
            setCache(response);
            setIsLoading(false);
          }
          break;
        } catch (error) {
          if (retries === 0) throw error;
          retries--;
          await new Promise(resolve => 
            setTimeout(resolve, fullConfig.retryDelay)
          );
        }
      }
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setError(error as Error);
        setIsLoading(false);
        ErrorTracking.captureException(error);
        if (error.name !== 'AbortError') {
          toast.error('Failed to fetch data');
        }
      }
    } finally {
      clearTimeout(timeoutId);
      if (currentRequestId === requestId.current) {
        setIsLoading(false);
      }
    }
  }, [fetchFn, fullConfig, getCache, setCache]);

  // Auto-refresh effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (fullConfig.autoRefresh && fullConfig.cacheDuration) {
      intervalId = setInterval(fetchData, fullConfig.cacheDuration);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchData, fullConfig.autoRefresh, fullConfig.cacheDuration]);

  // Dependency change effect
  useEffect(() => {
    fetchData();
    return () => abortController.current?.abort();
    // Using JSON.stringify for dependencies array comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, JSON.stringify(dependencies)]);

  return { 
    data, 
    isLoading, 
    error, 
    refetch: fetchData,
    clearCache,
    abort: () => abortController.current?.abort() 
  };
}
