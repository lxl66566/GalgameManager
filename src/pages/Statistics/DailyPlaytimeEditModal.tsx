// Modal for editing one game's daily playtime records (date -> seconds):
// [date] [h] [m] [delete] rows, newest first, plus an "add date" picker.
//
// The dialog edits a local draft (a deep clone taken when it opened); saving
// performs a three-way merge against the live store (see playtimeEdit.ts)
// so background accumulation by the game loop while the modal was open is
// preserved, and syncs the game's total `useTime` by the resulting delta —
// never an absolute sum, since most games' totals predate the statistics
// feature.
import CachedImage from '@components/ui/CachedImage'
import { Button } from '@components/ui/controls'
import { InputWithSuffix } from '@components/ui/InputWithSuffix'
import { myToast } from '@components/ui/myToast'
import { FiPlus, FiTrash2 } from 'solid-icons/fi'
import { createMemo, createSignal, For, type Component } from 'solid-js'
import { createStore, produce, unwrap } from 'solid-js/store'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'

import {
  applyUseTimeDelta,
  mergeDailyPlaytime,
  setHourMinute,
  sumDaily,
  toHourMinute
} from './playtimeEdit'
import { formatDuration, logicalDateKey, type DurationUnits } from './timeRange'

interface DailyPlaytimeEditModalProps {
  /** Close without saving. */
  cancel: () => void
  /** Id of the game whose daily records are edited. */
  gameId: number
}

const DailyPlaytimeEditModal: Component<DailyPlaytimeEditModalProps> = props => {
  const { t } = useI18n()
  const { actions, config } = useConfig()

  const game = () => config.games.find(g => g.id === props.gameId)

  // `unwrap` first: structuredClone throws DataCloneError on store proxies
  // eslint-disable-next-line solid/reactivity -- captured once for the merge baseline (same pattern as GameEditModal)
  const snapshot = structuredClone(unwrap(game())?.dailyPlaytime ?? {})
  // Shallow copy: values are numbers, and the draft must not alias the
  // snapshot's object tree or edits would corrupt the merge baseline.
  const [draft, setDraft] = createStore<Record<string, number>>({ ...snapshot })

  // Newest first: back-filling "today" is the most common flow.
  const sortedDates = createMemo(() => Object.keys(draft).sort().reverse())

  const units = createMemo<DurationUnits>(() => ({
    hour: t('unit.hourShort'),
    minute: t('unit.minuteShort'),
    second: t('unit.secondShort')
  }))

  const liveTotal = createMemo(() => sumDaily(game()?.dailyPlaytime))
  const draftTotal = createMemo(() => sumDaily(draft))
  /** Preview of the total-playtime adjustment saving would apply. */
  const deltaText = createMemo(() => {
    const d = draftTotal() - liveTotal()
    if (d === 0) return ''
    return (d > 0 ? '+' : '-') + formatDuration(Math.abs(d), units())
  })

  const setHM = (date: string, h: number, m: number) => {
    setDraft(date, setHourMinute(draft[date] ?? 0, h, m))
  }

  const [newDate, setNewDate] = createSignal('')

  // Rows are keyed by `data-date` so a just-added (or already-existing) row
  // can be located after the sorted insertion — same querySelector approach
  // as GamePlaytimeBars' chart-link scroll.
  let listRef: HTMLDivElement | undefined

  /** Classic flash cue: scroll the row into view and fade a blue ring out. */
  const flashRow = (date: string) => {
    const el = listRef?.querySelector<HTMLElement>(`[data-date="${CSS.escape(date)}"]`)
    if (!el) return
    // `nearest` is a no-op when visible, and only scrolls the list wrapper.
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    el.animate(
      [
        { boxShadow: '0 0 0 2px rgb(59 130 246 / 0.9)' },
        { boxShadow: '0 0 0 2px rgb(59 130 246 / 0)' }
      ],
      { duration: 3000, easing: 'ease-out' }
    )
  }

  const handleAddDate = (value: string) => {
    if (!value) return
    if (draft[value] !== undefined) {
      myToast({ message: t('stats.dateExists'), variant: 'warning' })
      flashRow(value)
      return
    }
    setDraft(value, 0)
    setNewDate('')
    flashRow(value)
  }

  const handleSave = () => {
    const live = unwrap(game())
    if (!live) {
      // The game was deleted while the modal was open; nothing to save into.
      props.cancel()
      return
    }
    const liveDaily = structuredClone(live.dailyPlaytime ?? {})
    const merged = mergeDailyPlaytime(snapshot, unwrap(draft), liveDaily)
    actions.editGamePlaytime(
      live.id,
      merged,
      applyUseTimeDelta(live.useTime, sumDaily(merged) - sumDaily(liveDaily))
    )
    props.cancel()
  }

  return (
    <div class="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-zinc-800">
      {/* Header: cover + game name */}
      <div class="mb-2 flex items-center gap-3">
        <CachedImage
          alt={game()?.name ?? ''}
          class="h-10 w-10 shrink-0 rounded"
          hash={game()?.imageSha256 ?? null}
          url={game()?.imageUrl ?? null}
        />
        <div class="min-w-0 flex-1">
          <h1
            class="truncate text-lg font-bold text-gray-900 dark:text-white"
            title={game()?.name}
          >
            {game()?.name ?? `#${props.gameId}`}
          </h1>
        </div>
      </div>

      {/* Rows */}
      {/* p-1: overflow-y-auto clips overflow on every axis (visible on the
          other axis computes to auto), so the rows' flash ring needs padding
          on all sides — including the first/last row's edges. */}
      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1" ref={listRef}>
        <div class="flex flex-col gap-0.5">
          <For
            each={sortedDates()}
            fallback={
              <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                {t('stats.emptyDaily')}
              </div>
            }
          >
            {date => {
              const hm = createMemo(() => toHourMinute(draft[date] ?? 0))
              return (
                <div
                  class="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                  data-date={date}
                >
                  <span class="w-[5.5rem] shrink-0 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                    {date}
                  </span>
                  <InputWithSuffix
                    containerClass="w-26 shrink-0"
                    min="0"
                    onInput={e => {
                      setHM(date, parseInt(e.currentTarget.value) || 0, hm().m)
                    }}
                    size="sm"
                    suffix={t('unit.hour')}
                    type="number"
                    value={hm().h}
                  />
                  <InputWithSuffix
                    containerClass="w-26 shrink-0"
                    max="59"
                    min="0"
                    onInput={e => {
                      setHM(date, hm().h, parseInt(e.currentTarget.value) || 0)
                    }}
                    size="sm"
                    suffix={t('unit.minute')}
                    type="number"
                    value={hm().m}
                  />
                  <button
                    class="ml-auto shrink-0 cursor-pointer rounded p-1.5 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    onClick={() => {
                      setDraft(produce(d => delete d[date]))
                    }}
                    title={t('stats.removeDate')}
                    type="button"
                  >
                    <FiTrash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* Add date */}
      <div class="mt-3 flex items-center gap-2 border-t border-gray-300 pt-3 dark:border-gray-700">
        <FiPlus class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
        <input
          class="w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm tabular-nums dark:border-gray-600 dark:[color-scheme:dark]"
          max={logicalDateKey(new Date(), config.settings.launch.dayStart)}
          onChange={e => {
            setNewDate(e.currentTarget.value)
            handleAddDate(e.currentTarget.value)
          }}
          type="date"
          value={newDate()}
        />
      </div>

      {/* Footer: totals preview + actions */}
      <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-300 pt-3 dark:border-gray-700">
        <div class="flex min-w-0 flex-col text-xs text-gray-500 tabular-nums dark:text-gray-400">
          <span>
            {t('stats.totalLabel')}: {formatDuration(draftTotal(), units())}
          </span>
          <span>
            {t('stats.saveAdjustsTotal')}
            {deltaText() && ` (${deltaText()})`}
          </span>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button onClick={props.cancel} variant="secondary">
            {t('ui.cancel')}
          </Button>
          <Button onClick={handleSave} variant="primary">
            {t('ui.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DailyPlaytimeEditModal
