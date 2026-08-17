/// Vitest configuration.
///
/// Reuses the same path aliases as `vite.config.ts` so tests can import
/// from `@utils/*`, `~/...`, `@bindings/*` etc. just like the app. The
/// `@tauri-apps/api/*` modules are aliased to a thin stub because the
/// pure-function tests we run here never actually cross the IPC boundary
/// — we only need the types to resolve.

import path from 'node:path'

import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Tests import .tsx modules (e.g. ~/i18n) containing JSX. Vite 8 respects
  // tsconfig `jsx: "preserve"` and skips JSX transform, which breaks
  // import-analysis — so the solid plugin (proper JSX transform) is required.
  plugins: [solid()],
  resolve: {
    alias: {
      '@bindings': path.resolve(import.meta.dirname, './src-tauri/bindings'),
      '@components': path.resolve(import.meta.dirname, './src/components'),
      // Stub out Tauri IPC + plugin entry points. Any test that actually
      // needs to assert on `invoke()` calls should override these locally
      // via `vi.mock`.
      '@tauri-apps/api/core': path.resolve(
        import.meta.dirname,
        './src/test/stubs/tauri-core.ts'
      ),
      '@tauri-apps/api/event': path.resolve(
        import.meta.dirname,
        './src/test/stubs/tauri-event.ts'
      ),
      '@tauri-apps/plugin-dialog': path.resolve(
        import.meta.dirname,
        './src/test/stubs/tauri-dialog.ts'
      ),
      '@tauri-apps/plugin-fs': path.resolve(
        import.meta.dirname,
        './src/test/stubs/tauri-fs.ts'
      ),
      '@utils': path.resolve(import.meta.dirname, './src/utils'),
      '~': path.resolve(import.meta.dirname, './src')
    }
  },
  test: {
    // Avoid picking up `.tsx` component tests by default until we add the
    // solid-testing setup; keeps `pnpm run test` fast and dependency-free.
    coverage: {
      reporter: ['text']
    },
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts']
  }
})
