import { type Game } from '@bindings/Game'
import CachedImage from '@components/ui/CachedImage'
import { ContextMenu, type ContextMenuEntry } from '@components/ui/ContextMenu'
import { GameActionButton } from '@components/ui/GameActionButton'
import { displayDuration } from '@utils/time'
import { createRelativeTime } from '@utils/time/createRelativeTime'
import { AiOutlineCloudUpload, AiOutlineEdit, AiOutlineSync } from 'solid-icons/ai'
import { FaRegularCirclePlay, FaSolidGamepad } from 'solid-icons/fa'
import { FiCopy, FiFolder } from 'solid-icons/fi'
import { createMemo, Show, type JSX } from 'solid-js'

import { resolveTimeLanguage, useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { useConfig } from '~/store'

// --- 组件：游戏卡片 ---
interface GameItemProps {
  game: Game
  // 接收状态
  isBackingUp?: boolean
  isPlaying?: boolean
  onBackup: () => void
  onContextMenuAction?: (action: string) => void
  /** Receives a freshly extracted cover color (see CachedImage.extractColor). */
  onCoverColorUpdate: (color: string) => void
  onEdit: () => void
  onImageHashUpdate: (newHash: string) => void
  onStart: () => void
  onSync: () => void
}

export const GameItem = (props: GameItemProps) => {
  const { locale, t } = useI18n()
  const { config } = useConfig()
  // Resolve the timestamp locale on demand so changes in either the
  // global UI language or the per-timestamp override take effect.
  const timeLocale = createMemo(() =>
    resolveTimeLanguage(config.settings.appearance.timeDisplay.language, locale())
  )
  const timeAgo = createRelativeTime(() => props.game.lastPlayedTime, t, 60_000, {
    config: () => config.settings.appearance.timeDisplay,
    locale: timeLocale
  })

  const titleSizeClass = () => {
    const length = props.game.name.length
    if (length > 12) return 'text-sm' // 字数很多，用小号
    return 'text-base'
  }

  /** Build right-click context menu entries. Easy to extend: just push more items. */
  const contextMenuItems = (): ContextMenuEntry[] => {
    const items: ContextMenuEntry[] = [
      {
        icon: <FiCopy class="h-3.5 w-3.5" />,
        label: t('game.context.copyName'),
        onSelect: () => props.onContextMenuAction?.('copyName')
      },
      {
        icon: <FiFolder class="h-3.5 w-3.5" />,
        label: t('game.context.openDir'),
        onSelect: () => props.onContextMenuAction?.('openDir')
      }
    ]
    return items
  }

  return (
    <GameItemWrapper>
      {/* 上半部分：图片区域 */}
      <ContextMenu items={contextMenuItems()}>
        <div
          aria-label={props.game.name}
          class="group relative h-52 cursor-pointer overflow-hidden focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:outline-none"
          onClick={() => {
            if (!props.isPlaying) props.onStart()
          }}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ' ') && !props.isPlaying) {
              e.preventDefault()
              props.onStart()
            }
          }}
          role="button"
          tabIndex={0}
        >
          <CachedImage
            alt={props.game.name}
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            extractColor={!props.game.coverColor}
            hash={props.game.imageSha256}
            onColorExtracted={props.onCoverColorUpdate}
            onHashUpdate={props.onImageHashUpdate}
            url={props.game.imageUrl}
          />

          {/* 状态层：使用 Show 进行互斥显示 */}
          <Show
            fallback={
              /* 默认状态：悬浮显示开始游戏 */
              <div class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100 dark:bg-black/50">
                <FaRegularCirclePlay class="h-16 w-16 text-white drop-shadow-lg transition-transform duration-200 hover:scale-110" />
              </div>
            }
            when={props.isPlaying}
          >
            {/* 游玩中状态：常驻显示，带有呼吸效果 */}
            <div class="absolute inset-0 z-10 flex cursor-default flex-col items-center justify-center border-b-4 border-emerald-500 bg-black/60 backdrop-blur-[2px]">
              {/* 居中图标与文字 */}
              <FaSolidGamepad class="h-14 w-14 animate-pulse text-emerald-400 drop-shadow-lg" />
              <span class="mt-2 text-xs font-bold tracking-widest text-emerald-100 uppercase">
                {t('game.playing')}
              </span>

              {/* 右上角呼吸灯 (Ping Animation) */}
              <div class="absolute top-3 right-3 flex h-3 w-3">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span class="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </div>
            </div>
          </Show>
        </div>
      </ContextMenu>

      {/* 下半部分：详情与工具栏区域 */}

      <div
        class={cn(
          // overflow-clip: 禁止 focus 时浏览器 scroll-into-view 滚动容器（overflow-hidden 会被滚动导致按钮卡中间态）
          'relative flex-1 bg-white dark:bg-slate-700 group/info overflow-clip',
          // absolute 需要更多空间
          config.settings.appearance.timeDisplay.format === 'absolute' ? 'p-3' : 'p-4'
        )}
      >
        {/* 游戏信息容器 */}
        <div class="flex h-full flex-col justify-center transition-opacity duration-300 group-focus-within/info:opacity-40 group-hover/info:opacity-40">
          {/* 1. 游戏标题：动态字号 + 截断 */}
          <h2
            class={`truncate font-bold text-gray-800 transition-all dark:text-gray-200 ${titleSizeClass()}`}
            title={props.game.name}
          >
            {props.game.name}
          </h2>

          {/* 2. 信息行：左右分布 */}
          <div class="mt-1.5 flex items-center justify-between font-mono text-xs">
            {/* 左侧：上次游玩时间（min-w-0 + truncate 防止过长时换行顶掉标题） */}
            <div
              class="flex min-w-0 items-center text-gray-400 dark:text-gray-500"
              title={`${t('game.lastPlayedLabel')}${props.game.lastPlayedTime ?? t('time.never')}`}
            >
              {/* <History class="w-3 h-3 mr-1 shrink-0" /> */}
              <span class="min-w-0 truncate">{timeAgo()}</span>
            </div>

            {/* 右侧：总游玩时长（shrink-0 保持完整可见） */}
            <div
              class="shrink-0 font-medium whitespace-nowrap text-gray-500 dark:text-gray-400"
              title={t('game.totalPlayTime')}
            >
              {displayDuration(props.game.useTime)}
            </div>
          </div>
        </div>

        {/* 底部滑出工具栏 */}
        <div class="absolute inset-0 flex translate-y-full items-center justify-around border-t border-gray-100 bg-white/90 px-2 backdrop-blur-md transition-transform duration-300 ease-out group-focus-within/info:translate-y-0 group-hover/info:translate-y-0 dark:border-slate-600 dark:bg-slate-800/90">
          {/* 按钮 1: 编辑 */}
          <GameActionButton
            colorClass="text-blue-600 dark:text-blue-400"
            icon={<AiOutlineEdit class="h-6 w-6" />}
            onClick={props.onEdit}
            title={t('game.editGame')}
          />

          {/* 按钮 2: 备份 (上传) */}
          <GameActionButton
            colorClass="text-emerald-600 dark:text-emerald-400"
            icon={<AiOutlineCloudUpload class="h-6 w-6" />}
            loading={props.isBackingUp} // 传递 loading 状态
            onClick={props.onBackup}
            title={t('game.backupButtonHint')}
          />

          {/* 按钮 3: 同步状态 */}
          <GameActionButton
            colorClass="text-amber-600 dark:text-amber-400"
            icon={<AiOutlineSync class="h-6 w-6" />}
            onClick={props.onSync}
            title={t('game.openSyncModal')}
          />
        </div>
      </div>
    </GameItemWrapper>
  )
}

export const GameItemWrapper = (props: {
  children: JSX.Element
  extra_class?: string
}) => {
  return (
    <div
      class={cn(
        'relative rounded-xl overflow-clip bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl transition-shadow duration-300 w-44 h-72 flex flex-col',
        props.extra_class
      )}
    >
      {props.children}
    </div>
  )
}
