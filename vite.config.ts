import path from 'node:path'
import process from 'node:process'

import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    cssMinify: process.env.TAURI_DEBUG ? false : 'lightningcss',
    // don't minify for debug builds
    // vite 8 (rolldown): the esbuild minifier needs an extra dependency and its
    // API is deprecated, so use the built-in oxc minifier instead.
    minify: process.env.TAURI_DEBUG ? false : 'oxc',
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux.
    // NOTE: must be >= safari15 — esbuild cannot lower destructuring below
    // that version ("Transforming destructuring ... is not supported yet"),
    // and any modern WKWebView/WebKitGTK supports destructuring natively anyway.
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari15'
  },
  // prevent vite from obscuring rust errors
  clearScreen: false,
  // to access the Tauri environment variables set by the CLI with information about the current target
  envPrefix: [
    'VITE_',
    'TAURI_PLATFORM',
    'TAURI_ARCH',
    'TAURI_FAMILY',
    'TAURI_PLATFORM_VERSION',
    'TAURI_PLATFORM_TYPE',
    'TAURI_DEBUG'
  ],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'solid-js'
  },
  optimizeDeps: {
    // virtua's solid entry ships .jsx with a @jsxImportSource pragma, whose
    // output differs from babel-preset-solid; let vite-plugin-solid handle it
    // in the request pipeline instead of the dep optimizer.
    exclude: ['virtua'],
    // Pre-bundle common deps: Vite only pre-bundles on first request, so the
    // first dev import of these would stall cold start by hundreds of ms.
    // Explicit include builds them once at dev-server startup.
    // NOTE: do NOT add @solidjs/router, @kobalte/core or solid-toast — they
    // resolve to .jsx entries via vite-plugin-solid's 'solid' export condition,
    // and OPTIMIZABLE_ENTRY_RE excludes .jsx, so include only triggers a
    // "Cannot optimize dependency" warning (they go through the plugin
    // pipeline anyway, no behavior difference).
    include: [
      'solid-js',
      'solid-js/web',
      'solid-js/store',
      '@tauri-apps/api',
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-opener',
      'clsx',
      'tailwind-merge',
      'dayjs'
    ]
  },
  plugins: [UnoCSS(), solid()],
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, './src')
    },
    tsconfigPaths: true
  },
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    hmr: host
      ? {
          host,
          port: 1421,
          protocol: 'ws'
        }
      : undefined,
    host: host || false,
    port: 1420,
    strictPort: true,
    watch: {
      // Ignore watching `src-tauri`
      ignored: ['**/src-tauri/**']
    }
  }
})
