/**
 * myToast.tsx — Custom toast notification with animated SVG icons matching
 * solid-toast's default icon style exactly.
 */
import { cn } from '~/lib/utils'
import { For, Show, type JSX } from 'solid-js'
import toast, { type Toast } from 'solid-toast'

// ----------------------------------------------------------------------
// Animated SVG icon helpers (matching solid-toast's IconCircle pattern)
// ----------------------------------------------------------------------

/** Generates a cubic-bezier SVG animation attribute string. */
function genSVGCubicBezier(curve: string) {
  const [p1x, p1y, p2x, p2y] = curve.split(',').map(s => s.trim())
  return {
    calcMode: 'spline' as const,
    keyTimes: '0; 1',
    keySplines: `${p1x} ${p1y} ${p2x} ${p2y}`,
  }
}

/** Expanding filled circle — animates from r=0 to r=16. */
function MainCircle(props: { fill: string }) {
  return (
    <circle fill={props.fill} cx="16" cy="16" r="0">
      <animate
        attributeName="opacity"
        values="0; 1; 1"
        dur="0.35s"
        begin="100ms"
        fill="freeze"
        calcMode="spline"
        keyTimes="0; 0.6; 1"
        keySplines="0.25 0.71 0.4 0.88; .59 .22 .87 .63"
      />
      <animate
        attributeName="r"
        values="0; 17.5; 16"
        dur="0.35s"
        begin="100ms"
        fill="freeze"
        calcMode="spline"
        keyTimes="0; 0.6; 1"
        keySplines="0.25 0.71 0.4 0.88; .59 .22 .87 .63"
      />
    </circle>
  )
}

/** Ripple circle — expands from r=12 to r=26 while fading out. */
function SecondaryCircle(props: { fill: string; begin?: string }) {
  return (
    <circle fill={props.fill} cx="16" cy="16" r="12" opacity="0">
      <animate
        attributeName="opacity"
        values="1; 0"
        dur="1s"
        begin={props.begin ?? '320ms'}
        fill="freeze"
        calcMode="spline"
        keyTimes="0; 1"
        keySplines="0.0 0.0 0.2 1"
      />
      <animate
        attributeName="r"
        values="12; 26"
        dur="1s"
        begin={props.begin ?? '320ms'}
        fill="freeze"
        calcMode="spline"
        keyTimes="0; 1"
        keySplines="0.0 0.0 0.2 1"
      />
    </circle>
  )
}

// ----------------------------------------------------------------------
// Variant icons (matching solid-toast exactly)
// ----------------------------------------------------------------------

interface IconTheme {
  primary?: string
  secondary?: string
}

function SuccessIcon(props: IconTheme) {
  const fill = props.primary || '#34C759'
  return (
    <svg style={{ overflow: 'visible' }} viewBox="0 0 32 32" width="1.25rem" height="1.25rem">
      <MainCircle fill={fill} />
      <SecondaryCircle fill={fill} begin="350ms" />
      <path
        fill="none"
        stroke={props.secondary || '#FCFCFC'}
        stroke-width="4"
        stroke-dasharray="22"
        stroke-dashoffset="22"
        stroke-linecap="round"
        stroke-miterlimit="10"
        d="M9.8,17.2l3.8,3.6c0.1,0.1,0.3,0.1,0.4,0l9.6-9.7"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="22;0"
          dur="0.25s"
          begin="250ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </path>
    </svg>
  )
}

function ErrorIcon(props: IconTheme) {
  const fill = props.primary || '#FF3B30'
  return (
    <svg style={{ overflow: 'visible' }} viewBox="0 0 32 32" width="1.25rem" height="1.25rem">
      <MainCircle fill={fill} />
      <SecondaryCircle fill={fill} />
      <path
        fill="none"
        stroke={props.secondary || '#FFFFFF'}
        stroke-width="4"
        stroke-dasharray="9"
        stroke-dashoffset="9"
        stroke-linecap="round"
        d="M16,7l0,9"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="9;0"
          dur="0.2s"
          begin="250ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </path>
      <circle fill={props.secondary || '#FFFFFF'} cx="16" cy="23" r="2.5" opacity="0">
        <animate
          attributeName="opacity"
          values="0;1"
          dur="0.25s"
          begin="350ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </circle>
    </svg>
  )
}

function LoaderIcon(props: IconTheme) {
  return (
    <svg style={{ overflow: 'visible' }} viewBox="0 0 32 32" width="1.25rem" height="1.25rem">
      <path
        fill="none"
        stroke={props.primary || '#E5E7EB'}
        stroke-width="4"
        stroke-miterlimit="10"
        d="M16,6c3,0,5.7,1.3,7.5,3.4c1.5,1.8,2.5,4,2.5,6.6c0,5.5-4.5,10-10,10S6,21.6,6,16S10.5,6,16,6z"
      />
      <path
        fill="none"
        stroke={props.secondary || '#4b5563'}
        stroke-width="4"
        stroke-linecap="round"
        stroke-miterlimit="10"
        d="M16,6c3,0,5.7,1.3,7.5,3.4c0.6,0.7,1.1,1.4,1.5,2.2"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 16 16"
          to="360 16 16"
          dur="0.75s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}

function WarningIcon(props: IconTheme) {
  const fill = props.primary || '#F59E0B'
  return (
    <svg style={{ overflow: 'visible' }} viewBox="0 0 32 32" width="1.25rem" height="1.25rem">
      <MainCircle fill={fill} />
      <SecondaryCircle fill={fill} begin="350ms" />
      <path
        fill="none"
        stroke={props.secondary || '#FCFCFC'}
        stroke-width="4"
        stroke-dasharray="9"
        stroke-dashoffset="9"
        stroke-linecap="round"
        d="M16,7l0,9"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="9;0"
          dur="0.2s"
          begin="250ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </path>
      <circle fill={props.secondary || '#FCFCFC'} cx="16" cy="23" r="2.5" opacity="0">
        <animate
          attributeName="opacity"
          values="0;1"
          dur="0.25s"
          begin="350ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </circle>
    </svg>
  )
}

function InfoIcon(props: IconTheme) {
  const fill = props.primary || '#3B82F6'
  return (
    <svg style={{ overflow: 'visible' }} viewBox="0 0 32 32" width="1.25rem" height="1.25rem">
      <MainCircle fill={fill} />
      <SecondaryCircle fill={fill} begin="350ms" />
      <circle fill={props.secondary || '#FFFFFF'} cx="16" cy="10.5" r="2.5" opacity="0">
        <animate
          attributeName="opacity"
          values="0;1"
          dur="0.25s"
          begin="250ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </circle>
      <path
        fill="none"
        stroke={props.secondary || '#FFFFFF'}
        stroke-width="4"
        stroke-dasharray="9"
        stroke-dashoffset="9"
        stroke-linecap="round"
        d="M16,15l0,9"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="9;0"
          dur="0.2s"
          begin="300ms"
          fill="freeze"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </path>
    </svg>
  )
}

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'loading'

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
  /** Stable ID used to identify a toast for later dismissal. */
  toastId?: string
  toastOptions?: Parameters<typeof toast>[1]
}

// ----------------------------------------------------------------------
// Icon & action style maps
// ----------------------------------------------------------------------

const VARIANT_ICONS: Record<ToastVariant, (theme?: IconTheme) => JSX.Element> = {
  default: (theme) => <InfoIcon {...theme} />,
  success: (theme) => <SuccessIcon {...theme} />,
  error: (theme) => <ErrorIcon {...theme} />,
  warning: (theme) => <WarningIcon {...theme} />,
  loading: (theme) => <LoaderIcon {...theme} />
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
    toastId,
    toastOptions
  } = props

  // Loading toasts should persist until explicitly dismissed.
  const duration = variant === 'loading' ? Infinity : 8000

  toast.custom(
    t => (
      <div
        class={cn(
          'pointer-events-auto flex w-fit max-w-[90vw] items-center gap-3 rounded-md border',
          'border-neutral-200 dark:border-neutral-700',
          'bg-white dark:bg-neutral-800',
          'px-4 py-3 shadow-md transition-all'
        )}
      >
        {/* 1. Icon */}
        <div class="shrink-0 flex items-center justify-center min-w-[20px] min-h-[20px]">
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
                  class={cn(
                    'text-sm font-medium transition-colors',
                    ACTION_STYLES[action.variant || 'primary']
                  )}
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
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Show>
      </div>
    ),
    {
      duration,
      position: 'bottom-left',
      // Use the stable toast ID if provided so the backend can dismiss it later.
      ...(toastId ? { id: toastId } : {}),
      ...toastOptions
    }
  )
}
