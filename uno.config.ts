import presetWind4, { type Theme } from '@unocss/preset-wind4'
import { defineConfig, type UserConfig } from 'unocss'
import { presetScrollbarHide } from 'unocss-preset-scrollbar-hide'

export default defineConfig({
  preflights: [
    {
      getCSS: () => `
        button {
          cursor: pointer;
        }

        * {
          scrollbar-width: thin;
        }

        .drag-none, .drag-none * {
          -webkit-user-drag: none;
          user-drag: none;
          user-select: none;
        }

        @keyframes ggm-rewind {
          to { transform: rotate(-360deg); }
        }
        /* One-shot counter-clockwise spin with an asymmetric ease curve:
           accelerates gently over the first ~50%, then brakes harder and
           faster than it sped up (deceleration > acceleration, because the
           decel window is shorter). Smooth — not stepped. Matches the
           FiRotateCcw glyph direction. Plays once. */
        .ggm-rewind {
          animation: ggm-rewind 600ms cubic-bezier(0.5, 0, 0.7, 1);
        }
      `
    }
  ],
  presets: [
    presetWind4({
      dark: 'class'
    }),
    presetScrollbarHide()
  ]
}) satisfies UserConfig<Theme> as UserConfig<Theme>
