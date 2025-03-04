import { Component, ErrorInfo, ReactNode } from "react";
import { ErrorTracking } from "@/lib/error-tracking";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    ErrorTracking.captureException(error, {
      componentStack: info.componentStack
    });
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
          <img src="/error-meme.gif" alt="Error" className="w-64 h-64 mb-4 rounded-lg shadow-lg" />
          <h1 className="text-2xl font-bold mb-2">Oops, vibe check failed! 🥲</h1>
          <p className="text-gray-600 mb-4">
            Something broke the flow. Let's refresh and try again!
          </p>
          <Button onClick={() => window.location.reload()}>
            Reset Vibe ↻
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}