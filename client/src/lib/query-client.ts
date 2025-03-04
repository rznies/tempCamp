import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      networkMode: 'offlineFirst'
    }
  }
})

export const sessionStoragePersister = createSyncStoragePersister({
  storage: window.sessionStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE'
})