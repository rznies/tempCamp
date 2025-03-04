import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HelmetProvider } from 'react-helmet-async'
import { enableMapSet } from 'immer'
import { configureTMD } from '@tmdeditor/core'
import './index.css'
import App from './App'

// 1. Performance & Animation Setup
enableMapSet() // For performant state updates
configureTMD({ baseAnimationDuration: 200 }) // Smooth animation defaults

// 2. Gen-Z Focused Error Boundary
const MemeErrorFallback = () => (
  <div role="alert" className="min-h-screen flex flex-col items-center justify-center p-4 bg-popover">
    <img 
      src="/meme-error.gif" 
      alt="Error occured" 
      className="max-w-[300px] mb-6 rounded-lg"
      loading="eager"
    />
    <h1 className="text-2xl font-bold mb-2 text-center">Oops, that's awkward! 🫠</h1>
    <p className="text-muted-foreground text-center mb-6">
      Something broke the vibe. Refresh to get back in the flow!
    </p>
    <button
      onClick={() => window.location.reload()}
      className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-medium hover:bg-primary/90 transition-colors"
    >
      Fix the Vibe 🔄
    </button>
  </div>
)

// 3. Preload critical fonts for meme text styling
const fontPreload = document.createElement('link')
fontPreload.rel = 'preload'
fontPreload.href = '/fonts/comic-neue-v8-latin-700.woff2'
fontPreload.as = 'font'
fontPreload.crossOrigin = 'anonymous'
document.head.appendChild(fontPreload)

// 4. Root element configuration
const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find root element')
rootElement.setAttribute('data-genz-app', 'true')
rootElement.setAttribute('aria-live', 'polite')

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary 
      fallback={<MemeErrorFallback />}
      onError={(error) => {
        // 5. Real-time error logging
        if (import.meta.env.VITE_SENTRY_DSN) {
          import('@sentry/react').then((Sentry) => {
            Sentry.captureException(error)
          })
        }
      }}
    >
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>
)

// 6. PRD-Required WebSocket Connection (Complement System)
if (import.meta.env.VITE_WS_URL) {
  const ws = new WebSocket(import.meta.env.VITE_WS_URL)
  ws.onopen = () => {
    ws.send(JSON.stringify({ 
      type: 'INIT_CLIENT',
      userAgent: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height}`
    }))
  }
}

// 7. Enforce PRD performance requirements
if (import.meta.env.PROD) {
  if ('ReactInspector' in window) {
    window.ReactInspector = undefined // Disable React DevTools in production
  }
  window.console.debug = () => {} // Disable debug logs
}
