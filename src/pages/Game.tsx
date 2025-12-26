import { type Game } from '@bindings/Game'
import { DropArea } from '@components/DropArea'
import GameEditModal from '@components/GameEditModel'
import CachedImage from '@components/ui/Image'
import { displayDuration } from '@utils/time'
import { useConfig } from '~/store'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import { FaRegularCirclePlay } from 'solid-icons/fa'
import { IoOptionsOutline } from 'solid-icons/io'
import { createSignal, For, Show, type JSX } from 'solid-js'

// GameItem 现在是一个纯展示组件，行为通过回调传入
const GameItem = (props: { game: Game; onEdit: () => void }) => {
  return (
    <GameItemWrapper>
      <div class="relative group cursor-pointer">
        <CachedImage
          url={props.game.imageUrl ?? ''}
          alt={props.game.name}
          class="w-full h-52 object-cover rounded-t-lg transition duration-300"
        />
        <div class="absolute inset-0 dark:bg-black/50 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
          <FaRegularCirclePlay class="w-16 h-16 text-white" />
        </div>
        <button
          onClick={e => {
            e.stopPropagation()
            props.onEdit()
          }}
          class="absolute bottom-2 right-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded-md transition duration-300"
        >
          <IoOptionsOutline class="w-6 h-6" />
        </button>
      </div>
      <div class="p-4 dark:bg-slate-700">
        <h2 class="dark:text-gray-300 font-semibold truncate" title={props.game.name}>
          {props.game.name}
        </h2>
        <p class="dark:text-gray-400 text-sm mt-1">
          {displayDuration(props.game.useTime)}
        </p>
      </div>
    </GameItemWrapper>
  )
}

const GameItemWrapper = ({
  children,
  extra_class
}: {
  children: JSX.Element
  extra_class?: string
}) => {
  return (
    <div
      class={`relative rounded-lg overflow-hidden bg-white dark:bg-slate-700 shadow-md w-44 h-72 flex flex-col ${extra_class}`}
    >
      {children}
    </div>
  )
}

const GamePage = (): JSX.Element => {
  const { config, actions } = useConfig()

  // 模态框状态管理
  const [isModalOpen, setModalOpen] = createSignal(false)
  // 如果为 null，表示正在新增；如果为 number，表示正在编辑对应索引的游戏
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  // 打开新增
  const openAddModal = () => {
    setEditingIndex(null)
    setModalOpen(true)
  }

  // 打开编辑
  const openEditModal = (index: number) => {
    setEditingIndex(index)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingIndex(null)
  }

  // 保存逻辑：区分新增和更新
  const handleSave = (game: Game) => {
    const index = editingIndex()
    if (index === null) {
      actions.addGame(game)
    } else {
      actions.updateGame(index, game)
    }
    closeModal()
  }

  // 删除逻辑
  const handleDelete = () => {
    const index = editingIndex()
    if (index !== null) {
      // 可以加一个 confirm 弹窗，这里直接删除
      const confirmed = confirm(`确定要删除游戏 "${config.games[index].name}" 吗？`)
      if (confirmed) {
        actions.removeGame(index)
        closeModal()
      }
    }
  }

  // 拖拽添加逻辑适配
  const handleDropAdd = (paths: string[]) => {
    // 这里可以做更复杂的逻辑，比如自动解析路径
    // 目前简单实现：打开新增模态框，并尝试预填路径（如果需要的话，得改 Modal 接口接受 initialData，这里暂略）
    console.log('Dropped paths:', paths)
    openAddModal()
  }

  return (
    <>
      <div class="flex flex-col container mx-auto p-4 h-screen">
        <h1 class="text-2xl font-bold mb-4 dark:text-white">启动游戏</h1>
        <div class="flex-1 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-6 gap-y-6 pb-5 overflow-y-auto custom-scrollbar">
          <For each={config.games}>
            {(game, i) => <GameItem game={game} onEdit={() => openEditModal(i())} />}
          </For>

          {/* 新增游戏按钮 */}
          <GameItemWrapper extra_class="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent shadow-none hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
            <div
              class="flex flex-col flex-1 items-center justify-center text-center cursor-pointer w-full h-full"
              onClick={openAddModal}
            >
              <DropArea
                callback={handleDropAdd}
                class="w-full h-full flex flex-col items-center justify-center"
              >
                <AiTwotonePlusCircle class="w-16 h-16 text-gray-400" />
                <p class="text-gray-500 dark:text-gray-400 text-sm mt-2 px-4">
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
