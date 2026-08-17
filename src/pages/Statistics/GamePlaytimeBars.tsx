// src/pages/Statistics/GamePlaytimeBars.tsx
// Per-game horizontal bar list: [thumbnail] [name over (thin bar + duration)].
// Bar length is proportional to the game's playtime within the current
// statistics scope. Kept as HTML + CSS transitions (not d3): it is a list of
// rich rows (images, text), where d3/SVG would only add friction.
//
// Linkage:
// - Hovering a row calls `onHoverGame`, driving the stacked chart's focus mode.
// - `highlightGameId` (a segment hovered in the stacked chart) keeps that row
//   intact and fades all others, and also auto-scrolls it into view — so the
//   user can hover any column up top and immediately see the linked row even
//   when the list is scrolled.
import CachedImage from '@components/ui/CachedImage'
import { createEffect, For, Show, type Component } from 'solid-js'

import { useI18n } from '~/i18n'

import { formatDuration, type DurationUnits } from './timeRange'

export interface GameBarRow {
  color: string
  id: number
  imageHash: null | string
  imageUrl: null | string
  name: string
  secs: number
}

interface GamePlaytimeBarsProps {
  class?: string
  highlightGameId: null | number
  onHoverGame: (id: null | number) => void
  rows: GameBarRow[]
  units: DurationUnits
}

const GamePlaytimeBars: Component<GamePlaytimeBarsProps> = props => {
  const { t } = useI18n()
  const maxSecs = () => Math.max(1, ...props.rows.map(r => r.secs))

  // When the stacked chart highlights a game (chart segment hover), bring the
  // matching row into view. `scrollIntoView({ block: 'nearest' })` is a no-op
  // when the row is already visible, so this only ever scrolls the minimum
  // distance — and only the closest scrollable ancestor (the list wrapper),
  // never the outer page (which does not scroll).
  let rootRef: HTMLDivElement | undefined
  createEffect(() => {
    const id = props.highlightGameId
    if (id == undefined || !rootRef) return
    // querySelector rather than per-row refs: rows are re-created on each
    // scope change (new object literals), so a ref Map would need cleanup.
    const element = rootRef.querySelector<HTMLElement>(
      `[data-game-id="${CSS.escape(String(id))}"]`
    )
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })

  return (
    <div class={`flex flex-col gap-1 ${props.class ?? ''}`} ref={rootRef}>
      <Show
        fallback={
          <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('stats.noDataInScope')}
          </div>
        }
        when={props.rows.length > 0}
      >
        <For each={props.rows}>
          {row => {
            const dimmed = () =>
              props.highlightGameId != undefined && props.highlightGameId !== row.id
            return (
              <div
                class="flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 transition-opacity duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                classList={{ 'opacity-40': dimmed() }}
                data-game-id={row.id}
                onMouseEnter={() => {
                  props.onHoverGame(row.id)
                }}
                onMouseLeave={() => {
                  props.onHoverGame(null)
                }}
              >
                <CachedImage
                  alt={row.name}
                  class="h-10 w-10 shrink-0 rounded"
                  hash={row.imageHash}
                  url={row.imageUrl}
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
                        'background-color': row.color,
                        width: `${(row.secs / maxSecs()) * 100}%`
                      }}
                    />
                    <span class="shrink-0 text-xs text-gray-500 tabular-nums dark:text-gray-400">
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
