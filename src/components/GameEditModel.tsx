import { type Game } from '@bindings/Game'
import CachedImage from '@components/ui/Image'
import GameSettingButton from '@components/ui/StandardButton'
import { basename, dirname } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { dateToInput, durationToForm, inputToDate } from '@utils/time'
import { createSignal, Suspense } from 'solid-js'
import { createStore } from 'solid-js/store'
import PathListEditor from './ui/PathListEditor'

interface GameEditModalProps {
  gameInfo: Game
  confirm: (game: Game) => void
  cancel: () => void
}

export default function GameEditModal(props: GameEditModalProps) {
  // 1. 本地状态副本
  const [localGame, setLocalGame] = createStore<Game>(structuredClone(props.gameInfo))

  // 2. 专门处理时长显示的 Signal (方便 UI 绑定)
  const [playTime, setPlayTime] = createSignal(durationToForm(props.gameInfo.useTime))

  // 当 playTime 改变时，同步回 localGame.useTime
  const updateDuration = (h: number, m: number) => {
    setPlayTime({ h, m })
    const totalSecs = h * 3600 + m * 60
    setLocalGame('useTime', [totalSecs, 0]) // 忽略纳秒，设为0
  }

  const handleSelectImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] }]
      })
      if (selected && typeof selected === 'string') {
        setLocalGame('imageUrl', selected)
        setLocalGame('imageSha256', null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSelectExecutable = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Executables', extensions: ['exe', 'lnk', 'bat', 'cmd'] }]
      })
      if (selected && typeof selected === 'string') {
        setLocalGame('excutablePath', selected)
        if (!localGame.name) {
          const parentDir = await dirname(selected)
          const name = await basename(parentDir)
          setLocalGame('name', name)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    // 这里的容器负责：最大高度限制、Flex 布局
    <div class="flex flex-col w-full h-full max-h-[85vh]">
      {/* Header */}
      <div class="flex justify-between items-center mb-4 flex-shrink-0">
        <h1 class="text-2xl font-bold text-white">
          {props.gameInfo.name ? '编辑游戏信息' : '添加新游戏'}
        </h1>
      </div>

      {/* Body: 左右布局 */}
      <div class="flex flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Image (Fixed Width) */}
        <div class="w-48 flex flex-col gap-3 flex-shrink-0">
          <div class="aspect-[2/3] w-full bg-gray-900 rounded-lg overflow-hidden border border-gray-600 relative group shadow-lg">
            <Suspense fallback={<div class="w-full h-full animate-pulse bg-gray-700" />}>
              <CachedImage
                url={localGame.imageUrl}
                hash={localGame.imageSha256}
                class="object-cover w-full h-full"
              />
            </Suspense>
            {/* Hover Overlay */}
            <div
              class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer gap-2"
              onClick={handleSelectImage}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span class="text-white text-xs font-bold">更换封面</span>
            </div>
          </div>

          {/* 可以在图片下面放一些图片相关的元数据或者清除按钮 */}
          <button
            onClick={() => {
              setLocalGame('imageUrl', null)
              setLocalGame('imageSha256', null)
            }}
            class="text-xs text-red-400 hover:text-red-300 underline text-center"
          >
            移除图片
          </button>
        </div>

        {/* Right Column: Form Fields (Scrollable) */}
        <div class="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {/* Basic Info */}
          <div class="space-y-4">
            {/* 游戏名称 */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                游戏名称
              </label>
              <input
                type="text"
                class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400"
                value={localGame.name}
                onInput={e => setLocalGame('name', e.currentTarget.value)}
                placeholder="请输入游戏名称"
              />
            </div>

            {/* 启动路径 */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                启动路径
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 truncate transition-colors placeholder-gray-400"
                  value={localGame.excutablePath || ''}
                  onInput={e => setLocalGame('excutablePath', e.currentTarget.value)}
                  title={localGame.excutablePath || ''}
                  placeholder="选择可执行文件"
                />
                <button
                  onClick={handleSelectExecutable}
                  class="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors"
                >
                  浏览
                </button>
              </div>
            </div>
          </div>

          <hr class="border-gray-700 my-1" />

          {/* Paths */}
          <PathListEditor
            label="存档/配置文件夹"
            paths={localGame.savePaths}
            onChange={newPaths => setLocalGame('savePaths', newPaths)}
          />

          <hr class="border-gray-700 my-1" />

          {/* Statistics / Time Editing */}
          <div class="grid grid-cols-2 gap-4">
            {/* Added Time */}
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-400">添加时间</label>
              <input
                type="datetime-local"
                class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                value={dateToInput(localGame.addedTime)}
                onInput={e =>
                  setLocalGame(
                    'addedTime',
                    inputToDate(e.currentTarget.value) || localGame.addedTime
                  )
                }
              />
            </div>

            {/* Last Played Time */}
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-400">最后运行</label>
              <input
                type="datetime-local"
                class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                value={dateToInput(localGame.lastPlayedTime)}
                onInput={e =>
                  setLocalGame('lastPlayedTime', inputToDate(e.currentTarget.value))
                }
              />
            </div>

            {/* Play Time (Duration) */}
            <div class="col-span-2 flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-400">游玩时长</label>
              <div class="flex items-center gap-2">
                {/* 小时输入框 */}
                <div class="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 pr-9"
                    value={playTime().h}
                    onInput={e =>
                      updateDuration(parseInt(e.currentTarget.value) || 0, playTime().m)
                    }
                  />
                  <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    小时
                  </span>
                </div>

                {/* 分钟输入框 */}
                <div class="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 pr-9"
                    value={playTime().m}
                    onInput={e =>
                      updateDuration(playTime().h, parseInt(e.currentTarget.value) || 0)
                    }
                  />
                  <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    分钟
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div class="flex flex-row items-center justify-end w-full my-3 gap-3 flex-shrink-0 border-t border-gray-700">
        <GameSettingButton
          func={props.cancel}
          color="bg-transparent hover:bg-gray-700 text-gray-300 border border-gray-600"
          text="取消"
        />
        <GameSettingButton
          func={() => props.confirm(localGame)}
          color="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
          text="保存更改"
        />
      </div>
    </div>
  )
}
