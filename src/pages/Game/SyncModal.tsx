import type { Game } from '@bindings/Game'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import {
  TbArrowBackUp,
  TbCloudDownload,
  TbCloudUpload,
  TbEdit,
  TbFileZip,
  TbTrash,
  TbX
} from 'solid-icons/tb'
import { createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import toast from 'solid-toast'

// --- 类型定义 ---

type ArchiveStatus = 'LocalOnly' | 'RemoteOnly' | 'Synced'

interface ArchiveItem {
  name: string
  status: ArchiveStatus
}

interface ArchiveSyncModalProps {
  gameId: number
  gameInfo: Game
  onClose: () => void
}

// --- 主组件 ---

export function ArchiveSyncModal(props: ArchiveSyncModalProps) {
  const { t } = useI18n()
  const [archives, setArchives] = createSignal<ArchiveItem[]>([])
  const [loading, setLoading] = createSignal(false)

  // 重命名状态
  const [editingName, setEditingName] = createSignal<string | null>(null)
  const [tempName, setTempName] = createSignal('')
  const [isRenaming, setIsRenaming] = createSignal(false)

  // 加载数据
  const fetchData = async () => {
    setLoading(true)
    try {
      const remotePromise =
        props.gameInfo.savePaths.length === 0
          ? Promise.resolve([])
          : invoke<string[]>('list_archive', {
              gameId: props.gameId
            }).catch(e => {
              console.error('Remote fetch failed:', e)
              toast.error(t('hint.failToGetSaveList') + `: ${e}`)
              return [] as string[] // 失败时视为远端列表为空
            })

      // 本地请求失败则直接抛出到外层 catch，因为本地都无法读取说明功能不可用
      const localPromise = invoke<string[]>('list_local_archive', {
        gameId: props.gameId
      })

      // 并行执行，remotePromise 永远不会 reject
      const [localList, remoteList] = await Promise.all([localPromise, remotePromise])

      console.log('localList:', localList)
      console.log('remoteList:', remoteList)

      const localSet = new Set(localList)
      const remoteSet = new Set(remoteList)
      const allNames = new Set([...localList, ...remoteList])

      const merged: ArchiveItem[] = Array.from(allNames).map(name => {
        let status: ArchiveStatus = 'Synced'
        if (localSet.has(name) && !remoteSet.has(name)) status = 'LocalOnly'
        else if (!localSet.has(name) && remoteSet.has(name)) status = 'RemoteOnly'
        return { name, status }
      })

      // 按名称倒序排序
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

  // --- 操作处理 ---

  const handleUpload = async (filename: string) => {
    const toastId = toast.loading(t('hint.uploading') + filename + '...')
    try {
      await invoke('upload_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success(t('hint.uploadSuccess') + filename, { id: toastId })

      // 上传成功：LocalOnly -> Synced
      setArchives(prev =>
        prev.map(item => (item.name === filename ? { ...item, status: 'Synced' } : item))
      )
    } catch (e) {
      toast.error(filename + ' ' + t('hint.uploadFailed') + e, { id: toastId })
    }
  }

  const handlePull = async (filename: string) => {
    const toastId = toast.loading(t('hint.downloading') + filename + '...')
    try {
      await invoke('pull_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success(t('hint.downloadSuccess') + filename, { id: toastId })

      // 下载成功：RemoteOnly -> Synced
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

      // 不重新 fetch，直接更新本地状态
      setArchives(prev =>
        prev
          .map(item => {
            if (item.name !== filename) return item
            // 如果原本是已同步，删除云端后变为仅本地
            if (item.status === 'Synced') return { ...item, status: 'LocalOnly' }
            // 如果原本是仅云端，则直接移除
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

      // 不重新 fetch，直接更新本地状态
      setArchives(prev =>
        prev
          .map(item => {
            if (item.name !== filename) return item
            // 如果原本是已同步，删除本地后变为仅云端
            if (item.status === 'Synced') return { ...item, status: 'RemoteOnly' }
            // 如果原本是仅本地，则直接移除
            return null
          })
          .filter((item): item is ArchiveItem => item !== null)
      )
    } catch (e) {
      toast.error(filename + ' ' + t('hint.deleteFailed') + e, { id: toastId })
    }
  }
  // --- 重命名逻辑 ---
  const startRename = (name: string) => {
    setEditingName(name)
    setTempName(name)
  }

  const commitRename = async (oldName: string, status: ArchiveStatus) => {
    // 0. 防重复提交锁：如果正在重命名中，直接忽略后续调用
    if (isRenaming()) return

    const newName = tempName().trim()

    // 1. 基础校验：名称为空或未修改
    if (!newName || newName === oldName) {
      setEditingName(null)
      return
    }

    // 2. 冲突校验：检查新名称是否已存在于列表中
    const isDuplicate = archives().some(
      a => a.name.toLowerCase() === newName.toLowerCase()
    )

    if (isDuplicate) {
      toast.error(t('hint.archiveExists'))
      return
    }

    // 开启锁
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
        // Synced: 原子性操作模拟
        // 1. 先改本地
        await invoke('rename_local_archive', {
          gameId: props.gameId,
          archiveFilename: oldName,
          newArchiveFilename: newName
        })

        // 2. 再改远程
        try {
          await invoke('rename_remote_archive', {
            gameId: props.gameId,
            archiveFilename: oldName,
            newArchiveFilename: newName
          })
        } catch (remoteErr) {
          // 3. 远程失败，回滚本地
          console.error('Remote rename failed, rolling back local...', remoteErr)
          try {
            await invoke('rename_local_archive', {
              gameId: props.gameId,
              archiveFilename: newName, // 注意：这里要把新名字改回旧名字
              newArchiveFilename: oldName
            })
            // 抛出特定错误信息给外层 catch
            throw new Error(`云端同步失败，已恢复本地文件名。错误: ${remoteErr}`)
          } catch (rollbackErr) {
            // 极端的灾难性错误：本地回滚也失败了（文件被占用等）
            throw new Error(
              `严重错误：云端重命名失败且本地回滚失败。请手动检查文件。Remote: ${remoteErr}, Rollback: ${rollbackErr}`
            )
          }
        }
      }

      // 成功处理
      toast.success(t('hint.renameSuccess'), { id: toastId })

      // 更新列表状态
      setArchives(prev => {
        const updatedList = prev.map(item =>
          item.name === oldName ? { ...item, name: newName } : item
        )
        return updatedList.sort((a, b) => b.name.localeCompare(a.name))
      })

      // 只有成功时才关闭编辑框
      setEditingName(null)
    } catch (e: any) {
      toast.error(t('hint.renameFailed') + e, { id: toastId })
      // 注意：发生错误时，不设置 setEditingName(null)，保留用户输入以便修改重试
    } finally {
      // 无论成功失败，最后释放锁
      setIsRenaming(false)
    }
  }

  return (
    // 修改 1: 固定宽度 (w-[90vw] max-w-2xl) 和高度 (h-[80vh])，防止界面随内容抖动
    <div class="flex flex-col w-[90vw] max-w-2xl h-[80vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 transition-all">
      {/* Header */}
      <div class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">
            {t('game.sync.self')}
          </h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {archives().length} {t('game.sync.archiveNum')}
          </span>
        </div>
        <button
          onClick={props.onClose}
          class="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
        >
          <TbX class="w-5 h-5" />
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
                <TbFileZip class="w-8 h-8 opacity-50" />
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

                      {/* Filename / Rename Input */}
                      <div class="flex-1 min-w-0">
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
                                <TbEdit class="w-3.5 h-3.5" />
                              </button>
                            </div>
                          }
                        >
                          {/* 修改 2: Input 增加 min-w-0 和 stopPropagation */}
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
                        <div class="text-[10px] text-gray-400 dark:text-gray-500 leading-none mt-1 truncate">
                          {t('game.sync.statusLong')[item.status]}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Grid Layout for Alignment) */}
                    <div class="grid grid-cols-[2rem_2rem_5rem] gap-1 items-center justify-items-center flex-shrink-0">
                      {/* Slot 1: Restore */}
                      <div class="w-full flex justify-center">
                        <Show when={item.status !== 'RemoteOnly'}>
                          <ActionButton
                            onClick={() => handleExtract(item.name)}
                            icon={TbArrowBackUp}
                            tooltip={t('game.sync.recoverArchive')}
                            variant="secondary"
                          />
                        </Show>
                      </div>

                      {/* Slot 2: Sync */}
                      <div class="w-full flex justify-center">
                        <Switch>
                          <Match when={item.status === 'LocalOnly'}>
                            <ActionButton
                              onClick={() => handleUpload(item.name)}
                              icon={TbCloudUpload}
                              tooltip={t('game.sync.upload')}
                              variant="primary"
                            />
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <ActionButton
                              onClick={() => handlePull(item.name)}
                              icon={TbCloudDownload}
                              tooltip={t('game.sync.download')}
                              variant="primary"
                            />
                          </Match>
                        </Switch>
                      </div>

                      {/* Slot 3: Delete (Fixed width container) */}
                      <div class="w-full flex justify-end">
                        <Switch>
                          {/* Synced: Split Buttons */}
                          <Match when={item.status === 'Synced'}>
                            <div class="flex items-center bg-gray-200 dark:bg-gray-800 rounded-md p-0.5 gap-0.5 w-full justify-between">
                              <ActionButton
                                onClick={() => handleDeleteLocal(item.name)}
                                icon={TbTrash}
                                tooltip={t('game.sync.deleteLocalArchive')}
                                variant="danger-ghost"
                                size="xs"
                                label={t('game.sync.local')}
                              />
                              <div class="w-[1px] h-3 bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>
                              <ActionButton
                                onClick={() => handleDeleteRemote(item.name)}
                                icon={TbTrash}
                                tooltip={t('game.sync.deleteRemoteArchive')}
                                variant="danger-ghost"
                                size="xs"
                                label={t('game.sync.remote')}
                              />
                            </div>
                          </Match>

                          {/* Single side delete */}
                          <Match when={item.status === 'LocalOnly'}>
                            <ActionButton
                              onClick={() => handleDeleteLocal(item.name)}
                              icon={TbTrash}
                              tooltip={t('game.sync.deleteLocalArchive')}
                              variant="danger"
                            />
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <ActionButton
                              onClick={() => handleDeleteRemote(item.name)}
                              icon={TbTrash}
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

      {/* Footer Hint */}
      {/* <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 text-center flex-shrink-0">
        双击文件名重命名
      </div> */}
    </div>
  )
}

// --- 辅助组件：按钮 ---

interface ActionButtonProps {
  onClick: () => void
  icon: typeof TbCloudUpload // 使用 solid-icons 的类型
  tooltip: string
  variant: 'primary' | 'secondary' | 'danger' | 'danger-ghost'
  size?: 'sm' | 'xs'
  label?: string
}

function ActionButton(props: ActionButtonProps) {
  const baseClass =
    'flex items-center justify-center transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-gray-800 cursor-pointer'

  const variants = {
    primary:
      'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 focus:ring-blue-500',
    secondary:
      'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500',
    danger:
      'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 focus:ring-red-500',
    'danger-ghost':
      'text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 focus:ring-red-500 flex-1' // flex-1 for split buttons
  }

  const sizes = {
    sm: 'w-8 h-8',
    xs: 'h-6 px-1 min-w-0' // 紧凑模式
  }

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        props.onClick()
      }}
      class={`${baseClass} ${variants[props.variant]} ${sizes[props.size || 'sm']}`}
      title={props.tooltip}
    >
      <props.icon class={props.size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <Show when={props.label}>
        <span class="text-[10px] ml-0.5 font-medium leading-none">{props.label}</span>
      </Show>
    </button>
  )
}
