// src/pages/Statistics/GamePlaytimeBars.tsx
// Per-game horizontal bar list: [thumbnail] [name over (thin bar + duration)].
// Bar length is proportional to the game's playtime within the current
// statistics scope. Kept as HTML + CSS transitions (not d3): it is a list of
// rich rows (images, text), where d3/SVG would only add friction.
//
// Linkage:
// - Hovering a row calls `onHoverGame`, driving the stacked chart's focus mode.
// - `highlightGameId` (a segment hovered in the stacked chart) keeps that row
//   intact and fades all others.
import CachedImage from '@components/ui/CachedImage'
import { useI18n } from '~/i18n'
import { For, Show, type Component } from 'solid-js'
import { formatDuration, type DurationUnits } from './timeRange'

export interface GameBarRow {
  id: number
  name: string
  imageUrl: string | null
  imageHash: string | null
  secs: number
  color: string
}

interface GamePlaytimeBarsProps {
  rows: GameBarRow[]
  highlightGameId: number | null
  onHoverGame: (id: number | null) => void
  units: DurationUnits
  class?: string
}

const GamePlaytimeBars: Component<GamePlaytimeBarsProps> = props => {
  const { t } = useI18n()
  const maxSecs = () => Math.max(1, ...props.rows.map(r => r.secs))

  return (
    <div class={`flex flex-col gap-1 ${props.class ?? ''}`}>
      <Show
        when={props.rows.length > 0}
        fallback={
          <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('stats.noDataInScope')}
          </div>
        }
      >
        <For each={props.rows}>
          {row => {
            const dimmed = () =>
              props.highlightGameId != null && props.highlightGameId !== row.id
            return (
              <div
                class="flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 transition-opacity duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                classList={{ 'opacity-40': dimmed() }}
                onMouseEnter={() => props.onHoverGame(row.id)}
                onMouseLeave={() => props.onHoverGame(null)}
              >
                <CachedImage
                  url={row.imageUrl}
                  hash={row.imageHash}
                  alt={row.name}
                  class="h-10 w-10 shrink-0 rounded"
                />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    class="truncate text-sm font-medium"
                    style={{ color: row.color }}
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <div class="flex items-center gap-2">
                    <div
                      class="h-1.5 min-w-3 rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${(row.secs / maxSecs()) * 100}%`,
                        'background-color': row.color
                      }}
                    />
                    <span class="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {formatDuration(row.secs, props.units)}
                    </span>
                  </div>
                </div>
              </div>
            )
          }}
        </For>
      </Show>
    </div>
  )
}

export default GamePlaytimeBars
