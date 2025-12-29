import presetWind4, { type Theme } from '@unocss/preset-wind4'
import { defineConfig, type UserConfig } from 'unocss'
import { presetScrollbarHide } from 'unocss-preset-scrollbar-hide'

export default defineConfig({
  presets: [
    presetWind4({
      dark: 'class'
    }),
    presetScrollbarHide()
  ],
  preflights: [
    {
      getCSS: () => `
        button {
          cursor: pointer;
        }
      `
    }
  ]
}) satisfies UserConfig<Theme> as UserConfig<Theme>
