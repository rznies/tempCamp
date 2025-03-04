import { Suspense, lazy, memo } from 'react'
import { 
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation
} from 'react-router-dom'
import { ThemeProvider } from './components/ui/theme-provider'
import { Toaster } from './components/ui/toaster'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingState } from './components/ui/loading-state'
import { AuthErrorBoundary } from '@/components/auth/AuthErrorBoundary'
import { useSessionMonitor } from '@/hooks/useSessionMonitor'

// Lazy load main components
const Layout = lazy(() => import('./components/Layout'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Feed = lazy(() => import('./pages/Feed'))
const Chat = lazy(() => import('./pages/Chat'))
const Compliments = lazy(() => import('./pages/Compliments'))
const Matches = lazy(() => import('./pages/Matches'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))

// Memoized protected route wrapper
const ProtectedRoute = memo(({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
})

// Centralized route configuration
const routes = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { 
    path: '/onboarding',
    element: (
      <ProtectedRoute>
        <Onboarding />
      </ProtectedRoute>
    )
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Feed /> },
      { path: 'chat', element: <Chat /> },
      { path: 'compliments', element: <Compliments /> },
      { path: 'matches', element: <Matches /> },
      { path: 'leaderboard', element: <Leaderboard /> }
    ]
  }
]

const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <ThemeProvider defaultTheme="light" storageKey="ui-theme">
      {children}
    </ThemeProvider>
  </AuthProvider>
)

const AppRouter = () => {
  useSessionMonitor()
  
  return (
    <Router>
      <Routes>
        {routes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <Suspense fallback={<LoadingState height="100vh" />}>
                {route.element}
              </Suspense>
            }
          >
            {route.children?.map((child) => (
              <Route
                key={child.path || 'index'}
                index={child.index}
                path={child.path}
                element={
                  <Suspense fallback={<LoadingState />}>
                    {child.element}
                  </Suspense>
                }
              />
            ))}
          </Route>
        ))}
      </Routes>
      <Toaster />
    </Router>
  )
}
export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}