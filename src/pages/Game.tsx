import { FaRegularCirclePlay } from 'solid-icons/fa'
import { IoOptionsOutline } from 'solid-icons/io'
import { createSignal } from 'solid-js'

interface Game {
  name: string
  duration: string
  image: string
}

const games: Game[] = [
  {
    name: '游戏 1',
    duration: '10 小时',
    image: 'https://via.placeholder.com/300x200' // 替换成你的图片 URL
  },
  {
    name: '游戏 2',
    duration: '5 小时',
    image: 'https://via.placeholder.com/300x200'
  },
  {
    name: '游戏 3',
    duration: '8 小时',
    image: 'https://via.placeholder.com/300x200'
  }
]

const GameItem = ({ game }: { game: Game }) => {
  const [modalOpen, setModalOpen] = createSignal(false)
  const [selectedGame, setSelectedGame] = createSignal(null)

  const openModal = game => {
    setSelectedGame(game)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
  }
  return (
    <>
      <div class="relative rounded-lg overflow-hidden dark:bg-slate-700 shadow-md w-40 h-72">
        <div class="relative group">
          <img
            src={game.image}
            alt={game.name}
            class="w-full h-48 object-cover rounded-t-lg transition duration-300"
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
          <p class="dark:text-gray-400">{game.duration}</p>
        </div>
      </div>

      {/* 模态窗口 */}
      {modalOpen() && (
        <div
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            class="dark:bg-zinc-800 rounded-lg p-8 w-1/2"
            onClick={e => e.stopPropagation()}
          >
            {' '}
            {/* 阻止事件冒泡 */}
            <h2 class="text-2xl font-bold mb-4">
              {selectedGame() ? selectedGame().name : '设置'} 设置
            </h2>
            {/* 这里添加设置内容 */}
            <p>这里是 {selectedGame() ? selectedGame().name : ''} 的设置内容。</p>
            <button
              onClick={closeModal}
              class="mt-4 dark:bg-gray-400 hover:dark:bg-gray-500 dark:text-gray-800 font-bold py-2 px-4 rounded"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const GamePage = () => {
  return (
    <div class="dark:bg-slate-800 dark:text-gray-400 min-h-screen p-4">
      <div class="container mx-auto">
        <h1 class="text-3xl font-bold mb-4">启动游戏</h1>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          {games.map(game => GameItem({ game }))}
        </div>
      </div>
    </div>
  )
}

export default GamePage
