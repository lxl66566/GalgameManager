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
    minify: process.env.TAURI_DEBUG ? false : 'esbuild',
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13'
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
    // virtua 的 solid 入口 ships .jsx with @jsxImportSource solid-js pragma；
    // esbuild 的 automatic runtime 转换与 babel-preset-solid 输出不完全一致，
    // 故交由 vite-plugin-solid 在请求管线中处理，不参与 dep optimizer。
    exclude: ['virtua'],
    // 预构建常用依赖：Vite 默认是"首次请求才 esbuild 预构建"，导致 dev
    // 冷启动时这些库的第一次 import 要等数百 ms。显式 include 让 Vite 在
    // dev server 启动阶段一次性预构建，避免首屏渲染被懒预构建阻塞。
    // 注意：@solidjs/router、@kobalte/core、solid-toast 不能加进来——它们
    // 经 vite-plugin-solid 的 'solid' export condition 解析为 .jsx 入口，
    // 而 Vite 的 OPTIMIZABLE_ENTRY_RE 不含 .jsx，include 只会触发
    // "Cannot optimize dependency" 警告（它们本来就走插件管线，无行为差异）。
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
