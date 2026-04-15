import { type ArchiveInfo } from '@bindings/ArchiveInfo'
import type { Game } from '@bindings/Game'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { formatBytes } from '@utils/file'
import { log } from '@utils/log'
import { useI18n } from '~/i18n'
import {
  TbOutlineArrowBackUp,
  TbOutlineCloudDownload,
  TbOutlineCloudUpload,
  TbOutlineEdit,
  TbOutlineFileZip,
  TbOutlineTrash,
  TbOutlineX
} from 'solid-icons/tb'
import { createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import toast from 'solid-toast'

// --- Types ---

type ArchiveStatus = 'LocalOnly' | 'RemoteOnly' | 'Synced'

interface ArchiveItem extends ArchiveInfo {
  status: ArchiveStatus
}

interface ArchiveSyncModalProps {
  gameId: number
  gameInfo: Game
  onClose: () => void
}

// --- Main Component ---

export function ArchiveSyncModal(props: ArchiveSyncModalProps) {
  const { t } = useI18n()
  const [archives, setArchives] = createSignal<ArchiveItem[]>([])
  const [loading, setLoading] = createSignal(false)

  // Rename state
  const [editingName, setEditingName] = createSignal<string | null>(null)
  const [tempName, setTempName] = createSignal('')
  const [isRenaming, setIsRenaming] = createSignal(false)

  // Load data
  const fetchData = async () => {
    setLoading(true)
    try {
      const remotePromise =
        props.gameInfo.savePaths.length === 0
          ? Promise.resolve([])
          : invoke<ArchiveInfo[]>('list_archive', {
              gameId: props.gameId
            }).catch(e => {
              console.error('Remote fetch failed:', e)
              toast.error(t('hint.failToGetSaveList') + `: ${e}`)
              return [] as ArchiveInfo[]
            })

      const localPromise = invoke<ArchiveInfo[]>('list_local_archive', {
        gameId: props.gameId
      })

      const [localList, remoteList] = await Promise.all([localPromise, remotePromise])

      log.info(`localList: ${JSON.stringify(localList)}`)
      log.info(`remoteList: ${JSON.stringify(remoteList)}`)

      const localMap = new Map(localList.map(item => [item.name, item]))
      const remoteMap = new Map(remoteList.map(item => [item.name, item]))
      const allNames = new Set([...localMap.keys(), ...remoteMap.keys()])

      const merged: ArchiveItem[] = Array.from(allNames).map(name => {
        const localItem = localMap.get(name)
        const remoteItem = remoteMap.get(name)
        const baseInfo = (localItem || remoteItem)!
        let status: ArchiveStatus = 'Synced'
        if (localItem && !remoteItem) status = 'LocalOnly'
        else if (!localItem && remoteItem) status = 'RemoteOnly'
        return { ...baseInfo, status }
      })

      merged.sort((a, b) => b.name.localeCompare(a.name))
      setArchives(merged)
    } catch (e) {
      console.error('Archive fetch failed:', e)
      toast.error(t('hint.failToGetSaveList') + e)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    fetchData()
  })

  // --- Handlers ---

  const handleUpload = async (filename: string) => {
    const toastId = toast.loading(t('hint.uploading') + filename + '...')
    let unlistenUploadError: UnlistenFn | undefined

    try {
      unlistenUploadError = await listen<String>('sync://failed', event => {
        const { payload } = event
        toast.loading(
          `${t('hint.uploading')}${filename}...\n${t('hint.retryError')}: ${payload}`,
          { id: toastId }
        )
      })

      await invoke('upload_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success(t('hint.uploadSuccess') + filename, { id: toastId })
      setArchives(prev =>
        prev.map(item => (item.name === filename ? { ...item, status: 'Synced' } : item))
      )
    } catch (e) {
      toast.error(filename + ' ' + t('hint.uploadFailed') + e, { id: toastId })
    } finally {
      if (unlistenUploadError) unlistenUploadError()
    }
  }

  const handlePull = async (filename: string) => {
    const toastId = toast.loading(t('hint.downloading') + filename + '...')
    try {
      await invoke('pull_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success(t('hint.downloadSuccess') + filename, { id: toastId })
      setArchives(prev =>
        prev.map(item => (item.name === filename ? { ...item, status: 'Synced' } : item))
      )
    } catch (e) {
      toast.error(filename + ' ' + t('hint.downloadFailed') + e, { id: toastId })
    }
  }

  const handleExtract = async (filename: string) => {
    const toastId = toast.loading(t('hint.reverting') + filename + '...')
    try {
      await invoke('extract', { gameId: props.gameId, archiveFilename: filename })
      toast.success(t('hint.revertSuccess') + filename, { id: toastId })
    } catch (e) {
      toast.error(filename + ' ' + t('hint.revertFailed') + e, { id: toastId })
    }
  }

  const handleDeleteRemote = async (filename: string) => {
    const toastId = toast.loading(t('hint.deletingRemoteArchive') + filename + '...')
    try {
      await invoke('delete_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success(t('hint.deleteSuccess') + filename, { id: toastId })
      setArchives(prev =>
        prev
          .map(item => {
            if (item.name !== filename) return item
            if (item.status === 'Synced') return { ...item, status: 'LocalOnly' }
            return null
          })
          .filter((item): item is ArchiveItem => item !== null)
      )
    } catch (e) {
      toast.error(filename + ' ' + t('hint.deleteFailed') + e, { id: toastId })
    }
  }

  const handleDeleteLocal = async (filename: string) => {
    const toastId = toast.loading(t('hint.deletingLocalArchive') + filename + '...')
    try {
      await invoke('delete_local_archive', {
        gameId: props.gameId,
        archiveFilename: filename
      })
      toast.success(t('hint.deleteSuccess') + filename, { id: toastId })
      setArchives(prev =>
        prev
          .map(item => {
            if (item.name !== filename) return item
            if (item.status === 'Synced') return { ...item, status: 'RemoteOnly' }
            return null
          })
          .filter((item): item is ArchiveItem => item !== null)
      )
    } catch (e) {
      toast.error(filename + ' ' + t('hint.deleteFailed') + e, { id: toastId })
    }
  }

  // --- Rename logic ---
  const startRename = (name: string) => {
    setEditingName(name)
    setTempName(name)
  }

  const commitRename = async (oldName: string, status: ArchiveStatus) => {
    if (isRenaming()) return
    const newName = tempName().trim()
    if (!newName || newName === oldName) {
      setEditingName(null)
      return
    }

    const isDuplicate = archives().some(
      a => a.name.toLowerCase() === newName.toLowerCase()
    )
    if (isDuplicate) {
      toast.error(t('hint.archiveExists'))
      return
    }

    setIsRenaming(true)
    const toastId = toast.loading(t('hint.renaming') + oldName + '...')

    try {
      if (status === 'LocalOnly') {
        await invoke('rename_local_archive', {
          gameId: props.gameId,
          archiveFilename: oldName,
          newArchiveFilename: newName
        })
      } else if (status === 'RemoteOnly') {
        await invoke('rename_remote_archive', {
          gameId: props.gameId,
          archiveFilename: oldName,
          newArchiveFilename: newName
        })
      } else {
        await invoke('rename_local_archive', {
          gameId: props.gameId,
          archiveFilename: oldName,
          newArchiveFilename: newName
        })
        try {
          await invoke('rename_remote_archive', {
            gameId: props.gameId,
            archiveFilename: oldName,
            newArchiveFilename: newName
          })
        } catch (remoteErr) {
          log.error(`Remote rename failed, rolling back local...: ${remoteErr}`)
          try {
            await invoke('rename_local_archive', {
              gameId: props.gameId,
              archiveFilename: newName,
              newArchiveFilename: oldName
            })
            throw new Error(`云端同步失败，已恢复本地文件名。错误: ${remoteErr}`)
          } catch (rollbackErr) {
            throw new Error(
              `严重错误：云端重命名失败且本地回滚失败。请手动检查文件。Remote: ${remoteErr}, Rollback: ${rollbackErr}`
            )
          }
        }
      }

      toast.success(t('hint.renameSuccess'), { id: toastId })
      setArchives(prev => {
        const updatedList = prev.map(item =>
          item.name === oldName ? { ...item, name: newName } : item
        )
        return updatedList.sort((a, b) => b.name.localeCompare(a.name))
      })
      setEditingName(null)
    } catch (e: any) {
      toast.error(t('hint.renameFailed') + e, { id: toastId })
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <div class="flex flex-col w-[90vw] max-w-2xl h-[80vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 transition-all">
      {/* Header */}
      <div class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">
            {t('game.sync.self')}
          </h2>
          <Badge>
            {archives().length} {t('game.sync.archiveNum')}
          </Badge>
        </div>
        <button
          onClick={props.onClose}
          class="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
        >
          <TbOutlineX class="w-5 h-5" />
        </button>
      </div>

      {/* Body List */}
      <div class="flex-1 overflow-y-auto custom-scrollbar p-2 min-h-0">
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
              {t('ui.loading')}
            </div>
          }
        >
          <Show
            when={archives().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
                <TbOutlineFileZip class="w-8 h-8 opacity-50" />
                <span class="text-sm">{t('game.sync.noArchive')}</span>
              </div>
            }
          >
            <div class="flex flex-col gap-1">
              <For each={archives()}>
                {item => (
                  <div class="group flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-all duration-200">
                    {/* Left: Status & Name */}
                    <div class="flex items-center gap-3 min-w-0 flex-1 mr-4">
                      {/* Status Dot */}
                      <div
                        class="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                        classList={{
                          'bg-green-500': item.status === 'Synced',
                          'bg-yellow-500': item.status === 'LocalOnly',
                          'bg-blue-500': item.status === 'RemoteOnly'
                        }}
                        title={t('game.sync.status')[item.status]}
                      />

                      {/* Filename / Rename Input / Meta Info */}
                      <div class="flex-1 min-w-0 flex flex-col justify-center">
                        <Show
                          when={editingName() === item.name}
                          fallback={
                            <div
                              class="flex items-center gap-2 cursor-text min-w-0"
                              onDblClick={() => startRename(item.name)}
                            >
                              <span
                                class="text-sm font-medium text-gray-700 dark:text-gray-200 truncate select-none"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                              <button
                                onClick={() => startRename(item.name)}
                                class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-opacity cursor-pointer flex-shrink-0"
                                title={t('ui.rename')}
                              >
                                <TbOutlineEdit class="w-3.5 h-3.5" />
                              </button>
                            </div>
                          }
                        >
                          <input
                            type="text"
                            class="w-full min-w-0 bg-white dark:bg-gray-900 border border-blue-500 rounded px-2 py-0.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={tempName()}
                            onInput={e => setTempName(e.currentTarget.value)}
                            onBlur={() => commitRename(item.name, item.status)}
                            onKeyDown={e =>
                              e.key === 'Enter' && commitRename(item.name, item.status)
                            }
                            onClick={e => e.stopPropagation()}
                            autofocus
                          />
                        </Show>

                        {/* Meta row */}
                        <div class="flex items-center gap-2 mt-0.5 min-w-0">
                          <span class="text-[10px] text-gray-400 dark:text-gray-500 leading-none truncate flex-shrink-1">
                            {t('game.sync.statusLong')[item.status]}
                          </span>
                          <span class="text-[10px] text-gray-300 dark:text-gray-600 leading-none select-none">
                            •
                          </span>
                          <span class="text-[11px] text-gray-400 dark:text-gray-500 leading-none font-mono whitespace-nowrap flex-shrink-0">
                            {formatBytes(item.size)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div class="grid grid-cols-[2rem_2rem_5rem] gap-1 items-center justify-items-center flex-shrink-0">
                      {/* Slot 1: Restore */}
                      <div class="w-full flex justify-center">
                        <Show when={item.status !== 'RemoteOnly'}>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="w-8 h-8 p-0 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus:ring-gray-500"
                            onClick={() => handleExtract(item.name)}
                            title={t('game.sync.recoverArchive')}
                          >
                            <TbOutlineArrowBackUp class="w-4 h-4" />
                          </Button>
                        </Show>
                      </div>

                      {/* Slot 2: Sync */}
                      <div class="w-full flex justify-center">
                        <Switch>
                          <Match when={item.status === 'LocalOnly'}>
                            <Button
                              variant="ghost"
                              size="sm"
                              class="w-8 h-8 p-0 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 focus:ring-blue-500"
                              onClick={() => handleUpload(item.name)}
                              title={t('game.sync.upload')}
                            >
                              <TbOutlineCloudUpload class="w-4 h-4" />
                            </Button>
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <Button
                              variant="ghost"
                              size="sm"
                              class="w-8 h-8 p-0 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 focus:ring-blue-500"
                              onClick={() => handlePull(item.name)}
                              title={t('game.sync.download')}
                            >
                              <TbOutlineCloudDownload class="w-4 h-4" />
                            </Button>
                          </Match>
                        </Switch>
                      </div>

                      {/* Slot 3: Delete */}
                      <div class="w-full flex justify-end">
                        <Switch>
                          <Match when={item.status === 'Synced'}>
                            <div class="flex items-center bg-gray-200 dark:bg-gray-800 rounded-md p-0.5 gap-0.5 w-full justify-between">
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-6 px-1 min-w-0 flex-1 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 focus:ring-red-500"
                                onClick={() => handleDeleteLocal(item.name)}
                                title={t('game.sync.deleteLocalArchive')}
                              >
                                <TbOutlineTrash class="w-3.5 h-3.5" />
                                <span class="text-[10px] ml-0.5 font-medium leading-none">
                                  {t('game.sync.local')}
                                </span>
                              </Button>
                              <div class="w-[1px] h-3 bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                              <Button
                                variant="ghost"
                                size="sm"
                                class="h-6 px-1 min-w-0 flex-1 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 focus:ring-red-500"
                                onClick={() => handleDeleteRemote(item.name)}
                                title={t('game.sync.deleteRemoteArchive')}
                              >
                                <TbOutlineTrash class="w-3.5 h-3.5" />
                                <span class="text-[10px] ml-0.5 font-medium leading-none">
                                  {t('game.sync.remote')}
                                </span>
                              </Button>
                            </div>
                          </Match>
                          <Match when={item.status === 'LocalOnly'}>
                            <Button
                              variant="danger"
                              size="sm"
                              class="w-8 h-8 p-0"
                              onClick={() => handleDeleteLocal(item.name)}
                              title={t('game.sync.deleteLocalArchive')}
                            >
                              <TbOutlineTrash class="w-4 h-4" />
                            </Button>
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <Button
                              variant="danger"
                              size="sm"
                              class="w-8 h-8 p-0"
                              onClick={() => handleDeleteRemote(item.name)}
                              title={t('game.sync.deleteRemoteArchive')}
                            >
                              <TbOutlineTrash class="w-4 h-4" />
                            </Button>
                          </Match>
                        </Switch>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
