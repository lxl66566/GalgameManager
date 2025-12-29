import { type Game } from '@bindings/Game'
import { DropArea } from '@components/DropArea'
import { invoke } from '@tauri-apps/api/core'
import { getParentPath } from '@utils/path'
import { useConfig } from '~/store'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import { createSignal, For, Show, type JSX } from 'solid-js'
import toast from 'solid-toast' // 引入 toast

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
  // 用于追踪正在备份的游戏 ID
  const [backingUpId, setBackingUpId] = createSignal<number | null>(null)

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

  // --- 核心修改：健壮的备份处理函数 ---
  const handleBackup = async (index: number) => {
    const game = config.games[index]
    if (!game) return

    // 防止重复点击
    if (backingUpId() === game.id) return

    // 设置当前正在备份的状态
    setBackingUpId(game.id)

    // 创建一个 toast ID，用于后续更新同一个 toast
    const toastId = toast.loading(`Archiving: ${game.name}...`)

    try {
      // 1. 执行归档
      const archived_filename = await invoke<string>('archive', { gameId: game.id })
      console.log('archived_filename:', archived_filename)

      // 2. 更新 Toast 状态为上传中
      toast.loading(`Uploading: ${game.name}...`, { id: toastId })

      // 3. 执行上传
      await invoke<void>('upload_archive', {
        gameId: game.id,
        archiveFilename: archived_filename
      })

      // 4. 成功提示
      toast.success(`Sync Success: ${game.name}`, { id: toastId, duration: 3000 })
    } catch (error) {
      console.error('Backup failed:', error)
      // 提取错误信息，兼容 Error 对象和字符串
      const errMsg = error instanceof Error ? error.message : String(error)
      toast.error(`Sync Failed: ${errMsg}`, { id: toastId, duration: 4000 })
    } finally {
      // 无论成功失败，重置状态，恢复按钮可用
      setBackingUpId(null)
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
                // 传递 loading 状态给子组件
                isBackingUp={backingUpId() === game.id}
                onEdit={() => openEditModal(i())}
                onBackup={() => handleBackup(i())}
                onSync={() => openSyncModal(i())}
              />
            )}
          </For>

          {/* 新增游戏按钮保持不变 */}
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

      {/* Modal 部分保持不变 */}
      <Show when={isEditModalOpen()}>
        <div
          class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeEditModal}
        >
          <div
            class="dark:bg-zinc-800 bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <GameEditModal
              gameInfo={editingGameInfo()}
              editMode={isEditMode()}
              cancel={closeEditModal}
              confirm={handleSave}
              onDelete={editingIndex() !== null ? handleDelete : undefined}
            />
          </div>
        </div>
      </Show>
      <Show when={isSyncModalOpen()}>
        <div
          class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeEditModal}
        >
          <div
            class="dark:bg-zinc-800 bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <ArchiveSyncModal
              gameId={editingGameInfo()?.id ?? 0}
              onClose={closeSyncModal}
            />
          </div>
        </div>
      </Show>
    </>
  )
}

export default GamePage
