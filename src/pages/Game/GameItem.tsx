import { type Game } from '@bindings/Game'
import CachedImage from '@components/ui/CachedImage'
import { GameActionButton } from '@components/ui/GameActionButton'
import { displayDuration } from '@utils/time'
import { AiOutlineCloudUpload, AiOutlineEdit, AiOutlineSync } from 'solid-icons/ai'
import { FaRegularCirclePlay } from 'solid-icons/fa'
import { type JSX } from 'solid-js'

// --- 组件：游戏卡片 ---
interface GameItemProps {
  game: Game
  onEdit: () => void
  onBackup: () => void
  onSync: () => void
  // 接收备份状态
  isBackingUp?: boolean
}

export const GameItem = (props: GameItemProps) => {
  return (
    <GameItemWrapper>
      {/* 上半部分：图片区域 */}
      <div class="relative group cursor-pointer h-52 overflow-hidden">
        <CachedImage
          url={props.game.imageUrl ?? ''}
          alt={props.game.name}
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* 图片悬浮遮罩：开始游戏 */}
        <div class="absolute inset-0 bg-black/30 dark:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
          <FaRegularCirclePlay class="w-16 h-16 text-white drop-shadow-lg hover:scale-110 transition-transform duration-200" />
        </div>
      </div>

      {/* 下半部分：详情与工具栏区域 */}
      {/* 使用 group/info 命名组，以便精确控制 hover 范围 */}
      <div class="relative flex-1 bg-white dark:bg-slate-700 p-4 group/info overflow-hidden">
        {/* 游戏信息文字 */}
        <div class="flex flex-col h-full justify-center transition-opacity duration-300 group-hover/info:opacity-40">
          <h2
            class="dark:text-gray-200 text-gray-800 font-bold truncate text-lg"
            title={props.game.name}
          >
            {props.game.name}
          </h2>
          <p class="dark:text-gray-400 text-gray-500 text-xs mt-1 font-mono">
            {displayDuration(props.game.useTime)}
          </p>
        </div>

        {/* 底部滑出工具栏 */}
        <div class="absolute inset-0 flex items-center justify-around px-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md translate-y-full group-hover/info:translate-y-0 transition-transform duration-300 ease-out border-t dark:border-slate-600 border-gray-100">
          {/* 按钮 1: 编辑 */}
          <GameActionButton
            title="编辑游戏"
            icon={<AiOutlineEdit class="w-6 h-6" />}
            colorClass="text-blue-600 dark:text-blue-400"
            onClick={props.onEdit}
          />

          {/* 按钮 2: 备份 (上传) */}
          <GameActionButton
            title="备份存档"
            icon={<AiOutlineCloudUpload class="w-6 h-6" />}
            colorClass="text-emerald-600 dark:text-emerald-400"
            onClick={props.onBackup}
            loading={props.isBackingUp} // 传递 loading 状态
          />

          {/* 按钮 3: 同步状态 */}
          <GameActionButton
            title="同步状态"
            icon={<AiOutlineSync class="w-6 h-6" />}
            colorClass="text-amber-600 dark:text-amber-400"
            onClick={props.onSync}
          />
        </div>
      </div>
    </GameItemWrapper>
  )
}

export const GameItemWrapper = ({
  children,
  extra_class
}: {
  children: JSX.Element
  extra_class?: string
}) => {
  return (
    <div
      class={`relative rounded-xl overflow-hidden bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl transition-shadow duration-300 w-44 h-72 flex flex-col ${extra_class}`}
    >
      {children}
    </div>
  )
}
