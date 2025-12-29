import { invoke } from '@tauri-apps/api/core'
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
  onClose: () => void
}

// --- 主组件 ---

export function ArchiveSyncModal(props: ArchiveSyncModalProps) {
  const [archives, setArchives] = createSignal<ArchiveItem[]>([])
  const [loading, setLoading] = createSignal(false)

  // 重命名状态
  const [editingName, setEditingName] = createSignal<string | null>(null)
  const [tempName, setTempName] = createSignal('')

  // 加载数据
  const fetchData = async () => {
    setLoading(true)
    try {
      const [localList, remoteList] = await Promise.all([
        invoke<string[]>('list_local_archive', { gameId: props.gameId }),
        invoke<string[]>('list_archive', { gameId: props.gameId })
      ])

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
      console.error(e)
      toast.error(`获取存档列表失败: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    fetchData()
  })

  // --- 操作处理 ---

  const handleUpload = async (filename: string) => {
    const toastId = toast.loading('正在上传存档...')
    try {
      await invoke('upload_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success('上传成功', { id: toastId })

      // 上传成功：LocalOnly -> Synced
      setArchives(prev =>
        prev.map(item => (item.name === filename ? { ...item, status: 'Synced' } : item))
      )
    } catch (e) {
      toast.error(`上传失败: ${e}`, { id: toastId })
    }
  }

  const handlePull = async (filename: string) => {
    const toastId = toast.loading('正在下载存档...')
    try {
      await invoke('pull_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success('下载成功', { id: toastId })

      // 下载成功：RemoteOnly -> Synced
      setArchives(prev =>
        prev.map(item => (item.name === filename ? { ...item, status: 'Synced' } : item))
      )
    } catch (e) {
      toast.error(`下载失败: ${e}`, { id: toastId })
    }
  }

  const handleExtract = async (filename: string) => {
    const toastId = toast.loading('正在恢复存档...')
    try {
      await invoke('extract', { gameId: props.gameId, archiveFilename: filename })
      toast.success('恢复成功', { id: toastId })
    } catch (e) {
      toast.error(`恢复失败: ${e}`, { id: toastId })
    }
  }

  const handleDeleteRemote = async (filename: string) => {
    const toastId = toast.loading('正在删除云端存档...')
    try {
      await invoke('delete_archive', { gameId: props.gameId, archiveFilename: filename })
      toast.success('删除成功', { id: toastId })

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
      toast.error(`删除失败: ${e}`, { id: toastId })
    }
  }

  const handleDeleteLocal = async (filename: string) => {
    const toastId = toast.loading('正在删除本地存档...')
    try {
      await invoke('delete_local_archive', {
        gameId: props.gameId,
        archiveFilename: filename
      })
      toast.success('删除成功', { id: toastId })

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
      toast.error(`删除失败: ${e}`, { id: toastId })
    }
  }

  // --- 重命名逻辑 ---
  const startRename = (name: string) => {
    setEditingName(name)
    setTempName(name)
  }

  const commitRename = async (oldName: string, status: ArchiveStatus) => {
    const newName = tempName().trim()

    // 1. 基础校验：名称为空或未修改
    if (!newName || newName === oldName) {
      setEditingName(null)
      return
    }

    // 2. 冲突校验：检查新名称是否已存在于列表中
    if (archives().some(a => a.name === newName)) {
      toast.error('该存档名称已存在，请换一个名字')
      return
    }

    const toastId = toast.loading('正在重命名...')
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
        // Synced: 需要同时修改
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
          // 3. 如果远程失败，回滚本地
          console.error('Remote rename failed, rolling back local...', remoteErr)
          await invoke('rename_local_archive', {
            gameId: props.gameId,
            archiveFilename: newName,
            newArchiveFilename: oldName
          })
          // 抛出错误，中断后续的状态更新
          throw new Error(`云端重命名失败，已回滚本地更改: ${remoteErr}`)
        }
      }

      toast.success('重命名成功', { id: toastId })
      setEditingName(null)

      // 3. 状态更新：修改名称并重新排序
      setArchives(prev => {
        const updatedList = prev.map(item =>
          item.name === oldName ? { ...item, name: newName } : item
        )
        // 保持原本的倒序排列 (Z-A)
        return updatedList.sort((a, b) => b.name.localeCompare(a.name))
      })
    } catch (e) {
      toast.error(`${e}`, { id: toastId })
      // 发生错误时保持编辑状态，方便用户修改后重试
    }
  }

  return (
    // 修改 1: 固定宽度 (w-[90vw] max-w-2xl) 和高度 (h-[80vh])，防止界面随内容抖动
    <div class="flex flex-col w-[90vw] max-w-2xl h-[80vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 transition-all">
      {/* Header */}
      <div class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">存档管理</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {archives().length} 个存档
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
              加载中...
            </div>
          }
        >
          <Show
            when={archives().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
                <TbFileZip class="w-8 h-8 opacity-50" />
                <span class="text-sm">暂无存档记录</span>
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
                        title={
                          item.status === 'Synced'
                            ? '已同步'
                            : item.status === 'LocalOnly'
                              ? '仅本地'
                              : '仅云端'
                        }
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
                                title="重命名"
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
                          {item.status === 'Synced'
                            ? '本地 & 云端'
                            : item.status === 'LocalOnly'
                              ? '本地未上传'
                              : '云端未下载'}
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
                            tooltip="恢复此存档"
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
                              tooltip="上传到云端"
                              variant="primary"
                            />
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <ActionButton
                              onClick={() => handlePull(item.name)}
                              icon={TbCloudDownload}
                              tooltip="下载到本地"
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
                                tooltip="仅删除本地"
                                variant="danger-ghost"
                                size="xs"
                                label="本"
                              />
                              <div class="w-[1px] h-3 bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>
                              <ActionButton
                                onClick={() => handleDeleteRemote(item.name)}
                                icon={TbTrash}
                                tooltip="仅删除云端"
                                variant="danger-ghost"
                                size="xs"
                                label="云"
                              />
                            </div>
                          </Match>

                          {/* Single side delete */}
                          <Match when={item.status === 'LocalOnly'}>
                            <ActionButton
                              onClick={() => handleDeleteLocal(item.name)}
                              icon={TbTrash}
                              tooltip="删除本地存档"
                              variant="danger"
                            />
                          </Match>
                          <Match when={item.status === 'RemoteOnly'}>
                            <ActionButton
                              onClick={() => handleDeleteRemote(item.name)}
                              icon={TbTrash}
                              tooltip="删除云端存档"
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
