import { type ArchiveInfo } from '@bindings/ArchiveInfo'
import type { Game } from '@bindings/Game'
import { type SyncFailedPayload } from '@bindings/SyncFailedPayload'
import { myToast } from '@components/ui/myToast'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isDuplicateArchiveName } from '@utils/archiveName'
import { formatBytes } from '@utils/file'
import { errToStr, log } from '@utils/log'
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

import { useI18n } from '~/i18n'

interface ActionButtonProps {
  icon: typeof TbOutlineCloudUpload
  label?: string
  onClick: () => void
  size?: 'sm' | 'xs'
  tooltip: string
  variant: 'danger' | 'danger-ghost' | 'primary' | 'secondary'
}

interface ArchiveItem extends ArchiveInfo {
  status: ArchiveStatus
}

type ArchiveStatus = 'LocalOnly' | 'RemoteOnly' | 'Synced'

interface ArchiveSyncModalProps {
  gameId: number
  gameInfo: Game
  onClose: () => void
}

export function ArchiveSyncModal(props: ArchiveSyncModalProps) {
  const { t } = useI18n()
  const [archives, setArchives] = createSignal<ArchiveItem[]>([])
  const [loading, setLoading] = createSignal(false)

  const [editingName, setEditingName] = createSignal<null | string>(null)
  const [temporaryName, setTemporaryName] = createSignal('')
  const [isRenaming, setIsRenaming] = createSignal(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      // Remote fetch is best-effort: a failure is treated as an empty remote
      // list so the modal still shows local archives. Wrapped in an async
      // IIFE (rather than `.catch`) so the rejected promise is handled and
      // parallelism with the local fetch via Promise.all is preserved.
      const remotePromise: Promise<ArchiveInfo[]> = (async () => {
        if (props.gameInfo.savePaths.length === 0) return []
        try {
          return await invoke<ArchiveInfo[]>('list_archive', {
            gameId: props.gameId
          })
        } catch (error) {
          console.error('Remote fetch failed:', errToStr(error))
          toast.error(`${t('hint.failToGetSaveList')}: ${errToStr(error)}`)
          return []
        }
      })()

      // Local fetch failure propagates to the outer catch (unlike remote).
      const localPromise = invoke<ArchiveInfo[]>('list_local_archive', {
        gameId: props.gameId
      })

      const [localList, remoteList] = await Promise.all([localPromise, remotePromise])

      log.info(`localList: ${JSON.stringify(localList)}`)
      log.info(`remoteList: ${JSON.stringify(remoteList)}`)

      // Merge by name; base info prefers the local entry. Non-null because
      // allNames is the union of both maps.
      const localMap = new Map(localList.map(item => [item.name, item]))
      const remoteMap = new Map(remoteList.map(item => [item.name, item]))
      const allNames = new Set([...localMap.keys(), ...remoteMap.keys()])

      const merged: ArchiveItem[] = [...allNames].map(name => {
        const localItem = localMap.get(name)
        const remoteItem = remoteMap.get(name)

        const baseInfo = (localItem ?? remoteItem)!

        let status: ArchiveStatus = 'Synced'

        if (localItem && !remoteItem) {
          status = 'LocalOnly'
        } else if (!localItem && remoteItem) {
          status = 'RemoteOnly'
        }

        return { ...baseInfo, status }
      })

      merged.sort((a, b) => b.name.localeCompare(a.name))
      setArchives(merged)
    } catch (error) {
      console.error('Archive fetch failed:', error)
      toast.error(t('hint.failToGetSaveList') + errToStr(error))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    void fetchData()
  })

  const handleUpload = async (filename: string) => {
    const toastId = toast.loading(t('hint.uploading') + filename + '...')
    let unlistenUploadError: undefined | UnlistenFn
    // Capture once: reading props inside the (untracked) event callback would
    // break reactivity tracking; the game id never changes for this modal.
    const gameId = props.gameId

    try {
      unlistenUploadError = await listen<SyncFailedPayload>('sync://failed', event => {
        const { payload } = event
        // Ignore retry events of other games / global (config) sync.
        if (payload.gameId !== gameId) return
        toast.loading(
          `${t('hint.uploading')}${filename}...\n${t('hint.retryError')}: ${payload.message}`,
          {
            id: toastId
          }
        )
      })

      await invoke('upload_archive', { archiveFilename: filename, gameId: props.gameId })
      toast.success(t('hint.uploadSuccess') + filename, { id: toastId })

      setArchives(previous =>
        previous.map(item =>
          item.name === filename ? { ...item, status: 'Synced' } : item
        )
      )
    } catch (error) {
      toast.error(filename + ' ' + t('hint.uploadFailed') + errToStr(error), {
        id: toastId
      })
    } finally {
      if (unlistenUploadError) {
        unlistenUploadError()
      }
    }
  }

  const handlePull = async (filename: string) => {
    const toastId = toast.loading(t('hint.downloading') + filename + '...')
    try {
      await invoke('pull_archive', { archiveFilename: filename, gameId: props.gameId })
      toast.success(t('hint.downloadSuccess') + filename, { id: toastId })

      setArchives(previous =>
        previous.map(item =>
          item.name === filename ? { ...item, status: 'Synced' } : item
        )
      )
    } catch (error) {
      toast.error(filename + ' ' + t('hint.downloadFailed') + errToStr(error), {
        id: toastId
      })
    }
  }

  const handleExtract = async (filename: string) => {
    const toastId = toast.loading(t('hint.reverting') + filename + '...')
    try {
      await invoke('extract', { archiveFilename: filename, gameId: props.gameId })
      toast.success(t('hint.revertSuccess') + filename, { id: toastId })
    } catch (error) {
      toast.error(filename + ' ' + t('hint.revertFailed') + errToStr(error), {
        id: toastId
      })
    }
  }

  // Deletion is irreversible, so ask for confirmation first (same pattern as
  // deleting a game in GameEditModal).
  const confirmDelete = (kind: 'local' | 'remote', filename: string) => {
    const isLocal = kind === 'local'
    myToast({
      actions: [
        {
          label: t('ui.cancel'),
          onClick: () => {},
          variant: 'secondary'
        },
        {
          label: t('ui.delete'),
          onClick: () => {
            void (isLocal ? handleDeleteLocal(filename) : handleDeleteRemote(filename))
          },
          variant: 'danger'
        }
      ],
      message: isLocal
        ? t('game.sync.deleteLocalConfirm', { name: filename })
        : t('game.sync.deleteRemoteConfirm', { name: filename }),
      title: isLocal
        ? t('game.sync.deleteLocalArchive')
        : t('game.sync.deleteRemoteArchive'),
      variant: 'warning'
    })
  }

  const handleDeleteRemote = async (filename: string) => {
    const toastId = toast.loading(t('hint.deletingRemoteArchive') + filename + '...')
    try {
      await invoke('delete_archive', { archiveFilename: filename, gameId: props.gameId })
      toast.success(t('hint.deleteSuccess') + filename, { id: toastId })

      // Update local state in place instead of refetching.
      setArchives(previous =>
        previous
          .map(item => {
            if (item.name !== filename) return item
            if (item.status === 'Synced') return { ...item, status: 'LocalOnly' }
            return null
          })
          .filter((item): item is ArchiveItem => item !== null)
      )
    } catch (error) {
      toast.error(filename + ' ' + t('hint.deleteFailed') + errToStr(error), {
        id: toastId
      })
    }
  }

  const handleDeleteLocal = async (filename: string) => {
    const toastId = toast.loading(t('hint.deletingLocalArchive') + filename + '...')
    try {
      await invoke('delete_local_archive', {
        archiveFilename: filename,
        gameId: props.gameId
      })
      toast.success(t('hint.deleteSuccess') + filename, { id: toastId })

      // Update local state in place instead of refetching.
      setArchives(previous =>
        previous
          .map(item => {
            if (item.name !== filename) return item
            if (item.status === 'Synced') return { ...item, status: 'RemoteOnly' }
            return null
          })
          .filter((item): item is ArchiveItem => item !== null)
      )
    } catch (error) {
      toast.error(filename + ' ' + t('hint.deleteFailed') + errToStr(error), {
        id: toastId
      })
    }
  }
  const startRename = (name: string) => {
    setEditingName(name)
    setTemporaryName(name)
  }

  const commitRename = async (oldName: string, status: ArchiveStatus) => {
    if (isRenaming()) return

    const newName = temporaryName().trim()

    if (!newName || newName === oldName) {
      setEditingName(null)
      return
    }

    // Self is excluded so case-only renames are allowed.
    const isDuplicate = isDuplicateArchiveName(
      archives().map(a => a.name),
      oldName,
      newName
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
          archiveFilename: oldName,
          gameId: props.gameId,
          newArchiveFilename: newName
        })
      } else if (status === 'RemoteOnly') {
        await invoke('rename_remote_archive', {
          archiveFilename: oldName,
          gameId: props.gameId,
          newArchiveFilename: newName
        })
      } else {
        // Synced rename emulated atomically: local first, then remote; roll
        // back the local rename if the remote rename fails.
        await invoke('rename_local_archive', {
          archiveFilename: oldName,
          gameId: props.gameId,
          newArchiveFilename: newName
        })

        try {
          await invoke('rename_remote_archive', {
            archiveFilename: oldName,
            gameId: props.gameId,
            newArchiveFilename: newName
          })
        } catch (error) {
          log.error(`Remote rename failed, rolling back local...: ${errToStr(error)}`)
          try {
            await invoke('rename_local_archive', {
              archiveFilename: newName,
              gameId: props.gameId,
              newArchiveFilename: oldName
            })
            throw new Error(`${t('hint.renameRemoteFailedRollback')}${errToStr(error)}`, {
              cause: error
            })
          } catch (error_) {
            // Worst case: the local rollback also failed (e.g. file locked).
            throw new Error(
              `${t('hint.renameRemoteRollbackFailed')}${errToStr(error)}, Rollback: ${errToStr(error_)}`,
              { cause: error_ }
            )
          }
        }
      }

      toast.success(t('hint.renameSuccess'), { id: toastId })

      setArchives(previous => {
        const updatedList = previous.map(item =>
          item.name === oldName ? { ...item, name: newName } : item
        )
        return updatedList.toSorted((a, b) => b.name.localeCompare(a.name))
      })

      setEditingName(null)
    } catch (error) {
      toast.error(t('hint.renameFailed') + String(error), { id: toastId })
      // Keep editingName on error so the user can fix the input and retry.
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    // Fixed modal size so the layout doesn't jitter as content changes.
    <div class="flex h-[80vh] w-[90vw] max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div class="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">
            {t('game.sync.self')}
          </h2>
          <span class="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {archives().length} {t('game.sync.archiveNum')}
          </span>
        </div>
        <button
          aria-label={t('ui.close')}
          class="cursor-pointer rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => {
            props.onClose()
          }}
        >
          <TbOutlineX class="h-5 w-5" />
        </button>
      </div>

      {/* Body List */}
      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        <Show
          fallback={
            <div class="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('ui.loading')}
            </div>
          }
          when={!loading()}
        >
          <Show
            fallback={
              <div class="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
                <TbOutlineFileZip class="h-8 w-8 opacity-50" />
                <span class="text-sm">{t('game.sync.noArchive')}</span>
              </div>
            }
            when={archives().length > 0}
          >
            <div class="flex flex-col gap-1">
              <For each={archives()}>
                {item => (
                  <div class="group flex items-center justify-between rounded-lg border border-transparent p-3 transition-all duration-200 hover:border-gray-200 hover:bg-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-700/50">
                    {/* Left: Status & Name */}
                    <div class="mr-4 flex min-w-0 flex-1 items-center gap-3">
                      {/* Status Dot */}
                      <div
                        class="h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-sm"
                        classList={{
                          'bg-blue-500': item.status === 'RemoteOnly',
                          'bg-green-500': item.status === 'Synced',
                          'bg-yellow-500': item.status === 'LocalOnly'
                        }}
                        title={t('game.sync.status')[item.status]}
                      />

                      {/* Filename / Rename Input / Meta Info */}
                      <div class="flex min-w-0 flex-1 flex-col justify-center">
                        <Show
                          fallback={
                            <div
                              class="flex min-w-0 cursor-text items-center gap-2"
                              onDblClick={() => {
                                startRename(item.name)
                              }}
                            >
                              <span
                                class="truncate text-sm font-medium text-gray-700 select-none dark:text-gray-200"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                              <button
                                class="flex-shrink-0 cursor-pointer p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-500"
                                onClick={() => {
                                  startRename(item.name)
                                }}
                                title={t('ui.rename')}
                              >
                                <TbOutlineEdit class="h-3.5 w-3.5" />
                              </button>
                            </div>
                          }
                          when={editingName() === item.name}
                        >
                          <input
                            autofocus
                            class="w-full min-w-0 rounded border border-blue-500 bg-white px-2 py-0.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:bg-gray-900 dark:text-white"
                            onBlur={() => commitRename(item.name, item.status)}
                            onClick={e => {
                              e.stopPropagation()
                            }}
                            onInput={e => setTemporaryName(e.currentTarget.value)}
                            onKeyDown={e =>
                              e.key === 'Enter' && commitRename(item.name, item.status)
                            }
                            type="text"
                            value={temporaryName()}
                          />
                        </Show>

                        <div class="mt-0.5 flex min-w-0 items-center gap-2">
                          <span class="flex-shrink-1 truncate text-[10px] leading-none text-gray-400 dark:text-gray-500">
                            {t('game.sync.statusLong')[item.status]}
                          </span>

                          <span class="text-[10px] leading-none text-gray-300 select-none dark:text-gray-600">
                            •
                          </span>

                          <span class="flex-shrink-0 font-mono text-[11px] leading-none whitespace-nowrap text-gray-400 dark:text-gray-500">
                            {formatBytes(item.size)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Grid Layout for Alignment) */}
                    <div class="grid flex-shrink-0 grid-cols-[2rem_2rem_5rem] items-center justify-items-center gap-1">
                      {/* Slot 1: Restore */}
                      <div class="flex w-full justify-center">
                        <Show when={item.status !== 'RemoteOnly'}>
                          <ActionButton
                            icon={TbOutlineArrowBackUp}
                            onClick={() => handleExtract(item.name)}
                            tooltip={t('game.sync.recoverArchive')}
                            variant="secondary"
                          />
                        </Show>
                      </div>

                      {/* Slot 2: Sync */}
                      <div class="flex w-full justify-center">
                        <Switch>
                          <Match when={item.status === 'LocalOnly'}>
                            <ActionButton
                              icon={TbOutlineCloudUpload}
                              onClick={() => handleUpload(item.name)}
                              tooltip={t('game.sync.upload')}
                              variant="primary"
                            />
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <ActionButton
                              icon={TbOutlineCloudDownload}
                              onClick={() => handlePull(item.name)}
                              tooltip={t('game.sync.download')}
                              variant="primary"
                            />
                          </Match>
                        </Switch>
                      </div>

                      {/* Slot 3: Delete (Fixed width container) */}
                      <div class="flex w-full justify-end">
                        <Switch>
                          {/* Synced: Split Buttons */}
                          <Match when={item.status === 'Synced'}>
                            <div class="flex w-full items-center justify-between gap-0.5 rounded-md bg-gray-200 p-0.5 dark:bg-gray-800">
                              <ActionButton
                                icon={TbOutlineTrash}
                                label={t('game.sync.local')}
                                onClick={() => {
                                  confirmDelete('local', item.name)
                                }}
                                size="xs"
                                tooltip={t('game.sync.deleteLocalArchive')}
                                variant="danger-ghost"
                              />
                              <div class="h-3 w-[1px] flex-shrink-0 bg-gray-300 dark:bg-gray-600" />
                              <ActionButton
                                icon={TbOutlineTrash}
                                label={t('game.sync.remote')}
                                onClick={() => {
                                  confirmDelete('remote', item.name)
                                }}
                                size="xs"
                                tooltip={t('game.sync.deleteRemoteArchive')}
                                variant="danger-ghost"
                              />
                            </div>
                          </Match>

                          {/* Single side delete */}
                          <Match when={item.status === 'LocalOnly'}>
                            <ActionButton
                              icon={TbOutlineTrash}
                              onClick={() => {
                                confirmDelete('local', item.name)
                              }}
                              tooltip={t('game.sync.deleteLocalArchive')}
                              variant="danger"
                            />
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <ActionButton
                              icon={TbOutlineTrash}
                              onClick={() => {
                                confirmDelete('remote', item.name)
                              }}
                              tooltip={t('game.sync.deleteRemoteArchive')}
                              variant="danger"
                            />
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

function ActionButton(props: ActionButtonProps) {
  const baseClass =
    'flex items-center justify-center transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-gray-800 cursor-pointer'

  const variants = {
    danger:
      'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 focus:ring-red-500',
    'danger-ghost':
      'text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 focus:ring-red-500 flex-1', // flex-1 for split buttons
    primary:
      'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 focus:ring-blue-500',
    secondary:
      'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500'
  }

  const sizes = {
    sm: 'w-8 h-8',
    xs: 'h-6 px-1 min-w-0'
  }

  return (
    <button
      aria-label={props.tooltip}
      class={`${baseClass} ${variants[props.variant]} ${sizes[props.size ?? 'sm']}`}
      onClick={e => {
        e.stopPropagation()
        props.onClick()
      }}
      title={props.tooltip}
    >
      <props.icon class={props.size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      <Show when={props.label}>
        <span class="ml-0.5 text-[10px] leading-none font-medium">{props.label}</span>
      </Show>
    </button>
  )
}

// Default export so the Game page can lazy-load this modal with a plain
// string-literal dynamic import (keeps types fully static).
export default ArchiveSyncModal
