import { type Game } from '@bindings/Game'
import { type SortType } from '@bindings/SortType'
import { type SyncFailedPayload } from '@bindings/SyncFailedPayload'
import { DropArea } from '@components/DropArea'
import FullScreenMask from '@components/ui/FullScreenMask'
import { myToast } from '@components/ui/myToast'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { errToStr, log } from '@utils/log'
import { fuckBackslash, getParentPath, isAbsolutePath, isUrl } from '@utils/path'
import {
  getDeviceVarMap,
  replaceWithVarNames,
  resolveVarForDevice
} from '@utils/resolveVar'
import { getSortType, setSortType as setSortTypeCached } from '@utils/sortTypeCache'
import { durationToSecs } from '@utils/time'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import {
  TbOutlineClockPlay,
  TbOutlineHourglassHigh,
  TbOutlineSortAscendingLetters,
  TbOutlineSortAscendingNumbers
} from 'solid-icons/tb'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  lazy,
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type Component,
  type JSX
} from 'solid-js'
import toast from 'solid-toast'
import { Virtualizer } from 'virtua/solid'

import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { useConfig } from '~/store'
import { useGameRuntime } from '~/store/gameRuntime'

import { GameItem, GameItemWrapper } from './GameItem'

// Modals are lazy-loaded (string-literal dynamic imports, fully static
// types): their kobalte form/tooltip deps stay out of the initial chunk and
// load on first open (local resources, millisecond-level latency).
const GameEditModal = lazy(() => import('./GameEditModal'))
const ArchiveSyncModal = lazy(() => import('./SyncModal'))

const GamePage = (): JSX.Element => {
  const { actions, config } = useConfig()
  const { t } = useI18n()
  // Running/backing-up state lives in the global runtime store so it survives
  // sidebar navigation (the page component is unmounted on route change).
  const runtime = useGameRuntime()

  const [isEditModalOpen, setEditModalOpen] = createSignal(false)
  const [isSyncModalOpen, setSyncModalOpen] = createSignal(false)
  const [isEditMode, setEditMode] = createSignal(false)
  const [editingGameInfo, setEditingGameInfo] = createSignal<Game | null>(null)
  const [editingIndex, setEditingIndex] = createSignal<null | number>(null)

  const [sortType, setSortType] = createSignal<SortType>('id')

  onMount(() => {
    void (async () => setSortType(await getSortType()))()

    // Track the grid scroll container width to recompute the responsive column
    // count. clientWidth excludes the scrollbar but includes padding, which the
    // column formula accounts for.
    const element = gridScrollRef
    if (element) {
      const update = () => setScrollWidth(element.clientWidth)
      update()
      const ro = new ResizeObserver(update)
      ro.observe(element)
      onCleanup(() => {
        ro.disconnect()
      })
    }
  })

  const sortedGames = createMemo(() => {
    const games = [...config.games]
    const type = sortType()

    return games.toSorted((a, b) => {
      switch (type) {
        case 'lastPlayed': {
          // null (never played) sorts last
          const timeA = a.lastPlayedTime ? new Date(a.lastPlayedTime).getTime() : 0
          const timeB = b.lastPlayedTime ? new Date(b.lastPlayedTime).getTime() : 0
          return timeB - timeA
        }
        case 'name': {
          return a.name.localeCompare(
            b.name,
            config.settings.appearance.language || 'zh-CN'
          )
        }
        case 'playTime': {
          return durationToSecs(b.useTime) - durationToSecs(a.useTime)
        }
        case 'id':
        default: {
          return a.id - b.id
        }
      }
    })
  })

  // O(1) lookup from game id -> index in config.games, rebuilt only when the
  // games list changes. Avoids a findIndex linear scan per card per render.
  const gameIndexById = createMemo(() => {
    const map = new Map<number, number>()
    for (const [index, g] of config.games.entries()) map.set(g.id, index)
    return map
  })

  const getRealIndex = (gameId: number) => gameIndexById().get(gameId) ?? -1

  // Duplicate-ID detection is a side effect — keep it out of the (pure)
  // sortedGames memo so it doesn't fire during render or repeat per recompute.
  createEffect(() => {
    const games = config.games
    if (games.length === 0) return
    const ids = games.map(g => g.id)
    if (ids.length !== new Set(ids).size) {
      toast.error(t('hint.duplicateGameId'))
    }
  })

  // ── Virtualized responsive grid ───────────────────────────────────────────
  // The game grid uses CSS auto-fill columns (minmax(11rem,1fr)). Virtual
  // scrolling needs a known column count, so we measure the scroll container
  // and chunk games into rows of that width. This keeps the layout responsive
  // while only rendering the visible rows.
  const MIN_CARD_PX = 11 * 16 // 11rem
  const CARD_GAP_PX = 24 // gap-6 (1.5rem)
  const PAD_RIGHT_PX = 16 // pr-4 (1rem)
  let gridScrollRef: HTMLDivElement | undefined
  const [scrollWidth, setScrollWidth] = createSignal(0)

  // Match the old `auto-fill, minmax(11rem,1fr)` + gap-6 + pr-4 grid:
  // columns = floor((clientWidth - pr-4 + gap) / (minCard + gap))
  const columns = createMemo(() => {
    const w = scrollWidth()
    if (w === 0) return 1
    return Math.max(
      1,
      Math.floor((w - PAD_RIGHT_PX + CARD_GAP_PX) / (MIN_CARD_PX + CARD_GAP_PX))
    )
  })

  // Holds the previous chunk array so identical rows can keep a stable
  // reference across recomputes (see `rows` memo below).
  let previousRows: Game[][] = []
  const rows = createMemo<Game[][]>(() => {
    const cols = columns()
    const games = sortedGames()
    const out: Game[][] = []
    for (let index = 0, r = 0; index < games.length; index += cols, r++) {
      const chunk = games.slice(index, index + cols)
      // Reuse the previous chunk reference when its game references are
      // unchanged. virtua's <For> keys data items by reference, so a brand-new
      // chunk array on every recompute forces it to unmount+remount every
      // visible row (re-running each card's createResource, re-fetching its
      // image). Keeping stable references skips the remount whenever the
      // underlying games didn't move — e.g. a config://updated reconcile or an
      // image-hash patch that changes the games array identity but not its
      // contents.
      const previous = previousRows[r]
      if (
        previous &&
        previous.length === chunk.length &&
        chunk.every((g, k) => g === previous[k])
      ) {
        out.push(previous)
      } else {
        out.push(chunk)
      }
    }
    // Always keep at least one (possibly empty) row to host the "add" card.
    if (out.length === 0) out.push([])
    previousRows = out
    return out
  })

  const findNextGameId = () => {
    const nextId = config.games.reduce((maxId, game) => {
      return Math.max(maxId, game.id)
    }, 0)
    return nextId + 1
  }

  const openGameAddModal = async (path?: string) => {
    // Apply reverse variable replacement so the path uses {varName} templates
    let resolvedPath = path
    if (path) {
      const variables = await getDeviceVarMap(config.devices)
      resolvedPath = replaceWithVarNames(path, variables)
    }
    const newGame: Game = {
      addedTime: new Date().toISOString(),
      excutablePath: resolvedPath ?? null,
      id: findNextGameId(),
      imageSha256: null,
      imageUrl: null,
      lastPlayedTime: null,
      lastUploadTime: null,
      name: resolvedPath ? (getParentPath(resolvedPath) ?? '') : '',
      savePaths: [],
      useTime: [0, 0]
    }
    log.info(`add newGame: ${JSON.stringify(newGame)}`)
    setEditingIndex(null)
    setEditingGameInfo(newGame)
    setEditMode(false)
    setEditModalOpen(true)
  }

  const openEditModal = (index: number) => {
    setEditingIndex(index)
    setEditingGameInfo(config.games[index] ?? null)
    setEditMode(true)
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingIndex(null)
    setEditingGameInfo(null)
  }

  const handleImageHashUpdate = (index: number, newHash: string) => {
    actions.setImageHash(index, newHash)
  }

  const handleCoverColorUpdate = (index: number, color: string) => {
    actions.setCoverColor(index, color)
  }

  // Launch flow is delegated to the global runtime store so listeners and
  // session timing survive sidebar navigation.
  const handleStart = async (index: number) => {
    const game = config.games[index]
    if (!game) return
    await runtime.launch(game, t)
  }

  const handleSave = (game: Game) => {
    const index = editingIndex()
    if (index === null) {
      actions.addGame(game)
    } else {
      actions.replaceGame(index, game)
    }
    closeEditModal()

    // Validate that the resolved executable path is absolute
    // (URL-scheme launch paths like steam:// are exempt)
    const exePath = game.excutablePath
    if (exePath && !isUrl(exePath)) {
      void (async () => {
        try {
          const resolved = await resolveVarForDevice(exePath, config.devices)
          if (resolved && !isAbsolutePath(resolved)) {
            myToast({
              message: t('hint.exePathNotAbsolute'),
              title: t('game.edit.exePath'),
              variant: 'error'
            })
          }
        } catch {
          // resolve_var failed (e.g. unresolved variable) — notify the user
          // instead of silently ignoring, so they know the path is broken.
          myToast({
            message: t('hint.resolveExeFailed'),
            title: t('game.edit.exePath'),
            variant: 'warning'
          })
        }
      })()
    }
  }

  const handleDelete = async () => {
    const index = editingIndex()
    if (index === null) {
      toast.error('Internal error: Cannot delete game without index!!')
      return
    }
    const game = config.games[index]
    closeEditModal()
    if (!game) return
    try {
      if (game.savePaths.length > 0) {
        void invoke('delete_local_archive_all', { gameId: game.id })
        if (config.settings.storage.provider === 'none') {
          actions.removeGame(game.id)
          toast.success(t('hint.deleteGameSuccess') + game.name)
          return
        }
        await invoke('delete_archive_all', { gameId: game.id })
      }
      actions.removeGame(game.id)
      toast.success(t('hint.deleteGameAndRemote') + game.name)
    } catch (error) {
      toast.error(t('hint.deleteArchiveFailed') + errToStr(error))
      myToast({
        actions: [
          {
            label: t('ui.cancel'),
            onClick: () => {},
            variant: 'secondary'
          },
          {
            label: t('ui.delete'),
            onClick: () => {
              actions.removeGame(game.id)
            },
            variant: 'danger'
          }
        ],
        message: t('hint.deleteGameFailedConfirm'),
        title: t('hint.deleteGameFailed'),
        variant: 'error'
      })
    }
  }

  const handleDropAdd = (paths: string[]) => {
    const first = paths[0]
    void openGameAddModal(first ? fuckBackslash(first) : undefined)
  }

  /** Handle context menu actions dispatched from GameItem. */
  const handleContextMenuAction = async (gameId: number, action: string) => {
    switch (action) {
      case 'copyName': {
        const game = config.games.find(g => g.id === gameId)
        if (!game) break
        try {
          await navigator.clipboard.writeText(game.name)
          toast.success(t('hint.copiedGameName'))
        } catch (error) {
          toast.error(t('hint.copyGameNameFailed') + errToStr(error))
        }
        break
      }
      case 'openDir': {
        try {
          await invoke('open_game_dir', { gameId })
        } catch (error) {
          toast.error(t('hint.openDirFailed') + ': ' + errToStr(error))
        }
        break
      }
    }
  }

  const handleBackup = async (index: number) => {
    const game = config.games[index]
    if (!game) return
    if (game.savePaths.length === 0) {
      toast.error(t('hint.noSavePaths'))
      return
    }

    if (runtime.isBackingUp(game.id)) {
      log.warn('Game is already backing up')
      return
    }

    runtime.markBackingUp(game.id)

    const toastId = toast.loading(t('hint.archiving') + game.name + '...')
    let unlistenUploadError: undefined | UnlistenFn

    try {
      const archived_filename = await invoke<string>('archive', { gameId: game.id })

      toast.loading(t('hint.uploading') + game.name + '...', { id: toastId })

      unlistenUploadError = await listen<SyncFailedPayload>('sync://failed', event => {
        const { payload } = event
        // Retry events are tagged with the game being synced; ignore failures
        // from other games' backups and global (config) sync.
        if (payload.gameId !== game.id) return
        toast.loading(
          `${t('hint.uploading')} ${game.name}...\n${t('hint.retryError')}: ${payload.message}`,
          { id: toastId }
        )
      })

      await invoke<void>('upload_archive', {
        archiveFilename: archived_filename,
        gameId: game.id
      })

      // The separator lives at the call site, not in the locale string —
      // relying on a trailing ": " inside translations is fragile (the en-US
      // value didn't have one, producing "Sync Success<name>").
      toast.success(`${t('hint.syncSuccess')}: ${game.name}`, {
        duration: 3000,
        id: toastId
      })
    } catch (error) {
      log.error(`Failed to backup game ${game.name}: ${errToStr(error)}`)
      toast.error(t('hint.syncFailed') + errToStr(error), { duration: 5000, id: toastId })
    } finally {
      if (unlistenUploadError) {
        unlistenUploadError()
      }
      runtime.unmarkBackingUp(game.id)
    }
  }

  const openSyncModal = (index: number) => {
    const game = config.games[index]
    if (!game) return
    setEditingIndex(index)
    setEditingGameInfo(game)
    setSyncModalOpen(true)
  }

  const closeSyncModal = () => {
    setEditingIndex(null)
    setEditingGameInfo(null)
    setSyncModalOpen(false)
  }

  return (
    <>
      {/*
        DropArea lives at the page level (not inside the virtualized grid) so
        its global drag listeners and release-hint overlay stay mounted
        regardless of scroll position. Dropping a file anywhere opens the
        add-game modal.
      */}
      <DropArea
        callback={handleDropAdd}
        class="flex h-full w-full flex-col py-4 pr-0 pl-4"
      >
        <div class="mb-4 flex flex-row items-center justify-between">
          <h1 class="text-2xl font-bold dark:text-white">{t('game.self')}</h1>

          <SortOptions
            class="mr-4 p-0.5"
            onChange={s => {
              setSortType(s)
              setSortTypeCached(s)
            }}
            sortType={sortType}
          />
        </div>
        <div
          class="custom-scrollbar flex-1 overflow-y-auto pr-4 pb-5"
          ref={gridScrollRef}
          style={{ 'overflow-anchor': 'none' }}
        >
          <Virtualizer data={rows()}>
            {(row, rowIndex) => {
              const isLastRow = () => rowIndex() === rows().length - 1
              return (
                <div
                  class="grid gap-6 pb-6"
                  style={{
                    'grid-template-columns': `repeat(${columns()}, minmax(11rem, 1fr))`
                  }}
                >
                  <For each={row}>
                    {game => {
                      const realIndex = () => getRealIndex(game.id)

                      return (
                        <GameItem
                          game={game}
                          isBackingUp={runtime.isBackingUp(game.id)}
                          isPlaying={runtime.isPlaying(game.id)}
                          onBackup={() => handleBackup(realIndex())}
                          onContextMenuAction={action =>
                            handleContextMenuAction(game.id, action)
                          }
                          onCoverColorUpdate={color => {
                            handleCoverColorUpdate(realIndex(), color)
                          }}
                          onEdit={() => {
                            openEditModal(realIndex())
                          }}
                          onImageHashUpdate={newhash => {
                            handleImageHashUpdate(realIndex(), newhash)
                          }}
                          // All action callbacks use realIndex()
                          onStart={() => handleStart(realIndex())}
                          onSync={() => {
                            openSyncModal(realIndex())
                          }}
                        />
                      )
                    }}
                  </For>

                  {/* "add" card flows as the final grid cell on the last row */}
                  <Show when={isLastRow()}>
                    <GameItemWrapper extra_class="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent shadow-none hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div
                        aria-label={t('game.clickToAdd')}
                        class="group flex h-full w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-lg text-center focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:outline-none"
                        onClick={() => openGameAddModal()}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void openGameAddModal()
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <AiTwotonePlusCircle class="h-16 w-16 text-gray-400 transition-colors duration-300 group-hover:text-blue-500" />
                        <p class="mt-2 px-4 text-sm text-gray-500 transition-colors group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200">
                          {t('game.clickToAdd')}
                          <br />
                          {t('game.orDrag')}
                        </p>
                      </div>
                    </GameItemWrapper>
                  </Show>
                </div>
              )
            }}
          </Virtualizer>
        </div>
      </DropArea>

      <Show when={isEditModalOpen()}>
        <FullScreenMask onClose={closeEditModal}>
          <GameEditModal
            cancel={closeEditModal}
            confirm={handleSave}
            editMode={isEditMode()}
            gameInfo={editingGameInfo()}
            onDelete={() => handleDelete()}
          />
        </FullScreenMask>
      </Show>
      <Show when={isSyncModalOpen()}>
        <FullScreenMask onClose={closeSyncModal}>
          <ArchiveSyncModal
            gameId={editingGameInfo()!.id}
            gameInfo={editingGameInfo()!}
            onClose={closeSyncModal}
          />
        </FullScreenMask>
      </Show>
    </>
  )
}

export default GamePage

const SortOptions = (props: {
  class?: string
  onChange: (type: SortType) => void
  sortType: Accessor<SortType>
}): JSX.Element => {
  const { t } = useI18n()
  // Element type is passed to createMemo's generic so the `type` string
  // literals are contextually typed against SortType instead of widening to
  // `string` inside the array.
  const sortOptions = createMemo<
    { icon: Component<{ class?: string }>; label: string; type: SortType }[]
  >(() => [
    {
      icon: TbOutlineSortAscendingNumbers,
      label: t('game.sortType.id'),
      type: 'id'
    },
    {
      icon: TbOutlineSortAscendingLetters,
      label: t('game.sortType.name'),
      type: 'name'
    },
    {
      icon: TbOutlineClockPlay,
      label: t('game.sortType.lastPlayed'),
      type: 'lastPlayed'
    },
    {
      icon: TbOutlineHourglassHigh,
      label: t('game.sortType.playTime'),
      type: 'playTime'
    }
  ])

  return (
    <div class={cn('flex rounded-md bg-gray-200 dark:bg-gray-900', props.class)}>
      <For each={sortOptions()}>
        {option => (
          <button
            class={`flex items-center justify-center rounded px-2 py-1 text-xs font-medium transition-all duration-200 ${
              props.sortType() === option.type
                ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-600 dark:text-blue-300'
                : 'text-gray-500 hover:bg-gray-300/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
            } `}
            onClick={() => {
              props.onChange(option.type)
            }}
            title={option.label}
          >
            <option.icon class="h-3.5 w-3.5" />
            <span class="ml-1 hidden md:inline">{option.label}</span>
          </button>
        )}
      </For>
    </div>
  )
}
