import { type Game } from '@bindings/Game'
import { type SortType } from '@bindings/SortType'
import { DropArea } from '@components/DropArea'
import FullScreenMask from '@components/ui/FullScreenMask'
import { myToast } from '@components/ui/myToast'
import { invoke } from '@tauri-apps/api/core'
import { once } from '@tauri-apps/api/event'
import { getParentPath } from '@utils/path'
import { durationToSecs } from '@utils/time'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import clsx from 'clsx'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import {
  TbClockPlay,
  TbHourglassHigh,
  TbSortAscendingLetters,
  TbSortAscendingNumbers
} from 'solid-icons/tb'
import {
  createMemo,
  createSignal,
  For,
  onMount,
  Show,
  type Accessor,
  type JSX
} from 'solid-js'
import toast from 'solid-toast'
import GameEditModal from './GameEditModal'
import { GameItem, GameItemWrapper } from './GameItem'
import { ArchiveSyncModal } from './SyncModal'

const GamePage = (): JSX.Element => {
  const { config, actions } = useConfig()
  const { t } = useI18n()

  const [isEditModalOpen, setEditModalOpen] = createSignal(false)
  const [isSyncModalOpen, setSyncModalOpen] = createSignal(false)
  const [isEditMode, setEditMode] = createSignal(false)
  const [editingGameInfo, setEditingGameInfo] = createSignal<Game | null>(null)
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  // 使用数组存储多个正在操作的游戏 ID
  const [backingUpIds, setBackingUpIds] = createSignal<number[]>([])
  const [playingIds, setPlayingIds] = createSignal<number[]>([])

  const [sortType, setSortType] = createSignal<SortType>('id')

  // 避免切换路由后丢失游戏状态
  onMount(() => {
    invoke<number[]>('running_game_ids').then(ids => {
      setPlayingIds(ids)
      for (const id of playingIds()) {
        once<boolean>(`game://exit/${id}`, event => {
          console.log(`Game ${id} exited, success: ${event.payload}`)
          setPlayingIds(prev => prev.filter(id => id !== id))
          if (!event.payload) {
            toast.error(name + t('hint.exitAbnormally'))
          }
        })
      }
    })
    try {
      invoke<SortType>('get_sort_type').then(type => {
        setSortType(type)
      })
    } catch {}
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
        case 'lastPlayed':
          // 处理 null 情况，未游玩的排在后面
          const timeA = a.lastPlayedTime ? new Date(a.lastPlayedTime).getTime() : 0
          const timeB = b.lastPlayedTime ? new Date(b.lastPlayedTime).getTime() : 0
          return timeB - timeA
        case 'playTime':
          return durationToSecs(b.useTime) - durationToSecs(a.useTime)
        case 'id':
        default:
          return a.id - b.id
      }
    })
  })

  const getRealIndex = (gameId: number) => {
    return config.games.findIndex(g => g.id === gameId)
  }

  const findNextGameId = () => {
    const nextId = config.games.reduce((maxId, game) => {
      return Math.max(maxId, game.id)
    }, 0)
    return nextId + 1
  }

  const openGameAddModal = (path?: string) => {
    const newGame: Game = {
      id: findNextGameId(),
      name: path ? (getParentPath(path) ?? '') : '',
      excutablePath: path ?? null,
      savePaths: [],
      imageUrl: null,
      imageSha256: null,
      addedTime: new Date().toISOString(),
      useTime: [0, 0],
      lastPlayedTime: null,
      lastUploadTime: null
    }
    console.log('add newGame:', newGame)
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

  // 游戏启动逻辑
  const handleStart = async (index: number) => {
    const game = config.games[index]
    if (!game) return

    // 如果已经在运行中，阻止重复点击
    if (playingIds().includes(game.id)) return

    // 1. 使用 once 注册单次监听器
    // 仍然获取 unlisten 函数，仅用于在 invoke 报错时手动清理
    const [unlistenSpawn, unlistenExit] = await Promise.all([
      once(`game://spawn/${game.id}`, () => {
        console.log(`Game ${game.id} spawned`)
        setPlayingIds(prev => [...prev, game.id])
        toast.success(game.name + t('hint.isRunning'))
      }),

      once<boolean>(`game://exit/${game.id}`, event => {
        console.log(`Game ${game.id} exited, success: ${event.payload}`)
        setPlayingIds(prev => prev.filter(id => id !== game.id))

        if (!event.payload) {
          toast.error(game.name + t('hint.exitAbnormally'))
        }
      })
    ])

    try {
      // 2. 调用后端启动命令
      await invoke('exec', { gameId: game.id })
    } catch (error) {
      console.error('Failed to start game:', error)
      toast.error(game.name + t('hint.failToStart') + error)

      // 3. 如果启动指令本身失败，手动清理刚才注册的监听器
      unlistenSpawn()
      unlistenExit()
    }
  }

  const handleSave = (game: Game) => {
    const index = editingIndex()
    if (index === null) {
      actions.addGame(game)
    } else {
      actions.updateGame(index, game)
    }
    closeEditModal()
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
    openGameAddModal(paths.at(0))
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
    if (backingUpIds().includes(game.id)) return

    // 添加到备份队列
    setBackingUpIds(prev => [...prev, game.id])

    const toastId = toast.loading(t('hint.archiving') + game.name + '...')

    try {
      const archived_filename = await invoke<string>('archive', { gameId: game.id })

      toast.loading(t('hint.uploading') + game.name + '...', { id: toastId })

      await invoke<void>('upload_archive', {
        gameId: game.id,
        archiveFilename: archived_filename
      })

      toast.success(t('hint.syncSuccess') + ': ' + game.name, {
        id: toastId,
        duration: 3000
      })
    } catch (error) {
      console.error('Backup failed:', error)
      const errMsg = error instanceof Error ? error.message : String(error)
      toast.error(t('hint.syncFailed') + errMsg, { id: toastId, duration: 5000 })
    } finally {
      // 从备份队列中移除
      setBackingUpIds(prev => prev.filter(id => id !== game.id))
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
      <div class="flex flex-col py-4 pl-4 pr-0 w-full h-full">
        {/* 头部区域：标题 + 排序控件 */}
        <div class="flex flex-row justify-between items-center mb-4">
          <h1 class="text-2xl font-bold dark:text-white">{t('game.self')}</h1>

          <SortOptions
            class="mr-4 p-0.5"
            sortType={sortType}
            onChange={s => {
              setSortType(s)
              try {
                invoke('set_sort_type', { sortType: s })
              } catch {}
            }}
          />
        </div>
        <div class="flex-1 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-6 gap-y-6 pb-5 pr-4 overflow-y-auto custom-scrollbar">
          <For each={sortedGames()}>
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
                  isBackingUp={backingUpIds().includes(game.id)}
                  isPlaying={playingIds().includes(game.id)}
                />
              )
            }}
          </For>

          <GameItemWrapper extra_class="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent shadow-none hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
            <div
              class="flex flex-col flex-1 items-center justify-center text-center cursor-pointer w-full h-full group"
              onClick={() => openGameAddModal()}
            >
              <DropArea
                callback={handleDropAdd}
                class="w-full h-full flex flex-col items-center justify-center"
              >
                <AiTwotonePlusCircle class="w-16 h-16 text-gray-400 group-hover:text-blue-500 transition-colors duration-300" />
                <p class="text-gray-500 dark:text-gray-400 text-sm mt-2 px-4 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
                  {t('game.clickToAdd')}
                  <br />
                  {t('game.orDrag')}
                </p>
              </DropArea>
            </div>
          </GameItemWrapper>
        </div>
      </div>

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
  const sortOptions: Accessor<{ type: SortType; icon: any; label: string }[]> =
    createMemo(() => [
      {
        type: 'id' as SortType,
        icon: TbSortAscendingNumbers,
        label: t('game.sortType.id')
      },
      {
        type: 'name' as SortType,
        icon: TbSortAscendingLetters,
        label: t('game.sortType.name')
      },
      {
        type: 'lastPlayed' as SortType,
        icon: TbClockPlay,
        label: t('game.sortType.lastPlayed')
      },
      {
        type: 'playTime' as SortType,
        icon: TbHourglassHigh,
        label: t('game.sortType.playTime')
      }
    ])

  return (
    <div class={clsx('flex bg-gray-200 dark:bg-gray-900 rounded-md', props.class)}>
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
