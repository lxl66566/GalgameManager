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
import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { useConfig } from '~/store'
import { FiChevronLeft, FiChevronRight } from 'solid-icons/fi'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  type Component
} from 'solid-js'
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

// Distinguishable on both light and dark backgrounds. Assigned by rank
// (longest-playing game first), so colors stay stable while hovering.
const PALETTE = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
  '#6366f1', // indigo
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#f43f5e' // rose
]

const GRANULARITIES: Granularity[] = ['week', 'month', 'year']

const StatisticsPage: Component = () => {
  const { t, locale } = useI18n()
  const { config } = useConfig()

  const [granularity, setGranularity] = createSignal<Granularity>('week')
  const [offset, setOffset] = createSignal(0)
  /** Hovered column of the stacked chart (+ the segment under the cursor). */
  const [hover, setHover] = createSignal<ChartHover | null>(null)
  /** Game hovered in the per-game list → drives the chart's focus mode. */
  const [focusGameId, setFocusGameId] = createSignal<number | null>(null)

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
      .sort((a, b) => (tot.get(b.id) ?? 0) - (tot.get(a.id) ?? 0))
  })

  const series = createMemo<ChartSeriesItem[]>(() =>
    activeGames().map((g, i) => ({
      id: g.id,
      name: g.name,
      color: PALETTE[i % PALETTE.length]
    }))
  )
  const colorOf = createMemo(() => new Map(series().map(s => [s.id, s.color] as const)))

  // The hovered bucket's keys no longer exist after a range change.
  createEffect(() => {
    range()
    setHover(null)
  })

  const units = createMemo(() => ({
    second: t('unit.secondShort'),
    minute: t('unit.minuteShort'),
    hour: t('unit.hourShort')
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

  // Rows for the per-game list: normally the whole range; while a chart
  // column with data is hovered, only that bucket's slice. Hovering an
  // empty column counts as no focus, so the list keeps the full range.
  const rows = createMemo<GameBarRow[]>(() => {
    const h = hover()
    const colors = colorOf()
    const byId = new Map(config.games.map(g => [g.id, g] as const))
    const bucket = h ? bucketData().find(b => b.key === h.bucketKey) : undefined
    const source = bucket && bucket.total > 0 ? bucket.perGame : totals()
    return [...source.entries()]
      .filter(([, secs]) => secs > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, secs]) => {
        const g = byId.get(id)
        return {
          id,
          name: g?.name ?? `#${id}`,
          imageUrl: g?.imageUrl ?? null,
          imageHash: g?.imageSha256 ?? null,
          secs,
          color: colors.get(id) ?? '#9ca3af'
        }
      })
  })

  // Scope key of the per-game list ('all' or a bucket key). Watched to
  // replay a subtle fade-in whenever the list's data scope flips — done via
  // WAAPI on the wrapper so rows (and their images) are never re-mounted.
  const listScope = createMemo(() => {
    const h = hover()
    if (!h) return 'all'
    const b = bucketData().find(x => x.key === h.bucketKey)
    return b && b.total > 0 ? b.key : 'all'
  })
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
      <div class="shrink-0 bg-white px-5 pb-3 pt-3 dark:bg-gray-900">
        <h1 class="text-2xl font-bold">{t('stats.self')}</h1>
      </div>

      <main class="flex-1 overflow-y-auto p-6 sm:p-8">
        <div class="mx-auto max-w-4xl space-y-6">
          {/* ── time controls ── */}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
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

            {/* [←] [range label → date jump] [→], centered as one group */}
            <div class="flex min-w-0 flex-1 items-center justify-center gap-1">
              <Button
                size="icon"
                onClick={() => setOffset(o => o - 1)}
                title={t('stats.prevPeriod')}
                aria-label={t('stats.prevPeriod')}
              >
                <FiChevronLeft />
              </Button>

              <Popover.Root open={pickerOpen()} onOpenChange={setPickerOpen}>
                <Popover.Trigger
                  class="rounded-md px-2 py-1 text-sm font-medium tabular-nums text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  title={t('stats.jumpToDate')}
                  aria-label={t('stats.jumpToDate')}
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
                        type="date"
                        class="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm tabular-nums dark:border-gray-600 dark:[color-scheme:dark]"
                        value={dateKey(range().start)}
                        max={dateKey(new Date())}
                        onChange={e => jumpToDate(e.currentTarget.value)}
                      />
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              <Button
                size="icon"
                onClick={() => setOffset(o => Math.min(0, o + 1))}
                disabled={offset() === 0}
                title={t('stats.nextPeriod')}
                aria-label={t('stats.nextPeriod')}
              >
                <FiChevronRight />
              </Button>
              <Show when={offset() !== 0}>
                <Button size="sm" onClick={() => setOffset(0)}>
                  {t('stats.backToCurrent')}
                </Button>
              </Show>
            </div>

            <span class="text-sm text-gray-500 dark:text-gray-400">
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
            when={rangeTotalSecs() > 0}
            fallback={
              <div class="flex h-40 items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                {t('stats.noData')}
              </div>
            }
          >
            {/* ── stacked bar chart ── */}
            <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <StackedPlaytimeChart
                data={bucketData()}
                series={series()}
                focusGameId={focusGameId()}
                onHover={setHover}
                units={units()}
                locale={locale()}
              />
            </div>

            {/* ── per-game bars ── */}
            <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('stats.perGameTitle')}
              </h2>
              <div ref={listRef}>
                <GamePlaytimeBars
                  rows={rows()}
                  highlightGameId={hover()?.gameId ?? null}
                  onHoverGame={setFocusGameId}
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
