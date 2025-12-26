import { type Game } from '@bindings/Game'
import { DropArea } from '@components/DropArea'
import CachedImage from '@components/ui/Image'
import GameSettingButton from '@components/ui/StandardButton'
import { formatDuration } from '@utils/bindings'
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
          <p class="dark:text-gray-400">{formatDuration(game.useTime)}</p>
        </div>
      </GameItemWrapper>

      {/* 模态窗口 */}
      {modalOpen() && (
        <div
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            class="dark:bg-zinc-800 rounded-lg p-6 w-1/2"
            onClick={e => e.stopPropagation()}
          >
            {' '}
            {/* 阻止事件冒泡 */}
            <h2 class="text-2xl font-bold mb-4">{selectedGame()?.name ?? '设置'} 设置</h2>
            {/* 这里添加设置内容 */}
            <p>这里是 {selectedGame()?.name ?? ''} 的设置内容。</p>
            <div class="mt-2 flex justify-end">
              <GameSettingButton
                func={closeModalAndSave}
                color="dark:bg-red-400 hover:dark:bg-red-500"
                text="保存"
              />
              <GameSettingButton
                func={closeModal}
                color="dark:bg-gray-400 hover:dark:bg-gray-500"
                text="取消"
              />
            </div>
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

const addNewGames = (paths: string[]) => {
  // TODO
  console.log('新增游戏')
}
