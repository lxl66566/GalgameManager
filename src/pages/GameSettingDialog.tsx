import GameSettingButton from '@components/GameSettingButton'
import InputWithLabel from '@components/InputWithLabel'
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Show,
  Suspense
} from 'solid-js'
import { steamSearch } from 'src/utils/image'
import FullScreenMask from '../components/FullScreenMask'
import { Game } from '../types'

/**
 * 游戏导入的弹窗页面。（该页面全屏显示，脱离文档流）
 * @param gameInfo 游戏信息。如果是新添加的游戏，则为 undefined；如果是编辑游戏，则为该游戏的信息
 * @param confirm 确定按钮点击事件，将新的游戏信息作为参数传入
 * @param cancel 取消按钮点击事件
 */
export default ({
  gameInfo,
  confirm,
  cancel
}: {
  gameInfo?: Game
  confirm: (game: Game) => void
  cancel: () => void
}) => {
  gameInfo = gameInfo ?? {
    id: 0,
    name: '千恋万花', // TODO
    path: '',
    image_data: '',
    image_url: '',
    time: 0,
    chain: ''
  }

  // 游戏名输入框失去焦点后更新
  const [gameNameInput, setGameNameInput] = createSignal(gameInfo.name)
  const gameNameInputMemo = createMemo(() => gameNameInput())
  // 图片 URL 依赖于游戏名
  const [image_url] = createResource(gameNameInputMemo, () =>
    steamSearch(gameNameInputMemo())
  )

  createEffect(() => {
    console.log(image_url())
  })
  return (
    <>
      <FullScreenMask>
        <div class="flex flex-col items-center justify-center bg-gray-700 p-2">
          <h1 class="text-2xl font-bold mb-4">添加游戏</h1>
          <div class="flex flex-col flex-1 gap-2">
            {/* image region */}
            <div class="h-auto w-96 flex items-center justify-center overflow-y-auto">
              <Suspense fallback={<p class="flex-1 text-center">Loading...</p>}>
                <Show when={!image_url.error}>
                  <img src={image_url()} alt={gameInfo.name} />
                </Show>
                <Show when={image_url.error}>
                  <p>图片加载失败: {image_url.error.message}</p>
                </Show>
              </Suspense>
            </div>
            {/* game name */}
            <InputWithLabel
              label="游戏名："
              value={gameInfo.name}
              onChange={value => (gameInfo.name = value)}
              onExit={value => setGameNameInput(value)}
            ></InputWithLabel>
          </div>
          <div class="flex flex-row items-end justify-end">
            <GameSettingButton
              func={() => confirm(gameInfo)}
              color="dark:bg-red-400 hover:dark:bg-red-500"
              text="确定"
            />
            <GameSettingButton
              func={cancel}
              color="dark:bg-gray-400 hover:dark:bg-gray-500"
              text="取消"
            />
          </div>
        </div>
      </FullScreenMask>
    </>
  )
}
