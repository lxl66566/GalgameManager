import { JSX } from 'solid-js'

/**
 * props 的类型定义。
 * @param label 标签文本
 * @param value 输入框的初值
 * @param onChange 输入变化时的回调
 * @param onExit 失去焦点时的回调（可选）
 * @param placeholder 输入框的占位符（可选）
 * @param extraClass 自定义类名（可选）
 * @param children 子元素（可选）
 */
interface InputWithLabelProps {
  label: string
  value: string
  onChange: (value: string) => void
  onExit?: (value: string) => void
  placeholder?: string
  extraClass?: string
  children?: JSX.Element
}
/**
 * 提示 label + 输入框组件。
 * @param label 标签文本
 * @param value 输入框的初值
 * @param onChange 输入变化时的回调
 * @param onExit 失去焦点时的回调（可选）
 * @param placeholder 输入框的占位符（可选）
 * @param extraClass 自定义类名（可选）
 */
const InputWithLabel = ({
  label,
  value,
  onChange,
  onExit,
  placeholder,
  extraClass,
  children
}: InputWithLabelProps) => {
  return (
    <div class={`flex flex-row items-center ${extraClass}`}>
      <span class="inline text-base font-medium">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onExit?.(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        class="inline flex-1 pl-2 py-1 pr-2 border-1 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:focus:ring-blue-400 transition-all"
      />
      {children}
    </div>
  )
}

export default InputWithLabel
