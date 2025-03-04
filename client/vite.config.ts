import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, splitVendorChunkPlugin } from "vite"
import { visualizer } from "rollup-plugin-visualizer"
import environment from "vite-plugin-environment"
import viteCompression from "vite-plugin-compression"
import { createHtmlPlugin } from "vite-plugin-html"

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    splitVendorChunkPlugin(),
    // Security headers can be added through server middleware instead
    environment({
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || "https://api.campusphere.com",
      VITE_SENTRY_DSN: null,
      VITE_APP_VERSION: null,
    }, {
      prefix: "VITE_",
      loadEnvFiles: mode === "development",
    }),
    viteCompression({
      algorithm: "brotliCompress",
      threshold: 10240, // 10kb
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          analytics: mode === "production" 
            ? '<script src="https://cdn.analytics.com/script.js" async defer></script>'
            : '',
        },
      },
    }),
    mode === "analyze" && visualizer({
      open: true,
      filename: "bundle-analysis.html",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    minify: "terser",
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-*", "@headlessui/react"],
          formatters: ["date-fns", "lodash-es"],
        },
      },
    },
    terserOptions: {
      compress: {
        drop_console: mode !== "development",
        pure_funcs: ["console.debug"],
      },
    },
    assetsInlineLimit: 4096, // 4kb
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: process.env.NODE_ENV === "production",
        rewrite: path => path.replace(/^\/api/, ''),
      }
    },
    hmr: {
      protocol: "wss",
      timeout: 3000,
    },
    headers: {
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    allowedHosts: [
      'localhost',
      '.deployments.pythagora.ai'
    ],
  },
  css: {
    devSourcemap: mode === "development",
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    https: process.env.NODE_ENV === "production",
  },
}))
