import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiInfo,
  FiX
} from 'solid-icons/fi'
import { For, Show, type JSX } from 'solid-js'
import toast, { type Toast } from 'solid-toast'

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type ToastVariant = 'default' | 'success' | 'error' | 'warning'

export interface ToastAction {
  label: string
  /**
   * 点击回调。
   * 返回 false 阻止自动关闭 Toast。
   */
  onClick?: () => void
  /** 按钮颜色风格，默认 primary */
  variant?: 'primary' | 'secondary' | 'danger'
}

export interface CustomToastOptions {
  message: string | JSX.Element
  title?: string
  actions?: ToastAction[]
  variant?: ToastVariant
  closable?: boolean
  toastOptions?: Parameters<typeof toast>[1]
}

// ----------------------------------------------------------------------
// Config & Styles
// ----------------------------------------------------------------------

const VARIANT_ICONS: Record<ToastVariant, () => JSX.Element> = {
  default: () => <FiInfo />,
  success: () => <FiCheckCircle />,
  error: () => <FiAlertCircle />,
  warning: () => <FiAlertTriangle />
}

const ICON_COLORS: Record<ToastVariant, string> = {
  default: 'text-blue-500',
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500'
}

const ACTION_STYLES = {
  primary:
    'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
  secondary:
    'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
  danger: 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300'
}

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

export const myToast = (props: CustomToastOptions) => {
  const {
    message,
    title,
    actions = [],
    variant = 'default',
    closable = false,
    toastOptions
  } = props

  toast.custom(
    t => (
      <div
        class="
          pointer-events-auto flex w-fit max-w-[90vw] items-center gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3 shadow-md transition-all
          dark:border-neutral-700 dark:bg-neutral-800
        "
      >
        {/* 1. Icon */}
        <div class={`shrink-0 text-lg ${ICON_COLORS[variant]}`}>
          {VARIANT_ICONS[variant]()}
        </div>

        {/* 2. Content (Text) */}
        <div class="flex flex-col justify-center">
          <Show when={title}>
            <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </div>
          </Show>
          <div class="text-sm text-gray-600 dark:text-gray-300">{message}</div>
        </div>

        {/* 3. Actions (Optional) */}
        <Show when={actions.length > 0}>
          {/* 分割线 */}
          <div class="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

          <div class="flex shrink-0 items-center gap-3">
            <For each={actions}>
              {action => (
                <button
                  onClick={() => {
                    action.onClick && action.onClick()
                    toast.dismiss(t.id)
                  }}
                  class={`text-sm font-medium transition-colors ${ACTION_STYLES[action.variant || 'primary']}`}
                >
                  {action.label}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* 4. Close Button (Optional) */}
        <Show when={closable}>
          <button
            onClick={() => toast.dismiss(t.id)}
            class="ml-1 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-neutral-700 dark:hover:text-gray-200 transition-colors"
          >
            <FiX />
          </button>
        </Show>
      </div>
    ),
    {
      duration: 8000,
      position: 'bottom-left',
      ...toastOptions
    }
  )
}
