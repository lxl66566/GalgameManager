import { type Game } from '@bindings/Game'
import PathListEditor from '@components/PathListEditor'
import CachedImage from '@components/ui/CachedImage'
import { myToast } from '@components/ui/myToast'
import { basename, dirname } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { dateToInput, durationToForm, inputToDate } from '@utils/time'
import { useI18n } from '~/i18n'
import { createEffect, createSignal, Show, Suspense } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'

interface GameEditModalProps {
  gameInfo?: Game | null
  editMode?: boolean
  confirm: (game: Game) => void
  cancel: () => void
  onDelete: () => void
}

const DEFAULT_GAME: Game = {
  id: 0,
  name: '',
  excutablePath: null,
  savePaths: [],
  imageUrl: null,
  imageSha256: null,
  addedTime: new Date().toISOString(),
  lastPlayedTime: null,
  useTime: [0, 0],
  lastUploadTime: null
}

export default function GameEditModal(props: GameEditModalProps) {
  const { t } = useI18n()

  const isEditMode = () => props.editMode ?? !!props.gameInfo

  const [localGame, setLocalGame] = createStore<Game>(
    structuredClone(unwrap(props.gameInfo ?? DEFAULT_GAME))
  )

  // 1. 新增：临时存储输入框的内容，避免每次按键都触发图片加载
  const [tempImageUrl, setTempImageUrl] = createSignal(localGame.imageUrl || '')

  // 2. 新增：当 store 中的 imageUrl 发生变化（例如通过浏览按钮或清除按钮）时，同步到输入框
  createEffect(() => {
    setTempImageUrl(localGame.imageUrl || '')
  })

  const [playTime, setPlayTime] = createSignal(durationToForm(localGame.useTime))

  const updateDuration = (h: number, m: number) => {
    setPlayTime({ h, m })
    const totalSecs = h * 3600 + m * 60
    setLocalGame('useTime', [totalSecs, 0])
  }

  // 提交图片更改的逻辑
  const commitImageChange = () => {
    const currentInput = tempImageUrl().trim()
    // 只有当内容真正改变时才更新 store
    if (currentInput !== (localGame.imageUrl || '')) {
      setLocalGame('imageUrl', currentInput || null)
      setLocalGame('imageSha256', null) // 重置 Hash 以触发重新计算/加载
    }
  }

  const handleSelectImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico', 'bmp', 'svg']
          }
        ]
      })
      if (selected && typeof selected === 'string') {
        // 浏览选择直接更新 Store，createEffect 会自动同步 tempImageUrl
        setLocalGame('imageUrl', selected)
        setLocalGame('imageSha256', null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = () => {
    myToast({
      variant: 'warning',
      title: '删除游戏',
      message: '确认删除？',
      actions: [
        {
          label: '取消',
          variant: 'secondary',
          onClick: () => {}
        },
        {
          label: '确认',
          variant: 'danger',
          onClick: () => {
            props.onDelete()
          }
        }
      ]
    })
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
    <div class="dark:bg-zinc-800 bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden border border-gray-200 dark:border-gray-700">
      <div class="flex flex-col w-full h-full max-h-[85vh]">
        {/* Header */}
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditMode() ? t('game.edit.editTitle') : t('game.edit.addTitle')}
          </h1>
        </div>

        {/* Body */}
        <div class="flex flex-row gap-6 flex-1 min-h-0">
          {/* Left Column: Image Preview */}
          <div class="w-[25%] max-w-50 min-w-20 flex flex-col gap-3">
            <div class="aspect-[2/3] w-full bg-gray-200 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 relative shadow-lg">
              <Suspense
                fallback={
                  <div class="w-full h-full animate-pulse bg-gray-300 dark:bg-gray-700" />
                }
              >
                <CachedImage
                  url={localGame.imageUrl}
                  hash={localGame.imageSha256}
                  class="object-cover w-full h-full"
                  onHashUpdate={(newHash: string) => {
                    setLocalGame('imageSha256', newHash)
                  }}
                />
              </Suspense>
              {/* 只有当没有图片时显示提示，有图片时依靠右侧输入框修改，保持界面整洁 */}
              <Show when={!localGame.imageUrl}>
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  onClick={handleSelectImage}
                >
                  <span class="text-gray-400 text-xs">点击选择图片</span>
                </div>
              </Show>
            </div>
          </div>

          {/* Right Column: Form */}
          <div class="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {/* Name */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('game.edit.gameName')}
              </label>
              <input
                type="text"
                class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                value={localGame.name}
                onInput={e => setLocalGame('name', e.currentTarget.value)}
              />
            </div>

            {/* Image Source Input */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('game.edit.imageUrl')}
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                  // 绑定到 tempImageUrl
                  value={tempImageUrl()}
                  // 输入时只更新临时变量
                  onInput={e => setTempImageUrl(e.currentTarget.value)}
                  // 失去焦点时提交
                  onBlur={commitImageChange}
                  // 按下回车时提交
                  onKeyDown={e => e.key === 'Enter' && commitImageChange()}
                  placeholder="https://... 或 C:/..."
                />
                <button
                  onClick={handleSelectImage}
                  class="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors"
                >
                  {t('ui.browse')}
                </button>
                <Show when={localGame.imageUrl}>
                  <button
                    onClick={() => {
                      setLocalGame('imageUrl', null)
                      setLocalGame('imageSha256', null)
                      // createEffect 会自动处理 tempImageUrl 的清空
                    }}
                    class="bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors"
                  >
                    {t('ui.clear')}
                  </button>
                </Show>
              </div>
            </div>

            {/* Executable Path */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('game.edit.exePath')}
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
                  {t('ui.browse')}
                </button>
              </div>
            </div>

            <hr class="border-gray-300 dark:border-gray-700 my-1" />

            <PathListEditor
              label={t('game.edit.savePath')}
              paths={localGame.savePaths}
              onChange={newPaths => setLocalGame('savePaths', newPaths)}
            />

            <hr class="border-gray-300 dark:border-gray-700 my-1" />

            {/* Time Settings */}
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                  {t('game.edit.addedTime')}
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
                  {t('game.edit.lastPlayedTime')}
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
                  {t('game.edit.useTime')}
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
                      {t('unit.hour')}
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
                      {t('unit.minute')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div class="flex flex-row items-center justify-between w-full mt-2 py-2 border-t border-gray-300 dark:border-gray-700 flex-shrink-0">
          <div>
            <Show when={isEditMode()}>
              <button
                type="button"
                onClick={handleDelete}
                class="px-4 py-2 rounded text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
              >
                {t('game.edit.deleteGame')}
              </button>
            </Show>
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              onClick={props.cancel}
              class="px-4 py-2 rounded text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              {t('game.edit.cancel')}
            </button>

            <button
              type="button"
              onClick={() => props.confirm(localGame)}
              class="px-4 py-2 rounded text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-sm transition-colors"
            >
              {t('game.edit.confirmSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
