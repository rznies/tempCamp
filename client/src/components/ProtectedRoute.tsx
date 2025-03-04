import { 
  useEffect, 
  useState, 
  useMemo, 
  useCallback 
} from 'react'
import { 
  Navigate, 
  useLocation, 
  useNavigate 
} from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useRefreshToken } from '@/hooks/useRefreshToken'
import { FullPageLoading } from '@/components/FullPageLoading'
import { ErrorTracking } from '@/lib/error-tracking'
import { AuthService } from '@/services/auth.service'
import { AuthErrorBoundary } from '@/components/AuthErrorBoundary'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: string[]
  redirectPath?: string
}

// Token expiration buffer (5 minutes)
const TOKEN_EXPIRATION_BUFFER = 5 * 60 * 1000 

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) {
    sessionStorage.setItem('redirectReason', JSON.stringify({
      from: location.pathname,
      reason: 'session_expired',
      timestamp: Date.now()
    }))
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <AuthErrorBoundary>{children}</AuthErrorBoundary>
}
