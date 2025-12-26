import { type Game } from '@bindings/Game'
import { DropArea } from '@components/DropArea'
import GameEditModal from '@components/GameEditModel'
import CachedImage from '@components/ui/Image'
import { displayDuration } from '@utils/time'
import { AiTwotonePlusCircle } from 'solid-icons/ai'
import { FaRegularCirclePlay } from 'solid-icons/fa'
import { IoOptionsOutline } from 'solid-icons/io'
import { createSignal, type JSX } from 'solid-js'

const games: Game[] = [
  {
    name: '游戏 1',
    excutablePath: null,
    savePaths: [],
    imageUrl: 'https://via.placeholder.com/300x200',
    imageSha256: '',
    addedTime: new Date().toISOString(),
    lastPlayedTime: null,
    useTime: [0, 0]
  },
  ...Array.from(
    { length: 5 },
    (_, i): Game => ({
      name: `游戏 ${i + 2}`,
      excutablePath: null,
      savePaths: [],
      imageUrl: 'https://via.placeholder.com/300x200',
      imageSha256: '',
      addedTime: new Date().toISOString(),
      lastPlayedTime: null,
      useTime: [0, 0]
    })
  )
]

const GameItem = ({ game }: { game: Game }) => {
  const [modalOpen, setModalOpen] = createSignal(false)
  const [selectedGame, setSelectedGame] = createSignal<Game | null>(null)

  const openModal = (game: Game) => {
    setSelectedGame(game)
    setModalOpen(true)
  }

  const closeModalAndSave = () => {
    console.log('保存设置') // TODO
    setModalOpen(false)
  }

  const closeModal = () => {
    setModalOpen(false)
  }
  return (
    <>
      <GameItemWrapper>
        <div class="relative group cursor-pointer">
          <CachedImage
            url={game.imageUrl ?? ''}
            alt={game.name}
            class="w-full h-52 object-cover rounded-t-lg transition duration-300"
          />
          <div class="absolute inset-0 dark:bg-black/50 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
            <FaRegularCirclePlay class="w-16 h-16 text-white" />
          </div>
          <button
            onClick={() => openModal(game)}
            class="absolute bottom-2 right-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded-md transition duration-300"
          >
            <IoOptionsOutline class="w-6 h-6" />
          </button>
        </div>
        <div class="p-4 dark:bg-slate-700">
          <h2 class="dark:text-gray-300 font-semibold">{game.name}</h2>
          <p class="dark:text-gray-400">{displayDuration(game.useTime)}</p>
        </div>
      </GameItemWrapper>

      {/* 模态窗口 */}
      {modalOpen() && (
        <div
          class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" // p-4 保证极小屏幕下也有边距
          onClick={closeModal}
        >
          {/* 
            修改点：
            1. max-h-[90vh]: 保证上下留有空隙，不会贴边。
            2. flex flex-col: 让内部元素可以正确布局。
            3. overflow-hidden: 配合内部的 overflow-y-auto，实现内部滚动。
            4. w-full max-w-4xl: 响应式宽度，大屏更宽，小屏占满。
          */}
          <div
            class="dark:bg-zinc-800 bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden border border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <GameEditModal
              gameInfo={selectedGame()!}
              cancel={closeModal}
              confirm={closeModalAndSave}
            />
          </div>
        </div>
      )}
    </>
  )
}

/**
 * GameItemWrapper defines the size and style of the game item.
 * @param param0 inner element
 * @returns void
 */
const GameItemWrapper = ({
  children,
  extra_class
}: {
  /**
   * Inner element.
   */
  children: JSX.Element
  /**
   * Extra classes to add to the wrapper.
   */
  extra_class?: string
}) => {
  return (
    <div
      class={`relative rounded-lg overflow-hidden dark:bg-slate-700 shadow-md w-44 h-72 ${extra_class}`}
    >
      {children}
    </div>
  )
}

const GamePage = (): JSX.Element => {
  return (
    <>
      {/* <GameImportDialog cancel={() => {}} confirm={() => {}} /> */}
      <div class="flex flex-col container mx-auto p-4 h-screen">
        <h1 class="text-2xl font-bold mb-4">启动游戏</h1>
        <div class="flex-1 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-8 gap-y-6 pb-5">
          {games.map(game => GameItem({ game }))}
          {/* 新增游戏按钮 */}
          <GameItemWrapper extra_class="flex">
            <div
              class="flex flex-col flex-1 items-center justify-center text-center cursor-pointer"
              onclick={triggerSelectToAddNewGames}
            >
              <DropArea callback={addNewGames}>
                <AiTwotonePlusCircle class="w-16 h-16 text-gray-400" />
                <p class="text-gray-400 text-sm mt-2 mx-5">点击或拖拽可执行文件到此处</p>
              </DropArea>
            </div>
          </GameItemWrapper>
        </div>
      </div>
    </>
  )
}

export default GamePage

const triggerSelectToAddNewGames = () => {
  // TODO
  console.log('选择文件')
  addNewGames([''])
}

const addNewGames = (paths: string[]) => {}
