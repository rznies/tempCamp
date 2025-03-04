import * as Sentry from "@sentry/react";
import { APIError, ErrorCode } from "@/types/api";

export class ErrorTracking {
  static init() {
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [
          new Sentry.BrowserTracing(),
          new Sentry.Replay(),
        ],
        environment: import.meta.env.MODE,
        release: `campusphere@${import.meta.env.VITE_APP_VERSION}`,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });
    }
  }

  static captureException(
    error: Error,
    context?: Record<string, any>
  ) {
    console.error(error);
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: context });
    }
  }

  static captureAPIError(
    error: APIError,
    context?: Record<string, any>
  ) {
    this.captureException(new Error(error.message), {
      ...context,
      code: error.code
    });
  }
}