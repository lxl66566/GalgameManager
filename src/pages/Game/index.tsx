import { type Game } from '@bindings/Game'
import { DropArea } from '@components/DropArea'
import FullScreenMask from '@components/ui/FullScreenMask'
import { invoke } from '@tauri-apps/api/core'
import { once } from '@tauri-apps/api/event'
import { getParentPath } from '@utils/path'
import { useConfig } from '~/store'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import { createSignal, For, Show, type JSX } from 'solid-js'
import toast from 'solid-toast'
import GameEditModal from './GameEditModal'
import { GameItem, GameItemWrapper } from './GameItem'
import { ArchiveSyncModal } from './SyncModal'

const GamePage = (): JSX.Element => {
  const { config, actions } = useConfig()

  const [isEditModalOpen, setEditModalOpen] = createSignal(false)
  const [isSyncModalOpen, setSyncModalOpen] = createSignal(false)
  const [isEditMode, setEditMode] = createSignal(false)
  const [editingGameInfo, setEditingGameInfo] = createSignal<Game | null>(null)
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  // 使用数组存储多个正在操作的游戏 ID
  const [backingUpIds, setBackingUpIds] = createSignal<number[]>([])
  const [playingIds, setPlayingIds] = createSignal<number[]>([])

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
        toast.success(`${game.name} is running`)
      }),

      once<boolean>(`game://exit/${game.id}`, event => {
        console.log(`Game ${game.id} exited, success: ${event.payload}`)
        setPlayingIds(prev => prev.filter(id => id !== game.id))

        if (!event.payload) {
          toast.error(`${game.name} exited abnormally`)
        }
      })
    ])

    try {
      // 2. 调用后端启动命令
      await invoke('exec', { gameId: game.id })
    } catch (error) {
      console.error('Failed to start game:', error)
      toast.error(`Failed to start: ${error}`)

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

  const handleDelete = () => {
    const index = editingIndex()
    if (index !== null) {
      const confirmed = confirm(`确定要删除游戏 "${config.games[index].name}" 吗？`)
      if (confirmed) {
        actions.removeGame(index)
        closeEditModal()
      }
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
      toast.error('No save paths defined')
      return
    }

    // 检查该游戏是否正在备份中
    if (backingUpIds().includes(game.id)) return

    // 添加到备份队列
    setBackingUpIds(prev => [...prev, game.id])

    const toastId = toast.loading(`Archiving: ${game.name}...`)

    try {
      const archived_filename = await invoke<string>('archive', { gameId: game.id })

      toast.loading(`Uploading: ${game.name}...`, { id: toastId })

      await invoke<void>('upload_archive', {
        gameId: game.id,
        archiveFilename: archived_filename
      })

      toast.success(`Sync Success: ${game.name}`, { id: toastId, duration: 3000 })
    } catch (error) {
      console.error('Backup failed:', error)
      const errMsg = error instanceof Error ? error.message : String(error)
      toast.error(`Sync Failed: ${errMsg}`, { id: toastId, duration: 4000 })
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
      <div class="flex flex-col container mx-auto p-4 h-screen">
        <h1 class="text-2xl font-bold mb-4 dark:text-white">启动游戏</h1>
        <div class="flex-1 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-6 gap-y-6 pb-5 overflow-y-auto custom-scrollbar">
          <For each={config.games}>
            {(game, i) => (
              <GameItem
                game={game}
                onStart={() => handleStart(i())}
                onEdit={() => openEditModal(i())}
                onBackup={() => handleBackup(i())}
                onSync={() => openSyncModal(i())}
                // 根据 ID 数组判断状态
                isBackingUp={backingUpIds().includes(game.id)}
                isPlaying={playingIds().includes(game.id)}
              />
            )}
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
                  点击添加
                  <br />
                  或拖拽可执行文件至此
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
            onDelete={editingIndex() !== null ? handleDelete : undefined}
          />
        </FullScreenMask>
      </Show>
      <Show when={isSyncModalOpen()}>
        <FullScreenMask onClose={closeSyncModal}>
          <ArchiveSyncModal
            gameId={editingGameInfo()?.id ?? 0}
            onClose={closeSyncModal}
          />
        </FullScreenMask>
      </Show>
    </>
  )
}

export default GamePage
