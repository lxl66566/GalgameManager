import { type Game } from '@bindings/Game'
import { DropArea } from '@components/DropArea'
import { useConfig } from '~/store'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import { createSignal, For, Show, type JSX } from 'solid-js'
import GameEditModal from './GameEditModel'
import { GameItem, GameItemWrapper } from './GameItem'

const GamePage = (): JSX.Element => {
  const { config, actions } = useConfig()

  const [isModalOpen, setModalOpen] = createSignal(false)
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  const openAddModal = () => {
    setEditingIndex(null)
    setModalOpen(true)
  }

  const openEditModal = (index: number) => {
    setEditingIndex(index)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingIndex(null)
  }

  const handleSave = (game: Game) => {
    const index = editingIndex()
    if (index === null) {
      actions.addGame(game)
    } else {
      actions.updateGame(index, game)
    }
    closeModal()
  }

  const handleDelete = () => {
    const index = editingIndex()
    if (index !== null) {
      const confirmed = confirm(`确定要删除游戏 "${config.games[index].name}" 吗？`)
      if (confirmed) {
        actions.removeGame(index)
        closeModal()
      }
    }
  }

  const handleDropAdd = (paths: string[]) => {
    console.log('Dropped paths:', paths)
    openAddModal()
  }

  // --- 新增功能的处理函数占位符 ---
  const handleBackup = (index: number) => {
    const game = config.games[index]
    console.log(`Backing up game: ${game.name}`)
    // TODO: 实现备份逻辑
  }

  const handleSync = (index: number) => {
    const game = config.games[index]
    console.log(`Syncing game: ${game.name}`)
    // TODO: 实现同步逻辑
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
                onEdit={() => openEditModal(i())}
                onBackup={() => handleBackup(i())}
                onSync={() => handleSync(i())}
              />
            )}
          </For>

          {/* 新增游戏按钮 */}
          <GameItemWrapper extra_class="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent shadow-none hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
            <div
              class="flex flex-col flex-1 items-center justify-center text-center cursor-pointer w-full h-full group"
              onClick={openAddModal}
            >
              <DropArea
                callback={handleDropAdd}
                class="w-full h-full flex flex-col items-center justify-center"
              >
                <AiTwotonePlusCircle class="w-16 h-16 text-gray-400 group-hover:text-blue-500 transition-colors duration-300" />
                <p class="text-gray-500 dark:text-gray-400 text-sm mt-2 px-4 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
                  点击添加
                  <br />
                  或拖拽文件至此
                </p>
              </DropArea>
            </div>
          </GameItemWrapper>
        </div>
      </div>

      {/* 全局模态框 */}
      <Show when={isModalOpen()}>
        <div
          class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            class="dark:bg-zinc-800 bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden border border-gray-200 dark:border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <GameEditModal
              gameInfo={editingIndex() !== null ? config.games[editingIndex()!] : null}
              cancel={closeModal}
              confirm={handleSave}
              onDelete={editingIndex() !== null ? handleDelete : undefined}
            />
          </div>
        </div>
      </Show>
    </>
  )
}

export default GamePage
