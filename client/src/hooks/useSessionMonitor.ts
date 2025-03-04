import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthService } from '@/services/auth.service'

export function useSessionMonitor() {
  const { logout } = useAuth()

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        AuthService.silentCheck().catch(logout)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [logout])
}