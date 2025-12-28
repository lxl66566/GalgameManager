import { type Game } from '@bindings/Game'
import PathListEditor from '@components/PathListEditor'
import CachedImage from '@components/ui/Image'
import GameSettingButton from '@components/ui/StandardButton'
import { basename, dirname } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { dateToInput, durationToForm, inputToDate } from '@utils/time'
import { createSignal, Show, Suspense } from 'solid-js'
import { createStore } from 'solid-js/store'

interface GameEditModalProps {
  // 如果为 undefined/null，则视为“新增游戏”模式
  gameInfo?: Game | null
  confirm: (game: Game) => void
  cancel: () => void
  // 只有在编辑模式下才需要传入 onDelete
  onDelete?: () => void
}

const DEFAULT_GAME: Game = {
  name: '',
  excutablePath: null,
  savePaths: [],
  imageUrl: null,
  imageSha256: null,
  addedTime: new Date().toISOString(),
  lastPlayedTime: null,
  useTime: [0, 0]
}

export default function GameEditModal(props: GameEditModalProps) {
  const isEditMode = () => !!props.gameInfo

  // 如果 props.gameInfo 存在则深拷贝，否则使用默认空对象
  const [localGame, setLocalGame] = createStore<Game>(
    structuredClone(props.gameInfo ?? DEFAULT_GAME)
  )

  const [playTime, setPlayTime] = createSignal(durationToForm(localGame.useTime))

  const updateDuration = (h: number, m: number) => {
    setPlayTime({ h, m })
    const totalSecs = h * 3600 + m * 60
    setLocalGame('useTime', [totalSecs, 0])
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
        // 智能填充名称：如果是新增模式且名字为空
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
    <div class="flex flex-col w-full h-full max-h-[85vh]">
      {/* Header */}
      <div class="flex justify-between items-center mb-4 flex-shrink-0">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {isEditMode() ? '编辑游戏信息' : '添加新游戏'}
        </h1>
      </div>

      {/* Body */}
      <div class="flex flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Image */}
        <div class="w-48 flex flex-col gap-3 flex-shrink-0">
          <div class="aspect-[2/3] w-full bg-gray-200 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 relative group shadow-lg">
            <Suspense
              fallback={
                <div class="w-full h-full animate-pulse bg-gray-300 dark:bg-gray-700" />
              }
            >
              <CachedImage
                url={localGame.imageUrl}
                hash={localGame.imageSha256}
                class="object-cover w-full h-full"
              />
            </Suspense>
            <div
              class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer gap-2"
              onClick={handleSelectImage}
            >
              <span class="text-white text-xs font-bold">更换封面</span>
            </div>
          </div>
          <button
            onClick={() => {
              setLocalGame('imageUrl', null)
              setLocalGame('imageSha256', null)
            }}
            class="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 underline text-center"
          >
            移除图片
          </button>
        </div>

        {/* Right Column: Form */}
        <div class="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {/* Name */}
          <div class="flex flex-col gap-1">
            <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
              游戏名称
            </label>
            <input
              type="text"
              class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
              value={localGame.name}
              onInput={e => setLocalGame('name', e.currentTarget.value)}
              placeholder="请输入游戏名称"
            />
          </div>

          {/* Executable Path */}
          <div class="flex flex-col gap-1">
            <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
              启动路径
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                class="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 truncate transition-colors"
                value={localGame.excutablePath || ''}
                onInput={e => setLocalGame('excutablePath', e.currentTarget.value)}
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

          <hr class="border-gray-300 dark:border-gray-700 my-1" />

          <PathListEditor
            label="存档/配置文件夹"
            paths={localGame.savePaths}
            onChange={newPaths => setLocalGame('savePaths', newPaths)}
          />

          <hr class="border-gray-300 dark:border-gray-700 my-1" />

          {/* Time Settings */}
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                添加时间
              </label>
              <input
                type="datetime-local"
                class="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                value={dateToInput(localGame.addedTime)}
                onInput={e =>
                  setLocalGame(
                    'addedTime',
                    inputToDate(e.currentTarget.value) || localGame.addedTime
                  )
                }
              />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                最后运行
              </label>
              <input
                type="datetime-local"
                class="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                value={dateToInput(localGame.lastPlayedTime)}
                onInput={e =>
                  setLocalGame('lastPlayedTime', inputToDate(e.currentTarget.value))
                }
              />
            </div>
            <div class="col-span-2 flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                游玩时长
              </label>
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    class="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 pr-9"
                    value={playTime().h}
                    onInput={e =>
                      updateDuration(parseInt(e.currentTarget.value) || 0, playTime().m)
                    }
                  />
                  <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
                    小时
                  </span>
                </div>
                <div class="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    class="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 pr-9"
                    value={playTime().m}
                    onInput={e =>
                      updateDuration(playTime().h, parseInt(e.currentTarget.value) || 0)
                    }
                  />
                  <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
                    分钟
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div class="flex flex-row items-center justify-between w-full mt-4 pt-3 border-t border-gray-300 dark:border-gray-700 flex-shrink-0">
        {/* Delete Button (Only in Edit Mode) */}
        <div>
          <Show when={isEditMode()}>
            <button
              onClick={props.onDelete}
              class="px-4 py-2 rounded text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
            >
              删除游戏
            </button>
          </Show>
        </div>

        <div class="flex gap-3">
          <GameSettingButton
            func={props.cancel}
            color="bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            text="取消"
          />
          <GameSettingButton
            func={() => props.confirm(localGame)}
            color="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
            text="保存更改"
          />
        </div>
      </div>
    </div>
  )
}
