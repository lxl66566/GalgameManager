/**
 * SteamPickModal — lists games installed in the local Steam library so the
 * user can pick one to prefill the add-game form. The library is scanned
 * once when the modal opens (never during normal browsing). A non-running
 * Steam client is a regular UI state here, not an error toast.
 */
import { type SteamGameEntry } from '@bindings/SteamGameEntry'
import { type SteamListResult } from '@bindings/SteamListResult'
import CachedImage from '@components/ui/CachedImage'
import { invoke } from '@tauri-apps/api/core'
import { formatBytes } from '@utils/file'
import { errToStr } from '@utils/log'
import { FaBrandsSteam } from 'solid-icons/fa'
import { TbOutlineX } from 'solid-icons/tb'
import { createMemo, createSignal, For, Match, onMount, Show, Switch } from 'solid-js'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'

type ListState =
  | { games: SteamGameEntry[]; type: 'games' }
  | { message: string; type: 'error' }
  | { type: 'loading' }
  | { type: 'notRunning' }

interface SteamPickModalProps {
  onClose: () => void
  onPick: (game: SteamGameEntry) => void
}

export default function SteamPickModal(props: SteamPickModalProps) {
  const { t } = useI18n()
  const { config } = useConfig()

  const [state, setState] = createSignal<ListState>({ type: 'loading' })

  // Narrowed views over the state — reading `state()` more than once in an
  // expression loses Solid's type narrowing, so each is derived once here.
  const games = createMemo(() => {
    const s = state()
    return s.type === 'games' ? s.games : null
  })
  const errorMessage = createMemo(() => {
    const s = state()
    return s.type === 'error' ? s.message : null
  })
  const notRunning = createMemo(() => state().type === 'notRunning')

  // appids already imported as games — informational badge only, the user
  // may still want to add them again (e.g. a second copy with other plugins)
  const addedAppIds = createMemo(
    () => new Set(config.games.flatMap(g => (g.steam ? [g.steam.appid] : [])))
  )

  onMount(() => {
    void (async () => {
      try {
        const res = await invoke<SteamListResult>('list_steam_games')
        setState(
          res.type === 'notRunning'
            ? { type: 'notRunning' }
            : { games: res.games, type: 'games' }
        )
      } catch (error) {
        setState({ message: errToStr(error), type: 'error' })
      }
    })()
  })

  return (
    <div class="flex h-[80vh] w-[90vw] max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div class="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div class="flex items-center gap-2">
          <FaBrandsSteam class="h-5 w-5 text-gray-600 dark:text-gray-300" />
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">
            {t('game.steam.self')}
          </h2>
          <Show when={games()?.length}>
            <span class="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {games()!.length} {t('game.steam.gameNum')}
            </span>
          </Show>
        </div>
        <button
          aria-label={t('ui.close')}
          class="cursor-pointer rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => {
            props.onClose()
          }}
        >
          <TbOutlineX class="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        <Switch>
          <Match when={state().type === 'loading'}>
            <div class="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('ui.loading')}
            </div>
          </Match>

          <Match when={notRunning()}>
            <div class="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
              <FaBrandsSteam class="h-8 w-8 opacity-50" />
              <span class="max-w-[80%] text-center text-sm">
                {t('game.steam.notRunning')}
              </span>
            </div>
          </Match>

          <Match when={errorMessage() !== null}>
            <div class="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
              <span class="max-w-[80%] text-center text-sm">
                {t('game.steam.loadFailed')}
              </span>
              <span class="max-w-[80%] text-center text-xs text-red-500 dark:text-red-400">
                {errorMessage()}
              </span>
            </div>
          </Match>

          <Match when={games() !== null}>
            <Show
              fallback={
                <div class="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
                  <FaBrandsSteam class="h-8 w-8 opacity-50" />
                  <span class="text-sm">{t('game.steam.noGames')}</span>
                </div>
              }
              when={(games()?.length ?? 0) > 0}
            >
              <div class="flex flex-col gap-1">
                <For each={games()}>
                  {entry => (
                    <button
                      class="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-all duration-200 hover:border-gray-200 hover:bg-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-700/50"
                      onClick={() => {
                        props.onPick(entry)
                      }}
                      type="button"
                    >
                      {/* Cover thumbnail (2:3 portrait, matches Steam CDN) */}
                      <div class="h-16 w-11 flex-shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
                        <CachedImage
                          alt={entry.name}
                          class="h-full w-full object-cover"
                          url={entry.coverUrl}
                        />
                      </div>

                      <div class="min-w-0 flex-1">
                        <div
                          class="truncate text-sm font-medium text-gray-700 dark:text-gray-200"
                          title={entry.name}
                        >
                          {entry.name}
                        </div>
                        <div class="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                          <Show
                            fallback={`#${entry.appid}`}
                            when={entry.sizeOnDisk != null}
                          >
                            {formatBytes(entry.sizeOnDisk ?? 0n)}
                          </Show>
                        </div>
                      </div>

                      <Show when={addedAppIds().has(entry.appid)}>
                        <span class="flex-shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {t('game.steam.alreadyAdded')}
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
