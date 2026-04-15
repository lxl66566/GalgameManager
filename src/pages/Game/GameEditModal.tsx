import { type Game } from '@bindings/Game'
import PathListEditor from '@components/PathListEditor'
import PluginSection from '@components/PluginSection'
import { Button } from '@components/ui/Button'
import CachedImage from '@components/ui/CachedImage'
import { Divider } from '@components/ui/Divider'
import { FormPathInput } from '@components/ui/form'
import { Hint } from '@components/ui/Hint'
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

/** Shared background for form inputs inside the modal. */
const INPUT_BG = 'bg-gray-100 dark:bg-gray-700'

/** Hide native number spinners so they don't overlap unit labels. */
const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

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

  const [currentVars] = createResource(() => config.devices, getDeviceVarMap)

  const bulkPathTransform = (v: string): string => {
    const vars = currentVars()
    return vars ? replaceWithVarNames(v, vars) : v
  }

  const baseGame = structuredClone(unwrap(props.gameInfo ?? DEFAULT_GAME))
  if (!isEditMode()) {
    const autoPlugins = PLUGIN_REGISTRY.filter(def => {
      const meta = config.pluginMetadatas[def.metaKey] as Record<string, unknown>
      return meta?.['autoAdd'] === true
    }).map(def => buildNewInstance(def, config.pluginMetadatas))
    baseGame.plugins = autoPlugins.length > 0 ? autoPlugins : []
  }

  const [localGame, setLocalGame] = createStore<Game>(baseGame)
  const [tempImageUrl, setTempImageUrl] = createSignal(localGame.imageUrl || '')
  const [isSearching, setIsSearching] = createSignal(false)
  const [searchId, setSearchId] = createSignal(0)
  const [playTime, setPlayTime] = createSignal(durationToForm(localGame.useTime))

  onMount(() => {
    if (!isEditMode() && localGame.name) handleSearchVnCover()
  })

  createEffect(() => setTempImageUrl(localGame.imageUrl || ''))

  const updateDuration = (h: number, m: number) => {
    setPlayTime({ h, m })
    const [origTotalSecs = 0, origNanos = 0] = localGame.useTime || [0, 0]
    const totalSecs = h * 3600 + m * 60 + (origTotalSecs % 60)
    setLocalGame('useTime', [totalSecs, origNanos])
  }

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
        { label: t('ui.cancel'), variant: 'secondary', onClick: () => {} },
        { label: t('ui.confirm'), variant: 'danger', onClick: () => props.onDelete() }
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
        } else
          myToast({
            variant: 'warning',
            title: t('game.edit.searchNotFound'),
            message: t('game.edit.searchNotFoundMsg')
          })
      }
    } catch (e) {
      if (isSearching() && searchId() === currentSearchId)
        myToast({
          variant: 'error',
          title: t('game.edit.searchFailed'),
          message: t('game.edit.searchFailedMsg')
        })
    } finally {
      if (searchId() === currentSearchId) setIsSearching(false)
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
    return warnings.filter(Boolean).length > 0 ? t('hint.pathNotExist') : undefined
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
                  onHashUpdate={(newHash: string) => setLocalGame('imageSha256', newHash)}
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
          <div class="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
            {/* Name — md size, full width */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('game.edit.gameName')}
              </label>
              <Input
                size="md"
                value={localGame.name}
                onInput={e => setLocalGame('name', e.currentTarget.value)}
                class={INPUT_BG}
              />
            </div>

            {/* Image Source — md size */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('game.edit.imageUrl')}
              </label>
              <div class="flex gap-2">
                <Input
                  size="md"
                  value={tempImageUrl()}
                  onInput={e => setTempImageUrl(e.currentTarget.value)}
                  onBlur={commitImageChange}
                  onKeyDown={e => e.key === 'Enter' && commitImageChange()}
                  placeholder={t('game.edit.imageUrlPlaceholder')}
                  disabled={isSearching()}
                  class={`flex-1 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed ${INPUT_BG}`}
                />
                <Button
                  variant={isSearching() ? 'danger' : 'primary'}
                  size="md"
                  onClick={handleSearchVnCover}
                  disabled={!localGame.name && !isSearching()}
                  class="whitespace-nowrap"
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
                </Button>
              </div>
            </div>

            {/* Executable Path — md size */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t('game.edit.exePath')}
              </label>
              <FormPathInput
                value={localGame.excutablePath || ''}
                onCommit={v => setLocalGame('excutablePath', v || null)}
                onBulkInput={bulkPathTransform}
                onBrowse={normalizedPath => {
                  if (!localGame.name)
                    setLocalGame('name', getParentPath(normalizedPath) || '')
                }}
                filters={[
                  { name: 'Executables', extensions: ['exe', 'lnk', 'bat', 'cmd'] }
                ]}
                placeholder={t('game.edit.exePathPlaceholder')}
                inputClass={`h-8 ${INPUT_BG}`}
                buttonClass={`h-8 ${INPUT_BG}`}
              />
              <Show when={exePathWarning()}>
                <Hint variant="warning">{exePathWarning()!}</Hint>
              </Show>
            </div>

            <Divider spacing="sm" />

            <PathListEditor
              label={t('game.edit.savePath')}
              paths={localGame.savePaths}
              onChange={newPaths => setLocalGame('savePaths', newPaths)}
              onBulkInput={bulkPathTransform}
            />
            <Show when={savePathWarningText()}>
              <Hint variant="warning" class="-mt-2">
                {savePathWarningText()!}
              </Hint>
            </Show>

            <Divider spacing="sm" />

            {/* Time Settings — flex for continuous sizing */}
            <div class="flex gap-4">
              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                  {t('game.edit.addedTime')}
                </label>
                <Input
                  size="md"
                  type="datetime-local"
                  value={dateToInput(localGame.addedTime)}
                  onInput={e =>
                    setLocalGame(
                      'addedTime',
                      inputToDate(e.currentTarget.value) || localGame.addedTime
                    )
                  }
                  class={INPUT_BG}
                />
              </div>
              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                  {t('game.edit.lastPlayedTime')}
                </label>
                <Input
                  size="md"
                  type="datetime-local"
                  value={dateToInput(localGame.lastPlayedTime)}
                  onInput={e =>
                    setLocalGame('lastPlayedTime', inputToDate(e.currentTarget.value))
                  }
                  class={INPUT_BG}
                />
              </div>
            </div>

            {/* Play Time — same gap-4 as above, hide spinners */}
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold text-gray-500 dark:text-gray-400">
                {t('game.edit.useTime')}
              </label>
              <div class="flex items-center gap-4">
                <div class="relative flex-1 min-w-0">
                  <Input
                    size="md"
                    type="number"
                    min="0"
                    value={playTime().h}
                    onInput={e =>
                      updateDuration(parseInt(e.currentTarget.value) || 0, playTime().m)
                    }
                    class={`${INPUT_BG} ${NO_SPINNER}`}
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
                    {t('unit.hour')}
                  </span>
                </div>
                <div class="relative flex-1 min-w-0">
                  <Input
                    size="md"
                    type="number"
                    min="0"
                    max="59"
                    value={playTime().m}
                    onInput={e =>
                      updateDuration(playTime().h, parseInt(e.currentTarget.value) || 0)
                    }
                    class={`${INPUT_BG} ${NO_SPINNER}`}
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
                    {t('unit.minute')}
                  </span>
                </div>
              </div>
            </div>

            <Divider spacing="sm" />

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
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                class="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                {t('game.edit.deleteGame')}
              </Button>
            </Show>
          </div>
          <div class="flex gap-3">
            <Button variant="ghost" size="sm" onClick={props.cancel}>
              {t('game.edit.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => props.confirm(localGame)}>
              {t('game.edit.confirmSave')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
