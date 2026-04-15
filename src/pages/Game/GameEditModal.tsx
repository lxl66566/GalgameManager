import { type Game } from '@bindings/Game'
import PathListEditor from '@components/PathListEditor'
import PluginSection from '@components/PluginSection'
import { Button } from '@components/ui/Button'
import CachedImage from '@components/ui/CachedImage'
import { FormField } from '@components/ui/FormField'
import { FormPathInput } from '@components/ui/FormPathInput'
import { Input } from '@components/ui/Input'
import { myToast } from '@components/ui/myToast'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { fuckBackslash, getParentPath } from '@utils/path'
import { getDeviceVarMap, replaceWithVarNames, resolveVar } from '@utils/resolveVar'
import { dateToInput, durationToForm, inputToDate } from '@utils/time'
import { fetchVnCover } from '@utils/vndb'
import { useI18n } from '~/i18n'
import { PLUGIN_REGISTRY } from '~/pages/Plugin/plugins'
import { buildNewInstance } from '~/pages/Plugin/plugins/types'
import { useConfig } from '~/store'
import { cn } from '~/lib/utils'
import { FiAlertTriangle, FiRefreshCw, FiSearch } from 'solid-icons/fi'
import {
  createEffect,
  createResource,
  createSignal,
  onMount,
  Show,
  Suspense
} from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'

// ─── Component ────────────────────────────────────────────────────────────────

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
  lastUploadTime: null,
  plugins: []
}

export default function GameEditModal(props: GameEditModalProps) {
  const { t } = useI18n()
  const { config } = useConfig()

  const isEditMode = () => props.editMode ?? !!props.gameInfo

  // Resolve the current device variable map (cached after first fetch)
  const [currentVars] = createResource(() => config.devices, getDeviceVarMap)

  // onBulkInput for path fields: replace variable values with {varName}
  // (backslashes are already normalised by FormPathInput before this runs)
  const bulkPathTransform = (v: string): string => {
    const vars = currentVars()
    return vars ? replaceWithVarNames(v, vars) : v
  }

  // Auto-populate plugins for new games based on autoAdd meta config
  const baseGame = structuredClone(unwrap(props.gameInfo ?? DEFAULT_GAME))
  if (!isEditMode()) {
    const autoPlugins = PLUGIN_REGISTRY.filter(def => {
      const meta = config.pluginMetadatas[def.metaKey] as Record<string, unknown>
      return meta?.['autoAdd'] === true
    }).map(def => buildNewInstance(def, config.pluginMetadatas))
    baseGame.plugins = autoPlugins.length > 0 ? autoPlugins : []
  }

  const [localGame, setLocalGame] = createStore<Game>(baseGame)

  // 临时存储输入框的内容，避免每次按键都触发图片加载
  const [tempImageUrl, setTempImageUrl] = createSignal(localGame.imageUrl || '')

  // VNDB 搜索相关状态与逻辑
  const [isSearching, setIsSearching] = createSignal(false)
  const [searchId, setSearchId] = createSignal(0)

  const [playTime, setPlayTime] = createSignal(durationToForm(localGame.useTime))

  // 自动触发逻辑：如果不是编辑模式，并且创建时带了游戏名称，则自动搜索 VNDB 封面
  onMount(() => {
    if (!isEditMode() && localGame.name) {
      handleSearchVnCover()
    }
  })

  // 当 store 中的 imageUrl 发生变化时，同步到输入框
  createEffect(() => {
    setTempImageUrl(localGame.imageUrl || '')
  })

  const updateDuration = (h: number, m: number) => {
    setPlayTime({ h, m })
    const [origTotalSecs = 0, origNanos = 0] = localGame.useTime || [0, 0]
    const remainingSecs = origTotalSecs % 60
    const totalSecs = h * 3600 + m * 60 + remainingSecs
    setLocalGame('useTime', [totalSecs, origNanos])
  }

  // 提交图片更改的逻辑
  const commitImageChange = () => {
    const currentInput = tempImageUrl().trim()
    if (currentInput !== (localGame.imageUrl || '')) {
      setLocalGame('imageUrl', currentInput || null)
      setLocalGame('imageSha256', null)
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
        setLocalGame('imageUrl', fuckBackslash(selected))
        setLocalGame('imageSha256', null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = () => {
    myToast({
      variant: 'warning',
      title: t('game.edit.deleteGame'),
      message: t('ui.confirm') + ' ' + t('game.edit.deleteGame') + '?',
      actions: [
        {
          label: t('ui.cancel'),
          variant: 'secondary',
          onClick: () => {}
        },
        {
          label: t('ui.confirm'),
          variant: 'danger',
          onClick: () => {
            props.onDelete()
          }
        }
      ]
    })
  }

  const handleSearchVnCover = async () => {
    if (!localGame.name) return

    if (isSearching()) {
      setIsSearching(false)
      setSearchId(id => id + 1)
      return
    }

    const currentSearchId = searchId() + 1
    setSearchId(currentSearchId)
    setIsSearching(true)

    try {
      const url = await fetchVnCover(localGame.name)
      if (isSearching() && searchId() === currentSearchId) {
        if (url) {
          setTempImageUrl(url)
          setLocalGame('imageUrl', url)
          setLocalGame('imageSha256', null)
        } else {
          myToast({
            variant: 'warning',
            title: t('game.edit.searchNotFound'),
            message: t('game.edit.searchNotFoundMsg')
          })
        }
      }
    } catch (e) {
      if (isSearching() && searchId() === currentSearchId) {
        myToast({
          variant: 'error',
          title: t('game.edit.searchFailed'),
          message: t('game.edit.searchFailedMsg')
        })
      }
    } finally {
      if (searchId() === currentSearchId) {
        setIsSearching(false)
      }
    }
  }

  // ─── FS existence checks ──────────────────────────────────────────────────

  const [exePathWarning] = createResource(
    () => ({ path: localGame.excutablePath, vars: currentVars() }),
    async ({ path, vars }) => {
      if (!path || !vars) return undefined
      try {
        const resolved = resolveVar(path, vars)
        const results = await invoke<boolean[]>('paths_exist', { paths: [resolved] })
        return results[0] ? undefined : t('hint.pathNotExist')
      } catch {
        return undefined
      }
    }
  )

  const [savePathWarnings] = createResource(
    () => ({ paths: [...localGame.savePaths], vars: currentVars() }),
    async ({ paths, vars }) => {
      if (paths.length === 0 || !vars) return []
      try {
        const resolved = paths.map(p => resolveVar(p, vars))
        const results = await invoke<boolean[]>('paths_exist', { paths: resolved })
        return results.map((exists, i) => (exists ? undefined : paths[i]))
      } catch {
        return []
      }
    }
  )

  const savePathWarningText = () => {
    const warnings = savePathWarnings()
    if (!warnings || warnings.length === 0) return undefined
    const missing = warnings.filter(Boolean)
    return missing.length > 0 ? t('hint.pathNotExist') : undefined
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="dark:bg-zinc-800 bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden border border-gray-200 dark:border-gray-700">
      <div class="flex flex-col w-full h-full max-h-[85vh]">
        {/* Header */}
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            {(isEditMode() ? t('game.edit.editTitle') : t('game.edit.addTitle')) +
              ` (ID = ${localGame.id})`}
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
              <Show when={!localGame.imageUrl}>
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  onClick={handleSelectImage}
                >
                  <span class="text-gray-400 text-xs">
                    {t('game.edit.clickToSelectImage')}
                  </span>
                </div>
              </Show>
            </div>
          </div>

          {/* Right Column: Form */}
          <div class="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {/* Name */}
            <FormField
              label={t('game.edit.gameName')}
              labelClass="text-sm font-bold text-gray-700 dark:text-gray-300"
            >
              <Input
                size="lg"
                class="w-full dark:bg-gray-700 dark:text-white shadow-none focus:ring-0 focus:outline-none"
                value={localGame.name}
                onInput={e => setLocalGame('name', e.currentTarget.value)}
              />
            </FormField>

            {/* Image Source Input */}
            <FormField
              label={t('game.edit.imageUrl')}
              labelClass="text-sm font-bold text-gray-700 dark:text-gray-300"
            >
              <div class="flex gap-2 w-full">
                <Input
                  size="lg"
                  class="flex-1 min-w-0 dark:bg-gray-700 dark:text-white shadow-none focus:ring-0 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={tempImageUrl()}
                  onInput={e => setTempImageUrl(e.currentTarget.value)}
                  onBlur={commitImageChange}
                  onKeyDown={e => e.key === 'Enter' && commitImageChange()}
                  placeholder={t('game.edit.imageUrlPlaceholder')}
                  disabled={isSearching()}
                />
                <button
                  onClick={handleSearchVnCover}
                  disabled={!localGame.name && !isSearching()}
                  class={cn(
                    'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
                    isSearching()
                      ? 'bg-red-500 hover:bg-red-600 text-white dark:bg-red-600 dark:hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500'
                  )}
                  type="button"
                >
                  {isSearching() ? (
                    <>
                      <FiRefreshCw class="w-4 h-4 animate-spin" />
                      {t('ui.cancel')}
                    </>
                  ) : (
                    <>
                      <FiSearch class="w-4 h-4" />
                      VNDB
                    </>
                  )}
                </button>
              </div>
            </FormField>

            {/* Executable Path */}
            <FormField
              label={t('game.edit.exePath')}
              labelClass="text-sm font-bold text-gray-700 dark:text-gray-300"
              warning={exePathWarning()}
            >
              <FormPathInput
                value={localGame.excutablePath || ''}
                onCommit={v => setLocalGame('excutablePath', v || null)}
                onBulkInput={bulkPathTransform}
                onBrowse={normalizedPath => {
                  if (!localGame.name) {
                    setLocalGame('name', getParentPath(normalizedPath) || '')
                  }
                }}
                filters={[
                  { name: 'Executables', extensions: ['exe', 'lnk', 'bat', 'cmd'] }
                ]}
                placeholder={t('game.edit.exePathPlaceholder')}
                size="lg"
              />
            </FormField>

            <hr class="border-gray-300 dark:border-gray-700 my-1" />

            <PathListEditor
              label={t('game.edit.savePath')}
              paths={localGame.savePaths}
              onChange={newPaths => setLocalGame('savePaths', newPaths)}
              onBulkInput={bulkPathTransform}
            />
            <Show when={savePathWarningText()}>
              <p class="flex items-center gap-1 text-[10px] leading-tight text-amber-600 dark:text-amber-400 select-none -mt-2">
                <FiAlertTriangle class="w-3 h-3 shrink-0" />
                {savePathWarningText()}
              </p>
            </Show>

            <hr class="border-gray-300 dark:border-gray-700 my-1" />

            {/* Time Settings */}
            <div class="grid grid-cols-2 gap-4">
              <FormField
                label={t('game.edit.addedTime')}
                labelClass="text-xs font-bold text-gray-500 dark:text-gray-400"
              >
                <Input
                  size="lg"
                  type="datetime-local"
                  class="w-full dark:bg-gray-700 dark:text-white shadow-none focus:ring-0 focus:outline-none"
                  value={dateToInput(localGame.addedTime)}
                  onInput={e =>
                    setLocalGame(
                      'addedTime',
                      inputToDate(e.currentTarget.value) || localGame.addedTime
                    )
                  }
                />
              </FormField>
              <FormField
                label={t('game.edit.lastPlayedTime')}
                labelClass="text-xs font-bold text-gray-500 dark:text-gray-400"
              >
                <Input
                  size="lg"
                  type="datetime-local"
                  class="w-full dark:bg-gray-700 dark:text-white shadow-none focus:ring-0 focus:outline-none"
                  value={dateToInput(localGame.lastPlayedTime)}
                  onInput={e =>
                    setLocalGame('lastPlayedTime', inputToDate(e.currentTarget.value))
                  }
                />
              </FormField>
              <div class="col-span-2">
                <FormField
                  label={t('game.edit.useTime')}
                  labelClass="text-xs font-bold text-gray-500 dark:text-gray-400"
                >
                  <div class="flex items-center gap-2 w-full">
                    <div class="relative flex-1">
                      <Input
                        size="lg"
                        type="number"
                        min="0"
                        class="w-full dark:bg-gray-700 dark:text-white shadow-none focus:ring-0 focus:outline-none pr-9"
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
                      <Input
                        size="lg"
                        type="number"
                        min="0"
                        max="59"
                        class="w-full dark:bg-gray-700 dark:text-white shadow-none focus:ring-0 focus:outline-none pr-9"
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
                </FormField>
              </div>
            </div>

            <hr class="border-gray-300 dark:border-gray-700 my-1" />

            {/* Plugin Section */}
            <PluginSection
              plugins={localGame.plugins ?? []}
              onChange={plugins => setLocalGame('plugins', plugins)}
              onConfigChange={(index, updated) => setLocalGame('plugins', index, updated)}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div class="flex flex-row items-center justify-between w-full mt-2 py-2 border-t border-gray-300 dark:border-gray-700 flex-shrink-0">
          <div>
            <Show when={isEditMode()}>
              <Button
                variant="danger"
                size="lg"
                onClick={handleDelete}
              >
                {t('game.edit.deleteGame')}
              </Button>
            </Show>
          </div>

          <div class="flex gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={props.cancel}
            >
              {t('game.edit.cancel')}
            </Button>

            <Button
              variant="primary"
              size="lg"
              onClick={() => props.confirm(localGame)}
            >
              {t('game.edit.confirmSave')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
