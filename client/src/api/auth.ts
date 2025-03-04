// client/src/api/auth.ts
import api from './api';
import { encryptData, decryptData } from '@/lib/crypto';
import { 
  LoginSchema, 
  RegisterSchema,
  type LoginFormData,
  type RegisterFormData 
} from '@/validations/auth';
import { type APIResponse } from '@/types/api';
import { ErrorTracking } from '@/lib/error-tracking';

// Token storage interface for abstraction
interface TokenStorage {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clearTokens(): void;
}

// Secure encrypted localStorage implementation
const EncryptedStorage: TokenStorage = {
  getAccessToken() {
    const token = localStorage.getItem('accessToken');
    return token ? decryptData(token) : null;
  },

  setAccessToken(token) {
    localStorage.setItem('accessToken', encryptData(token));
  },

  getRefreshToken() {
    const token = localStorage.getItem('refreshToken');
    return token ? decryptData(token) : null;
  },

  setRefreshToken(token) {
    localStorage.setItem('refreshToken', encryptData(token));
  },

  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
};

// Token validation types
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthResponse extends APIResponse<AuthTokens> {
  data: AuthTokens;
}

export class AuthService {
  private static storage: TokenStorage = EncryptedStorage;
  private static refreshPromise: Promise<AuthTokens> | null = null;

  // Secure token getters
  static get accessToken() {
    return this.storage.getAccessToken();
  }

  static get refreshToken() {
    return this.storage.getRefreshToken();
  }

  static async login(data: LoginFormData): Promise<AuthResponse> {
    try {
      const validated = LoginSchema.parse(data);
      const response = await api.post<AuthResponse>('/auth/login', validated);
      
      this.setTokens(response.data.data);
      return response.data;
      
    } catch (error) {
      ErrorTracking.captureException(error);
      this.clearTokens();
      throw this.handleError(error, 'Login failed');
    }
  }

  static async register(data: RegisterFormData): Promise<AuthResponse> {
    try {
      const validated = RegisterSchema.parse(data);
      const response = await api.post<AuthResponse>('/auth/register', validated);
      
      this.setTokens(response.data.data);
      return response.data;
      
    } catch (error) {
      ErrorTracking.captureException(error);
      this.clearTokens();
      throw this.handleError(error, 'Registration failed');
    }
  }

  static async refreshToken(): Promise<AuthTokens> {
    try {
      if (this.refreshPromise) return this.refreshPromise;
      
      const refreshToken = this.storage.getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token available');

      this.refreshPromise = api.post<AuthResponse>('/auth/refresh', { refreshToken })
        .then(response => {
          this.setTokens(response.data.data);
          return response.data.data;
        })
        .finally(() => {
          this.refreshPromise = null;
        });

      return this.refreshPromise;
      
    } catch (error) {
      this.clearAuth();
      ErrorTracking.captureException(error);
      throw this.handleError(error, 'Token refresh failed');
    }
  }

  static async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      ErrorTracking.captureException(error);
    } finally {
      this.clearAuth();
      window.location.href = '/login';
    }
  }

  static clearAuth() {
    this.storage.clearTokens();
    sessionStorage.clear();
  }

  private static setTokens({ accessToken, refreshToken, expiresIn }: AuthTokens) {
    this.storage.setAccessToken(accessToken);
    this.storage.setRefreshToken(refreshToken);
    this.scheduleTokenRefresh(expiresIn);
  }

  private static scheduleTokenRefresh(expiresIn: number) {
    const refreshTime = (expiresIn - 60) * 1000; // Refresh 1 minute before expiry
    setTimeout(() => this.refreshToken(), refreshTime);
  }

  private static handleError(error: unknown, defaultMessage: string): Error {
    if (error instanceof ZodError) {
      return new Error(error.errors[0].message);
    }
    
    const message = error instanceof Error ? error.message : defaultMessage;
    return new Error(message);
  }
}

// Auth interceptor for API client
api.interceptors.request.use(config => {
  const token = AuthService.accessToken;
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        await AuthService.refreshToken();
        return api(originalRequest);
      } catch (refreshError) {
        AuthService.clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
