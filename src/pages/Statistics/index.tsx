// src/pages/Statistics/index.tsx
// Playtime statistics: a d3 stacked bar chart (time buckets × games) linked
// two-ways with a per-game horizontal bar list.
//
// Data comes straight from the reactive config store — every game's
// `dailyPlaytime` map is updated (and emitted via `config://updated`) by the
// backend on each save, so the charts refresh live after a game exits.
//
// Time selection is modeled as { granularity, offset } resolved into plain
// buckets (see timeRange.ts); adding a free-form date-range picker later only
// needs to produce a different `Bucket[]`, the charts won't change.
import { Button } from '@components/ui/Button'
import * as Popover from '@kobalte/core/popover'
import { FiChevronLeft, FiChevronRight, FiRotateCcw } from 'solid-icons/fi'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  type Component
} from 'solid-js'

import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { useConfig } from '~/store'

import { goldenColor } from './gameColors'
import GamePlaytimeBars, { type GameBarRow } from './GamePlaytimeBars'
import StackedPlaytimeChart, {
  type ChartHover,
  type ChartSeriesItem
} from './StackedPlaytimeChart'
import {
  addDays,
  aggregate,
  dateKey,
  formatDuration,
  localeFirstWeekday,
  offsetForDate,
  parseDateKey,
  perGameTotals,
  resolveSelection,
  type Granularity
} from './timeRange'

const GRANULARITIES: Granularity[] = ['week', 'month', 'year']

const StatisticsPage: Component = () => {
  const { locale, t } = useI18n()
  const { config } = useConfig()

  const [granularity, setGranularity] = createSignal<Granularity>('week')
  const [offset, setOffset] = createSignal(0)
  /** Hovered column of the stacked chart (+ the segment under the cursor). */
  const [hover, setHover] = createSignal<ChartHover | null>(null)
  /** Game hovered in the per-game list → drives the chart's focus mode. */
  const [focusGameId, setFocusGameId] = createSignal<null | number>(null)

  const weekFirstDay = createMemo(() => localeFirstWeekday(locale()))
  const range = createMemo(() =>
    resolveSelection({ granularity: granularity(), offset: offset() }, weekFirstDay())
  )
  const bucketData = createMemo(() => aggregate(config.games, range().buckets))
  const totals = createMemo(() => perGameTotals(bucketData()))
  const rangeTotalSecs = createMemo(() =>
    bucketData().reduce((sum, b) => sum + b.total, 0)
  )

  // Games with any playtime in range, longest first → stack & color order.
  const activeGames = createMemo(() => {
    const tot = totals()
    return config.games
      .filter(g => (tot.get(g.id) ?? 0) > 0)
      .toSorted((a, b) => (tot.get(b.id) ?? 0) - (tot.get(a.id) ?? 0))
  })

  // Colors: the cover-derived accent color is computed once on the Rust side
  // (piggybacking on `prepare_image` when a cover first loads anywhere in the
  // app) and cached on `Game.coverColor`, so it is available synchronously
  // here. Games without a usable cover — or when `extractCoverColor` is off —
  // fall back to a deterministic golden-angle HSL color. Both are keyed by
  // game id, so colors stay stable across hovers and ranges.
  const useCoverColor = () => config.settings.appearance.extractCoverColor
  const series = createMemo<ChartSeriesItem[]>(() =>
    activeGames().map(g => ({
      color: (useCoverColor() ? g.coverColor : null) ?? goldenColor(g.id),
      id: g.id,
      name: g.name
    }))
  )
  const colorOf = createMemo(() => new Map(series().map(s => [s.id, s.color] as const)))

  // The hovered bucket's keys no longer exist after a range change.
  createEffect(() => {
    range()
    setHover(null)
  })

  const units = createMemo(() => ({
    hour: t('unit.hourShort'),
    minute: t('unit.minuteShort'),
    second: t('unit.secondShort')
  }))

  const rangeLabel = createMemo(() => {
    const r = range()
    // Uniform ISO style for every granularity: '2026-07-13 - 2026-07-19'.
    return `${dateKey(r.start)} - ${dateKey(addDays(r.end, -1))}`
  })

  const [pickerOpen, setPickerOpen] = createSignal(false)

  /** Jump to the week / month / year containing the picked date. */
  const jumpToDate = (value: string) => {
    const d = parseDateKey(value)
    if (!d) return
    setOffset(Math.min(0, offsetForDate(granularity(), d, weekFirstDay())))
    setPickerOpen(false)
  }

  // Scope key of the per-game list ('all' or a bucket key). Hovering an
  // empty column counts as no focus ('all'), so moving across empty columns
  // keeps the same scope — and, since `rows` derives from this key (not from
  // raw hover), the list is not re-rendered at all.
  const listScope = createMemo(() => {
    const h = hover()
    if (!h) return 'all'
    const b = bucketData().find(x => x.key === h.bucketKey)
    return b && b.total > 0 ? b.key : 'all'
  })

  // Rows for the per-game list: normally the whole range; while a chart
  // column with data is hovered, only that bucket's slice.
  const rows = createMemo<GameBarRow[]>(() => {
    const scope = listScope()
    const colors = colorOf()
    const byId = new Map(config.games.map(g => [g.id, g] as const))
    const source =
      scope === 'all'
        ? totals()
        : (bucketData().find(b => b.key === scope)?.perGame ?? new Map<number, number>())
    return [...source]
      .filter(([, secs]) => secs > 0)
      .toSorted((a, b) => b[1] - a[1])
      .map(([id, secs]) => {
        const g = byId.get(id)
        return {
          color: colors.get(id) ?? '#9ca3af',
          id,
          imageHash: g?.imageSha256 ?? null,
          imageUrl: g?.imageUrl ?? null,
          name: g?.name ?? `#${id}`,
          secs
        }
      })
  })

  // Replay a subtle fade-in whenever the list's data scope flips — done via
  // WAAPI on the wrapper so rows (and their images) are never re-mounted.
  let listRef: HTMLDivElement | undefined
  createEffect(
    on(
      listScope,
      () => {
        listRef?.animate(
          [
            { opacity: 0, transform: 'translateY(3px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 200, easing: 'ease-out' }
        )
      },
      { defer: true }
    )
  )

  return (
    <div class="flex h-full flex-col text-gray-900 dark:text-gray-100">
      <div class="shrink-0 bg-white px-5 pt-3 pb-3 dark:bg-gray-900">
        <h1 class="text-2xl font-bold">{t('stats.self')}</h1>
      </div>

      <main class="flex min-h-0 flex-1 flex-col p-6 sm:p-8">
        <div class="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-6">
          {/* ── time controls ──
               Grid [1fr auto 1fr]: the left and right columns share the
               remaining space equally, so the center column is always
               centered on the *whole* toolbar — not just on whatever width
               is left after the side panels. That keeps the ← date →
               cluster perfectly centered regardless of whether the reset
               button (left) is shown or the duration label (right) changes
               length. */}
          <div class="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
            {/* granularity selector + reset-to-current.
                 The reset button only appears once the user navigates away
                 from the current period. On mount the icon plays a one-shot
                 counter-clockwise spin (ggm-rewind, 8 ticks) as a cue. */}
            <div class="flex items-center gap-1.5 justify-self-start">
              <div class="flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
                <For each={GRANULARITIES}>
                  {g => (
                    <button
                      class={cn(
                        'rounded-md px-3 py-1 text-sm transition-colors',
                        granularity() === g
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                      )}
                      onClick={() => {
                        setGranularity(g)
                        setOffset(0)
                      }}
                    >
                      {t(`stats.granularity.${g}`)}
                    </button>
                  )}
                </For>
              </div>

              <Show when={offset() !== 0}>
                <Button
                  aria-label={t('stats.backToCurrent')}
                  onClick={() => setOffset(0)}
                  size="icon"
                  title={t('stats.backToCurrent')}
                >
                  <span class="ggm-rewind inline-flex">
                    <FiRotateCcw />
                  </span>
                </Button>
              </Show>
            </div>

            {/* [←] [range label → date jump] [→], strictly centered */}
            <div class="flex items-center gap-1 justify-self-center">
              <Button
                aria-label={t('stats.prevPeriod')}
                onClick={() => setOffset(o => o - 1)}
                size="icon"
                title={t('stats.prevPeriod')}
              >
                <FiChevronLeft />
              </Button>

              <Popover.Root onOpenChange={setPickerOpen} open={pickerOpen()}>
                <Popover.Trigger
                  aria-label={t('stats.jumpToDate')}
                  class="rounded-md px-2 py-1 text-sm font-medium text-gray-700 tabular-nums hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  title={t('stats.jumpToDate')}
                >
                  {rangeLabel()}
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content class="z-50 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <div class="flex flex-col gap-2">
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {t('stats.jumpToDate')}
                      </span>
                      <input
                        class="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm tabular-nums dark:border-gray-600 dark:[color-scheme:dark]"
                        max={dateKey(new Date())}
                        onChange={e => {
                          jumpToDate(e.currentTarget.value)
                        }}
                        type="date"
                        value={dateKey(range().start)}
                      />
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              <Button
                aria-label={t('stats.nextPeriod')}
                disabled={offset() === 0}
                onClick={() => setOffset(o => Math.min(0, o + 1))}
                size="icon"
                title={t('stats.nextPeriod')}
              >
                <FiChevronRight />
              </Button>
            </div>

            <span class="justify-self-end text-sm text-gray-500 dark:text-gray-400">
              {t(
                `stats.periodPlaytime.${offset() === 0 ? 'current' : 'other'}.${granularity()}`
              )}
              :{' '}
              <span class="font-bold text-gray-900 dark:text-gray-100">
                {formatDuration(rangeTotalSecs(), units())}
              </span>
            </span>
          </div>

          <Show
            fallback={
              <div class="flex h-40 items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                {t(offset() === 0 ? 'stats.noDataCurrent' : 'stats.noDataPast')}
              </div>
            }
            when={rangeTotalSecs() > 0}
          >
            {/* ── stacked bar chart ──
                 The chart and the per-game list split the viewport
                 proportionally (flex-[3] vs flex-[2], i.e. ~60/40) instead of
                 the chart being a fixed height. min-h/max-h clamp the chart so
                 it stays readable on short windows and never wastes space on
                 tall ones; whatever is left goes to the list, which scrolls
                 internally. The chart's height is reactive (ResizeObserver
                 inside), so it always fills this flex item. */}
            <div class="flex max-h-[420px] min-h-[200px] flex-[3] flex-col rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <StackedPlaytimeChart
                data={bucketData()}
                focusGameId={focusGameId()}
                locale={locale()}
                onHover={setHover}
                series={series()}
                units={units()}
              />
            </div>

            {/* ── per-game bars ──
                 Takes the remaining ~40% of the viewport and scrolls
                 internally. min-h-0 lets it shrink below its content so the
                 chart's min-h always wins when the window is short. */}
            <div class="flex min-h-0 flex-[2] flex-col rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 class="mb-2 shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('stats.perGameTitle')}
              </h2>
              <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto" ref={listRef}>
                <GamePlaytimeBars
                  highlightGameId={hover()?.gameId ?? null}
                  onHoverGame={setFocusGameId}
                  rows={rows()}
                  units={units()}
                />
              </div>
            </div>
          </Show>
        </div>
      </main>
    </div>
  )
}

export default StatisticsPage
