import { type Game } from '@bindings/Game'
import PathListEditor from '@components/PathListEditor'
import PluginSection from '@components/PluginSection'
import CachedImage from '@components/ui/CachedImage'
import { FormField, FormPathInput } from '@components/ui/form'
import { MODAL_LABEL } from '@components/ui/GameEditLabel'
import { myToast } from '@components/ui/myToast'
import { open } from '@tauri-apps/plugin-dialog'
import { errToStr } from '@utils/log'
import { fuckBackslash, getParentPath } from '@utils/path'
import { getDeviceVarMap, replaceWithVarNames } from '@utils/resolveVar'
import { dateToInput, durationToForm, inputToDate } from '@utils/time'
import { fetchVnCover } from '@utils/vndb'
import { FiRefreshCw, FiSearch } from 'solid-icons/fi'
import {
  createEffect,
  createResource,
  createSignal,
  onMount,
  Show,
  Suspense
} from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'

import { Button } from '~/components/ui/controls'
import { Input } from '~/components/ui/Input'
import { InputWithSuffix } from '~/components/ui/InputWithSuffix'
import { useI18n } from '~/i18n'
import { PLUGIN_REGISTRY } from '~/pages/Plugin/plugins'
import { buildNewInstance } from '~/pages/Plugin/plugins/types'
import { useConfig } from '~/store'

// ─── Shared style constants for the modal's form fields ───────────────────────

const MODAL_INPUT_BASE =
  'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors'

const MODAL_PATH_INPUT = `flex-1 min-w-0 h-auto ${MODAL_INPUT_BASE} truncate`

// ─── Component ─────

interface GameEditModalProps {
  cancel: () => void
  confirm: (game: Game) => void
  editMode?: boolean
  gameInfo?: Game | null
  onDelete: () => void
}

const DEFAULT_GAME: Game = {
  addedTime: new Date().toISOString(),
  excutablePath: null,
  id: 0,
  imageSha256: null,
  imageUrl: null,
  lastPlayedTime: null,
  lastUploadTime: null,
  name: '',
  plugins: [],
  savePaths: [],
  useTime: [0, 0]
}

export default function GameEditModal(props: GameEditModalProps) {
  const { t } = useI18n()
  const { config } = useConfig()

  const isEditMode = () => props.editMode ?? !!props.gameInfo

  // Resolve the current device variable map (cached after first fetch)
  const [currentVariables] = createResource(() => config.devices, getDeviceVarMap)

  // onBulkInput for path fields: replace variable values with {varName}
  // (backslashes are already normalised by FormPathInput before this runs)
  const bulkPathTransform = (v: string): string => {
    const variables = currentVariables()
    return variables ? replaceWithVarNames(v, variables) : v
  }

  // Auto-populate plugins for new games based on autoAdd meta config
  // eslint-disable-next-line solid/reactivity -- used once for initial state
  const baseGame = structuredClone(unwrap(props.gameInfo ?? DEFAULT_GAME))
  // eslint-disable-next-line solid/reactivity -- used once for initial state
  if (!isEditMode()) {
    const autoPlugins = PLUGIN_REGISTRY.filter(def => {
      const meta = config.pluginMetadatas[def.metaKey] as Record<string, unknown>
      return meta.autoAdd === true
    }).map(def => buildNewInstance(def, config.pluginMetadatas))
    baseGame.plugins = autoPlugins.length > 0 ? autoPlugins : []
  }

  const [localGame, setLocalGame] = createStore<Game>(baseGame)

  // 临时存储输入框的内容，避免每次按键都触发图片加载
  // eslint-disable-next-line solid/reactivity -- used once for initial signal value
  const [temporaryImageUrl, setTemporaryImageUrl] = createSignal(localGame.imageUrl ?? '')

  // VNDB 搜索相关状态与逻辑
  const [isSearching, setIsSearching] = createSignal(false)
  const [searchId, setSearchId] = createSignal(0)

  // eslint-disable-next-line solid/reactivity -- used once for initial signal value
  const [playTime, setPlayTime] = createSignal(durationToForm(localGame.useTime))

  // 自动触发逻辑：如果不是编辑模式，并且创建时带了游戏名称，则自动搜索 VNDB 封面
  onMount(() => {
    if (!isEditMode() && localGame.name) {
      void handleSearchVnCover()
    }
  })

  // 当 store 中的 imageUrl 发生变化时，同步到输入框
  createEffect(() => {
    setTemporaryImageUrl(localGame.imageUrl ?? '')
  })

  const updateDuration = (h: number, m: number) => {
    setPlayTime({ h, m })
    const [origTotalSecs, origNanos] = localGame.useTime
    const remainingSecs = origTotalSecs % 60
    const totalSecs = h * 3600 + m * 60 + remainingSecs
    setLocalGame('useTime', [totalSecs, origNanos])
  }

  // 提交图片更改的逻辑
  const commitImageChange = () => {
    const currentInput = temporaryImageUrl().trim()
    if (currentInput !== (localGame.imageUrl ?? '')) {
      setLocalGame('imageUrl', currentInput || null)
      setLocalGame('imageSha256', null)
      // Invalidate the cached accent color so the new cover gets a fresh
      // extraction on its next load.
      setLocalGame('coverColor', null)
    }
  }

  const handleSelectImage = async () => {
    try {
      const selected = await open({
        directory: false,
        filters: [
          {
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico', 'bmp', 'svg'],
            name: 'Images'
          }
        ],
        multiple: false
      })
      if (selected && typeof selected === 'string') {
        setLocalGame('imageUrl', fuckBackslash(selected))
        setLocalGame('imageSha256', null)
      }
    } catch (error) {
      console.error(error)
      myToast({
        message: t('hint.selectImageFailed') + ': ' + errToStr(error),
        variant: 'error'
      })
    }
  }

  const handleDelete = () => {
    myToast({
      actions: [
        {
          label: t('ui.cancel'),
          onClick: () => {},
          variant: 'secondary'
        },
        {
          label: t('ui.confirm'),
          onClick: () => {
            props.onDelete()
          },
          variant: 'danger'
        }
      ],
      message: t('ui.confirm') + ' ' + t('game.edit.deleteGame') + '?',
      title: t('game.edit.deleteGame'),
      variant: 'warning'
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
          setTemporaryImageUrl(url)
          setLocalGame('imageUrl', url)
          setLocalGame('imageSha256', null)
        } else {
          myToast({
            message: t('game.edit.searchNotFoundMsg'),
            title: t('game.edit.searchNotFound'),
            variant: 'warning'
          })
        }
      }
    } catch {
      if (isSearching() && searchId() === currentSearchId) {
        myToast({
          message: t('game.edit.searchFailedMsg'),
          title: t('game.edit.searchFailed'),
          variant: 'error'
        })
      }
    } finally {
      if (searchId() === currentSearchId) {
        setIsSearching(false)
      }
    }
  }

  // ─── Render ─────

  return (
    <div class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-zinc-800">
      <div class="flex h-full max-h-[85vh] w-full flex-col">
        {/* Header */}
        <div class="mb-4 flex flex-shrink-0 items-center justify-between">
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            {(isEditMode() ? t('game.edit.editTitle') : t('game.edit.addTitle')) +
              ` (ID = ${localGame.id})`}
          </h1>
        </div>

        {/* Body */}
        <div class="flex min-h-0 flex-1 flex-row gap-6">
          {/* Left Column: Image Preview */}
          <div class="max-w-50 flex w-[25%] min-w-20 flex-col gap-3">
            <div class="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-gray-300 bg-gray-200 shadow-lg dark:border-gray-600 dark:bg-gray-900">
              <Suspense
                fallback={
                  <div class="h-full w-full animate-pulse bg-gray-300 dark:bg-gray-700" />
                }
              >
                <CachedImage
                  class="h-full w-full object-cover"
                  extractColor={!localGame.coverColor}
                  hash={localGame.imageSha256}
                  onColorExtracted={(color: string) => {
                    setLocalGame('coverColor', color)
                  }}
                  onHashUpdate={(newHash: string) => {
                    setLocalGame('imageSha256', newHash)
                  }}
                  url={localGame.imageUrl}
                />
              </Suspense>
              <Show when={!localGame.imageUrl}>
                <div
                  class="absolute inset-0 flex cursor-pointer flex-col items-center justify-center transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                  onClick={handleSelectImage}
                >
                  <span class="text-xs text-gray-400">
                    {t('game.edit.clickToSelectImage')}
                  </span>
                </div>
              </Show>
            </div>
          </div>

          {/* Right Column: Form */}
          <div class="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto pr-2">
            {/* Name */}
            <FormField label={t('game.edit.gameName')} labelClass={MODAL_LABEL}>
              <Input
                onInput={e => {
                  setLocalGame('name', e.currentTarget.value)
                }}
                value={localGame.name}
              />
            </FormField>

            {/* Image Source Input */}
            <FormField label={t('game.edit.imageUrl')} labelClass={MODAL_LABEL}>
              <div class="flex w-full gap-2">
                <Input
                  class="min-w-0"
                  disabled={isSearching()}
                  onBlur={commitImageChange}
                  onInput={e => setTemporaryImageUrl(e.currentTarget.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitImageChange()
                  }}
                  placeholder={t('game.edit.imageUrlPlaceholder')}
                  value={temporaryImageUrl()}
                />
                <Button
                  class="px-3 py-1.5"
                  disabled={!localGame.name && !isSearching()}
                  onClick={handleSearchVnCover}
                  size="lg"
                  variant={isSearching() ? 'danger' : 'primary'}
                >
                  {isSearching() ? (
                    <>
                      <FiRefreshCw class="h-4 w-4 animate-spin" />
                      {t('ui.cancel')}
                    </>
                  ) : (
                    <>
                      <FiSearch class="h-4 w-4" />
                      VNDB
                    </>
                  )}
                </Button>
              </div>
            </FormField>

            {/* Executable Path */}
            <FormField label={t('game.edit.exePath')} labelClass={MODAL_LABEL}>
              <FormPathInput
                checkPathExist
                class="w-full"
                filters={[
                  { extensions: ['exe', 'lnk', 'bat', 'cmd'], name: 'Executables' }
                ]}
                inputClass={MODAL_PATH_INPUT}
                onBrowse={normalizedPath => {
                  if (!localGame.name) {
                    setLocalGame('name', getParentPath(normalizedPath) ?? '')
                  }
                }}
                onBulkInput={bulkPathTransform}
                onCommit={v => {
                  setLocalGame('excutablePath', v || null)
                }}
                placeholder={t('game.edit.exePathPlaceholder')}
                value={localGame.excutablePath ?? ''}
              />
            </FormField>

            <PathListEditor
              checkPathExist
              checkVars
              label={t('game.edit.savePath')}
              onBulkInput={bulkPathTransform}
              onChange={newPaths => {
                setLocalGame('savePaths', newPaths)
              }}
              paths={localGame.savePaths}
            />

            <hr class="my-1 border-gray-300 dark:border-gray-700" />

            {/* Time Settings */}
            <div class="grid grid-cols-2 gap-4">
              <FormField label={t('game.edit.addedTime')} labelClass={MODAL_LABEL}>
                <Input
                  onInput={e => {
                    setLocalGame(
                      'addedTime',
                      inputToDate(e.currentTarget.value) ?? localGame.addedTime
                    )
                  }}
                  type="datetime-local"
                  value={dateToInput(localGame.addedTime)}
                />
              </FormField>

              <FormField label={t('game.edit.lastPlayedTime')} labelClass={MODAL_LABEL}>
                <Input
                  onInput={e => {
                    setLocalGame('lastPlayedTime', inputToDate(e.currentTarget.value))
                  }}
                  type="datetime-local"
                  value={dateToInput(localGame.lastPlayedTime)}
                />
              </FormField>

              <FormField
                class="col-span-2"
                label={t('game.edit.useTime')}
                labelClass={MODAL_LABEL}
              >
                <div class="flex w-full items-center gap-4">
                  <InputWithSuffix
                    min="0"
                    onInput={e => {
                      updateDuration(parseInt(e.currentTarget.value) || 0, playTime().m)
                    }}
                    suffix={t('unit.hour')}
                    type="number"
                    value={playTime().h}
                  />
                  <InputWithSuffix
                    max="59"
                    min="0"
                    onInput={e => {
                      updateDuration(playTime().h, parseInt(e.currentTarget.value) || 0)
                    }}
                    suffix={t('unit.minute')}
                    type="number"
                    value={playTime().m}
                  />
                </div>
              </FormField>
            </div>

            <hr class="my-1 border-gray-300 dark:border-gray-700" />

            {/* Plugin Section */}
            <PluginSection
              onChange={plugins => {
                setLocalGame('plugins', plugins)
              }}
              onConfigChange={(index, updated) => {
                setLocalGame('plugins', index, updated)
              }}
              plugins={localGame.plugins ?? []}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div class="mt-2 flex w-full flex-shrink-0 flex-row items-center justify-between border-t border-gray-300 py-2 dark:border-gray-700">
          <div>
            <Show when={isEditMode()}>
              <Button onClick={handleDelete} size="lg" variant="ghost-danger">
                {t('game.edit.deleteGame')}
              </Button>
            </Show>
          </div>

          <div class="flex gap-3">
            <Button onClick={props.cancel} size="lg" variant="secondary">
              {t('game.edit.cancel')}
            </Button>
            <Button
              onClick={() => {
                props.confirm(localGame)
              }}
              size="lg"
              variant="primary"
            >
              {t('game.edit.confirmSave')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
