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

        @keyframes ggm-breathing {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        /* Slow, gentle opacity pulse for entry-point affordances (Steam
           import icon): alive enough to invite a click, calm enough not to
           compete with the form. Pauses while hovered so the icon reads as
           solid next to the expanded label. */
        .ggm-breathing {
          animation: ggm-breathing 3s ease-in-out infinite;
        }
        .group:hover .ggm-breathing {
          animation-play-state: paused;
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
