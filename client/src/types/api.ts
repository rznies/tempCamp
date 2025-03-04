// Standard API response format
export interface APIResponse<T = any> {
  data?: T;
  error?: APIError;
  meta?: APIMeta;
}

export interface APIError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
}

export interface APIMeta {
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

// Error codes from backend
export enum ErrorCode {
  InvalidInput = "invalid_input",
  Unauthorized = "unauthorized",
  RateLimited = "rate_limited",
  ServerError = "server_error",
  NotFound = "not_found"
}

// Extended error type for client-side errors
export type ClientError = {
  type: "network" | "timeout" | "abort";
  message: string;
  status?: number;
};

// Pagination parameters for API requests
export interface PaginationParams {
  page: number;
  limit: number;
}