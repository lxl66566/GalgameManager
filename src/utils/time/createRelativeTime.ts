// src/utils/time/createRelativeTime.ts
import { createMemo, createSignal, onCleanup, type Accessor } from 'solid-js'
import { formatTimeAgo } from '.'

/**
 * 创建一个随时间自动更新的相对时间字符串
 * @param timeTarget - 目标时间的时间戳字符串 (Accessor)
 * @param intervalMs - 刷新间隔，默认为 60000ms (1分钟)
 */
export function createRelativeTime(
  timeTarget: Accessor<string | null>,
  intervalMs = 60000
) {
  // 1. 创建一个“心跳”信号
  const [tick, setTick] = createSignal(Date.now())

  // 2. 设置定时器驱动心跳
  const timer = setInterval(() => {
    setTick(Date.now())
  }, intervalMs)

  // 3. 组件销毁时清理定时器
  onCleanup(() => clearInterval(timer))

  // 4. 返回 Memo，它同时依赖 目标时间 和 心跳
  return createMemo(() => {
    const time = timeTarget()
    // 订阅 tick 变化，强制触发重新计算
    tick()
    return formatTimeAgo(time)
  })
}

/*

使用方法：
const timeAgo = createRelativeTime(() => props.game.lastPlayedTime);
timeAgo() 即可获取相对时间字符串

*/
