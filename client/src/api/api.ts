import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse, CancelTokenSource } from "axios";
import { toast } from "sonner";

// Custom error class for better TypeScript safety
class ApiError extends Error {
  status?: number; // HTTP status code, like 404 or 500
  data?: any; // Additional server response data
  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

// Extend AxiosRequestConfig to include our custom retry properties
interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  _retryCount?: number; // Track retry attempts
  _maxRetries?: number; // Maximum retries allowed
  _retry?: boolean; // Track if this request has been retried
}

// Create the API instance with config
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api", // Use env for flexibility
  timeout: 10000, // 10 seconds—faster but still fair
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config: CustomAxiosRequestConfig): CustomAxiosRequestConfig => {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: AxiosError) => {
    console.error("Request setup failed:", error);
    return Promise.reject(new ApiError("Request preparation failed", undefined, error));
  }
);

// Response interceptor with retry logic, timeouts, and error handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError): Promise<AxiosResponse> => {
    const config = error.config as CustomAxiosRequestConfig;

    // Handle cancellation
    if (axios.isCancel(error)) {
      return Promise.reject(new ApiError("Request was canceled", 0));
    }

    // Handle network errors with retries
    if (!error.response) {
      const maxRetries = config._maxRetries ?? 3; // Default to 3 retries
      const retryCount = (config._retryCount ?? 0) + 1;

      if (retryCount <= maxRetries) {
        config._retryCount = retryCount;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff (1s, 2s, 3s)
        toast.info(`Retrying request (${retryCount}/${maxRetries})...`);
        return api(config); // Retry the request
      }
      toast.error("Network error. Please check your connection.");
      return Promise.reject(new ApiError("No network after retries", undefined, error));
    }

    // Handle token expiration (401)
    if (error.response.status === 401 && !config._retry) {
      config._retry = true;
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) throw new ApiError("No refresh token available", 401);

        const { data } = await axios.post<AxiosResponse>(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken },
          { timeout: 10000 }
        );

        if (data.data.accessToken) {
          localStorage.setItem("accessToken", data.data.accessToken);
          if (config.headers) {
            config.headers.Authorization = `Bearer ${data.data.accessToken}`;
          }
          return api(config); // Retry with new token
        }
        throw new ApiError("Failed to refresh token", 401);
      } catch (refreshError) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(new ApiError("Token refresh failed", 401, refreshError));
      }
    }

    // Handle rate limiting (429)
    if (error.response.status === 429) {
      toast.error("Too many requests! Chill for a bit.");
    }

    // Handle server errors (500+)
    if (error.response.status >= 500) {
      toast.error("Server’s having a bad day. We’re on it!");
    }

    return Promise.reject(new ApiError(error.response?.data.message || "Request failed", error.response?.status, error.response?.data));
  }
);

// Generic API request wrapper with cancellation and typing
interface ApiRequestOptions extends AxiosRequestConfig {
  retries?: number; // Optional retry count
}

export const apiRequest = async <T>(config: ApiRequestOptions): Promise<AxiosResponse<T>> => {
  const source: CancelTokenSource = axios.CancelToken.source();
  config.cancelToken = source.token;

  try {
    const response = await api.request<T>({
      ...config,
      _maxRetries: config.retries ?? 3, // Default to 3 retries
      _retryCount: 0, // Initialize retry count
      _retry: false, // Initialize retry flag
    });
    return response;
  } catch (error) {
    if (axios.isCancel(error)) {
      throw new ApiError("Request canceled", 0);
    }
    throw error; // Re-throw ApiError from interceptor
  } finally {
    // No cleanup needed here—source is scoped per request
  }
};

// Cancel all requests (optional utility, not used in this context but included for completeness)
export const cancelAllRequests = () => {
  console.warn("Cancel all requests not fully implemented—use per-request cancellation with apiRequest");
};

export default apiRequest; // Export the wrapper for use in other files