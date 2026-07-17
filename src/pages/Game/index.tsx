import { type Game } from '@bindings/Game'
import { type SortType } from '@bindings/SortType'
import { DropArea } from '@components/DropArea'
import FullScreenMask from '@components/ui/FullScreenMask'
import { myToast } from '@components/ui/myToast'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { log } from '@utils/log'
import { fuckBackslash, getParentPath, isAbsolutePath } from '@utils/path'
import {
  getDeviceVarMap,
  replaceWithVarNames,
  resolveVarForDevice
} from '@utils/resolveVar'
import { getSortType, setSortType as setSortTypeCached } from '@utils/sortTypeCache'
import { durationToSecs } from '@utils/time'
import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { useConfig } from '~/store'
import { useGameRuntime } from '~/store/gameRuntime'
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
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type Component,
  type JSX
} from 'solid-js'
import toast from 'solid-toast'
import { Virtualizer } from 'virtua/solid'
import GameEditModal from './GameEditModal'
import { GameItem, GameItemWrapper } from './GameItem'
import { ArchiveSyncModal } from './SyncModal'

const GamePage = (): JSX.Element => {
  const { config, actions } = useConfig()
  const { t } = useI18n()
  // Running/backing-up state lives in the global runtime store so it survives
  // sidebar navigation (the page component is unmounted on route change).
  const runtime = useGameRuntime()

  const [isEditModalOpen, setEditModalOpen] = createSignal(false)
  const [isSyncModalOpen, setSyncModalOpen] = createSignal(false)
  const [isEditMode, setEditMode] = createSignal(false)
  const [editingGameInfo, setEditingGameInfo] = createSignal<Game | null>(null)
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  const [sortType, setSortType] = createSignal<SortType>('id')

  onMount(() => {
    getSortType().then(setSortType)

    // Track the grid scroll container width to recompute the responsive column
    // count. clientWidth excludes the scrollbar but includes padding, which the
    // column formula accounts for.
    const el = gridScrollRef
    if (el) {
      const update = () => setScrollWidth(el.clientWidth)
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      onCleanup(() => ro.disconnect())
    }
  })

  const sortedGames = createMemo(() => {
    // 浅拷贝数组以避免修改 Store
    const games = [...config.games]
    const type = sortType()

    return games.sort((a, b) => {
      switch (type) {
        case 'name':
          return a.name.localeCompare(
            b.name,
            config.settings.appearance.language || 'zh-CN'
          )
        case 'lastPlayed': {
          // 处理 null 情况，未游玩的排在后面
          const timeA = a.lastPlayedTime ? new Date(a.lastPlayedTime).getTime() : 0
          const timeB = b.lastPlayedTime ? new Date(b.lastPlayedTime).getTime() : 0
          return timeB - timeA
        }
        case 'playTime':
          return durationToSecs(b.useTime) - durationToSecs(a.useTime)
        case 'id':
        default:
          return a.id - b.id
      }
    })
  })

  // O(1) lookup from game id -> index in config.games, rebuilt only when the
  // games list changes. Avoids a findIndex linear scan per card per render.
  const gameIndexById = createMemo(() => {
    const map = new Map<number, number>()
    config.games.forEach((g, i) => map.set(g.id, i))
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
  const CARD_GAP_PX = 24 // gap-x-6 (1.5rem)
  const PAD_RIGHT_PX = 16 // pr-4 (1rem)
  let gridScrollRef: HTMLDivElement | undefined
  const [scrollWidth, setScrollWidth] = createSignal(0)

  // Match the old `auto-fill, minmax(11rem,1fr)` + gap-x-6 + pr-4 grid:
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
  let prevRows: Game[][] = []
  const rows = createMemo<Game[][]>(() => {
    const cols = columns()
    const games = sortedGames()
    const out: Game[][] = []
    for (let i = 0, r = 0; i < games.length; i += cols, r++) {
      const chunk = games.slice(i, i + cols)
      // Reuse the previous chunk reference when its game references are
      // unchanged. virtua's <For> keys data items by reference, so a brand-new
      // chunk array on every recompute forces it to unmount+remount every
      // visible row (re-running each card's createResource, re-fetching its
      // image). Keeping stable references skips the remount whenever the
      // underlying games didn't move — e.g. a config://updated reconcile or an
      // image-hash patch that changes the games array identity but not its
      // contents.
      const prev = prevRows[r]
      if (prev && prev.length === chunk.length && chunk.every((g, k) => g === prev[k])) {
        out.push(prev)
      } else {
        out.push(chunk)
      }
    }
    // Always keep at least one (possibly empty) row to host the "add" card.
    if (out.length === 0) out.push([])
    prevRows = out
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
      const vars = await getDeviceVarMap(config.devices)
      resolvedPath = replaceWithVarNames(path, vars)
    }
    const newGame: Game = {
      id: findNextGameId(),
      name: resolvedPath ? (getParentPath(resolvedPath) ?? '') : '',
      excutablePath: resolvedPath ?? null,
      savePaths: [],
      imageUrl: null,
      imageSha256: null,
      addedTime: new Date().toISOString(),
      useTime: [0, 0],
      lastPlayedTime: null,
      lastUploadTime: null
    }
    log.info(`add newGame: ${JSON.stringify(newGame)}`)
    setEditingIndex(null)
    setEditingGameInfo(newGame)
    setEditMode(false)
    setEditModalOpen(true)
  }

  const openEditModal = (index: number) => {
    setEditingIndex(index)
    setEditingGameInfo(config.games[index])
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

  // 游戏启动逻辑 — delegated to the global runtime store so listeners and
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
    if (game.excutablePath) {
      resolveVarForDevice(game.excutablePath, config.devices)
        .then(resolved => {
          if (resolved && !isAbsolutePath(resolved)) {
            myToast({
              variant: 'error',
              title: t('game.edit.exePath'),
              message: t('hint.exePathNotAbsolute')
            })
          }
        })
        .catch(() => {
          // resolve_var failed (e.g. unresolved variable) — notify the user
          // instead of silently ignoring, so they know the path is broken.
          myToast({
            variant: 'warning',
            title: t('game.edit.exePath'),
            message: t('hint.resolveExeFailed')
          })
        })
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
    try {
      if (game.savePaths.length !== 0) {
        invoke('delete_local_archive_all', { gameId: game.id })
        if (config.settings.storage.provider === 'none') {
          actions.removeGame(index)
          toast.success(t('hint.deleteGameSuccess') + game.name)
          return
        }
        await invoke('delete_archive_all', { gameId: game.id })
      }
      actions.removeGame(index)
      toast.success(t('hint.deleteGameAndRemote') + game.name)
    } catch (e) {
      toast.error(t('hint.deleteArchiveFailed') + e)
      myToast({
        variant: 'error',
        title: t('hint.deleteGameFailed'),
        message: t('hint.deleteGameFailedConfirm'),
        actions: [
          {
            label: t('ui.cancel'),
            variant: 'secondary',
            onClick: () => {}
          },
          {
            label: t('ui.delete'),
            variant: 'danger',
            onClick: () => {
              actions.removeGame(index)
            }
          }
        ]
      })
    }
  }

  const handleDropAdd = (paths: string[]) => {
    console.log('Dropped paths:', paths)
    openGameAddModal(paths.at(0) ? fuckBackslash(paths[0]) : undefined)
  }

  /** Handle context menu actions dispatched from GameItem. */
  const handleContextMenuAction = async (gameId: number, action: string) => {
    switch (action) {
      case 'openDir':
        try {
          await invoke('open_game_dir', { gameId })
        } catch (e) {
          toast.error(t('hint.openDirFailed') + ': ' + e)
        }
        break
    }
  }

  // 并发备份处理
  const handleBackup = async (index: number) => {
    const game = config.games[index]
    if (!game) return
    if (game.savePaths.length === 0) {
      toast.error(t('hint.noSavePaths'))
      return
    }

    // 检查该游戏是否正在备份中
    if (runtime.isBackingUp(game.id)) {
      log.warn('Game is already backing up')
      return
    }

    // 添加到备份队列
    runtime.markBackingUp(game.id)

    const toastId = toast.loading(t('hint.archiving') + game.name + '...')
    let unlistenUploadError: UnlistenFn | undefined

    try {
      const archived_filename = await invoke<string>('archive', { gameId: game.id })

      toast.loading(t('hint.uploading') + game.name + '...', { id: toastId })

      unlistenUploadError = await listen<string>('sync://failed', event => {
        const { payload } = event
        toast.loading(
          `${t('hint.uploading')} ${game.name}...\n${t('hint.retryError')}: ${payload}`,
          { id: toastId }
        )
      })

      await invoke<void>('upload_archive', {
        gameId: game.id,
        archiveFilename: archived_filename
      })

      toast.success(t('hint.syncSuccess') + game.name, {
        id: toastId,
        duration: 3000
      })
    } catch (error) {
      log.error(`Failed to backup game ${game.name}: ${error}`)
      const errMsg = error instanceof Error ? error.message : String(error)
      toast.error(t('hint.syncFailed') + errMsg, { id: toastId, duration: 5000 })
    } finally {
      if (unlistenUploadError) {
        unlistenUploadError()
      }
      // 从备份队列中移除
      runtime.unmarkBackingUp(game.id)
    }
  }

  const openSyncModal = (index: number) => {
    const game = config.games[index]
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
        class="flex flex-col py-4 pl-4 pr-0 w-full h-full"
      >
        {/* 头部区域：标题 + 排序控件 */}
        <div class="flex flex-row justify-between items-center mb-4">
          <h1 class="text-2xl font-bold dark:text-white">{t('game.self')}</h1>

          <SortOptions
            class="mr-4 p-0.5"
            sortType={sortType}
            onChange={s => {
              setSortType(s)
              setSortTypeCached(s)
            }}
          />
        </div>
        <div
          ref={gridScrollRef}
          class="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-5"
          style={{ 'overflow-anchor': 'none' }}
        >
          <Virtualizer data={rows()}>
            {(row, rowIndex) => {
              const isLastRow = () => rowIndex() === rows().length - 1
              return (
                <div
                  class="grid gap-x-6 pb-6"
                  style={{
                    'grid-template-columns': `repeat(${columns()}, minmax(11rem, 1fr))`
                  }}
                >
                  <For each={row}>
                    {game => {
                      // 获取真实索引用于操作
                      const realIndex = () => getRealIndex(game.id)

                      return (
                        <GameItem
                          game={game}
                          // 所有的操作回调都使用 realIndex()
                          onStart={() => handleStart(realIndex())}
                          onEdit={() => openEditModal(realIndex())}
                          onBackup={() => handleBackup(realIndex())}
                          onSync={() => openSyncModal(realIndex())}
                          onImageHashUpdate={newhash =>
                            handleImageHashUpdate(realIndex(), newhash)
                          }
                          onCoverColorUpdate={color =>
                            handleCoverColorUpdate(realIndex(), color)
                          }
                          onContextMenuAction={action =>
                            handleContextMenuAction(game.id, action)
                          }
                          isBackingUp={runtime.isBackingUp(game.id)}
                          isPlaying={runtime.isPlaying(game.id)}
                        />
                      )
                    }}
                  </For>

                  {/* "add" card flows as the final grid cell on the last row */}
                  <Show when={isLastRow()}>
                    <GameItemWrapper extra_class="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent shadow-none hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div
                        class="flex flex-col flex-1 items-center justify-center text-center cursor-pointer w-full h-full group"
                        onClick={() => openGameAddModal()}
                      >
                        <AiTwotonePlusCircle class="w-16 h-16 text-gray-400 group-hover:text-blue-500 transition-colors duration-300" />
                        <p class="text-gray-500 dark:text-gray-400 text-sm mt-2 px-4 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
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
            gameInfo={editingGameInfo()}
            editMode={isEditMode()}
            cancel={closeEditModal}
            confirm={handleSave}
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
  sortType: Accessor<SortType>
  onChange: (type: SortType) => void
  class?: string
}): JSX.Element => {
  const { t } = useI18n()
  const sortOptions: Accessor<
    { type: SortType; icon: Component<{ class?: string }>; label: string }[]
  > = createMemo(() => [
    {
      type: 'id' as SortType,
      icon: TbOutlineSortAscendingNumbers,
      label: t('game.sortType.id')
    },
    {
      type: 'name' as SortType,
      icon: TbOutlineSortAscendingLetters,
      label: t('game.sortType.name')
    },
    {
      type: 'lastPlayed' as SortType,
      icon: TbOutlineClockPlay,
      label: t('game.sortType.lastPlayed')
    },
    {
      type: 'playTime' as SortType,
      icon: TbOutlineHourglassHigh,
      label: t('game.sortType.playTime')
    }
  ])

  return (
    <div class={cn('flex bg-gray-200 dark:bg-gray-900 rounded-md', props.class)}>
      <For each={sortOptions()}>
        {option => (
          <button
            onClick={() => props.onChange(option.type)}
            class={`
                flex items-center justify-center px-2 py-1 rounded text-xs font-medium transition-all duration-200
                ${
                  props.sortType() === option.type
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-300/50 dark:hover:bg-gray-700/50'
                }
              `}
            title={option.label}
          >
            <option.icon class="w-3.5 h-3.5" />
            <span class="ml-1 hidden md:inline">{option.label}</span>
          </button>
        )}
      </For>
    </div>
  )
}
