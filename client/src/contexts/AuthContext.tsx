import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
} from 'react';
import { useEventCallback } from '@/hooks/useEventCallback';
import { AuthService } from '@/services/AuthService';
import { ErrorTracking } from '@/lib/error-tracking';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import type { User, Tokens } from '@/types/auth';

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
};

type AuthActions = {
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: (options?: { silent?: boolean }) => Promise<void>;
  refreshToken: () => Promise<void>;
};

const AuthStateContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  isInitializing: true,
});

const AuthActionsContext = createContext<AuthActions>({
  login: async () => {},
  logout: async () => {},
  refreshToken: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useSessionStorage<AuthState>('auth', {
    user: null,
    isAuthenticated: false,
    isInitializing: true,
  });

  // Separate token storage with encryption
  const [rawTokens, setRawTokens] = useSessionStorage<Tokens | null>(
    'auth-tokens',
    null
  );

  const handleLogout = useEventCallback(async (options = { silent: false }) => {
    try {
      await AuthService.logout();
      setState({ user: null, isAuthenticated: false, isInitializing: false });
      setRawTokens(null);
      if (!options.silent) {
        window.location.href = '/login';
      }
    } catch (error) {
      ErrorTracking.captureException(error);
      if (!options.silent) throw error;
    }
  });

  const handleLogin = useEventCallback(
    async (credentials: { email: string; password: string }) => {
      try {
        setState(prev => ({ ...prev, isInitializing: true }));
        const { user, tokens } = await AuthService.login(credentials);
        setRawTokens(tokens);
        setState({ user, isAuthenticated: true, isInitializing: false });
      } catch (error) {
        await handleLogout({ silent: true });
        ErrorTracking.captureException(error);
        throw error;
      }
    }
  );

  const handleRefreshToken = useEventCallback(async () => {
    try {
      if (!rawTokens?.refreshToken) return;
      const { user, tokens } = await AuthService.refreshToken(rawTokens);
      setRawTokens(tokens);
      setState({ user, isAuthenticated: true, isInitializing: false });
    } catch (error) {
      await handleLogout({ silent: true });
      ErrorTracking.captureException(error);
    }
  });

  // Silent token refresh check on mount
  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      if (rawTokens?.accessToken && AuthService.isTokenValid(rawTokens.accessToken)) {
        try {
          const user = await AuthService.silentCheck();
          if (isMounted) {
            setState({ user, isAuthenticated: true, isInitializing: false });
          }
        } catch (error) {
          if (isMounted) await handleLogout({ silent: true });
        }
      } else {
        if (isMounted) setState(prev => ({ ...prev, isInitializing: false }));
      }
    };

    checkAuth();
    return () => { isMounted = false };
  }, []);

  // Memoize context values to prevent unnecessary re-renders
  const stateValue = useMemo(
    () => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      isInitializing: state.isInitializing
    }),
    [state.user, state.isAuthenticated, state.isInitializing]
  );

  const actionsValue = useMemo(
    () => ({
      login: handleLogin,
      logout: handleLogout,
      refreshToken: handleRefreshToken
    }),
    [handleLogin, handleLogout, handleRefreshToken]
  );

  return (
    <AuthActionsContext.Provider value={actionsValue}>
      <AuthStateContext.Provider value={stateValue}>
        {children}
      </AuthStateContext.Provider>
    </AuthActionsContext.Provider>
  );
}

export function useAuthState() {
  const context = useContext(AuthStateContext);
  if (!context) {
    throw new Error('useAuthState must be used within an AuthProvider');
  }
  return context;
}

export function useAuthActions() {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error('useAuthActions must be used within an AuthProvider');
  }
  return context;
}

// Optimized hook for components that only need auth status
export function useIsAuthenticated() {
  const { isAuthenticated } = useAuthState();
  return isAuthenticated;
}
