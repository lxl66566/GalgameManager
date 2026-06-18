/// Vitest configuration.
///
/// Reuses the same path aliases as `vite.config.ts` so tests can import
/// from `@utils/*`, `~/...`, `@bindings/*` etc. just like the app. The
/// `@tauri-apps/api/*` modules are aliased to a thin stub because the
/// pure-function tests we run here never actually cross the IPC boundary
/// — we only need the types to resolve.

import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@bindings': path.resolve(__dirname, './src-tauri/bindings'),
      // Stub out Tauri IPC + plugin entry points. Any test that actually
      // needs to assert on `invoke()` calls should override these locally
      // via `vi.mock`.
      '@tauri-apps/api/core': path.resolve(__dirname, './src/test/stubs/tauri-core.ts'),
      '@tauri-apps/api/event': path.resolve(__dirname, './src/test/stubs/tauri-event.ts'),
      '@tauri-apps/plugin-dialog': path.resolve(__dirname, './src/test/stubs/tauri-dialog.ts'),
      '@tauri-apps/plugin-fs': path.resolve(__dirname, './src/test/stubs/tauri-fs.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Avoid picking up `.tsx` component tests by default until we add the
    // solid-testing setup; keeps `bun run test` fast and dependency-free.
    coverage: {
      reporter: ['text']
    }
  }
})
