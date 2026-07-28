import { cn } from '~/lib/utils'
import { FiAlertTriangle, FiInfo, FiX } from 'solid-icons/fi'
import { createEffect, For, Show, type JSX } from 'solid-js'
import toast from 'solid-toast'

// ----------------------------------------------------------------------
// solid-toast–style animated icons (co-located, matching the visual style
// of toast.success / toast.error / toast.loading from the solid-toast library)
// ----------------------------------------------------------------------

/** Generate a cubic-bezier spline attribute for SVG animations. */
const genSVGCubicBezier = (curve: string) => ({
  calcMode: 'spline' as const,
  keySplines: curve,
  keyTimes: '0;1'
})

export interface CustomToastOptions {
  actions?: ToastAction[]
  closable?: boolean
  message: JSX.Element | string
  title?: string
  toastId?: string
  toastOptions?: Parameters<typeof toast>[1]
  variant?: ToastVariant
}

export interface ToastAction {
  label: string
  onClick?: () => void
  variant?: 'danger' | 'primary' | 'secondary'
}

export type ToastVariant = 'default' | 'error' | 'loading' | 'success' | 'warning'

/** Animated exclamation-in-circle icon matching solid-toast's Error icon. */
function ErrorIcon() {
  const fill = '#FF3B30'
  return (
    <svg
      height="1.25rem"
      style={{ overflow: 'visible' }}
      viewBox="0 0 32 32"
      width="1.25rem"
    >
      <MainCircle fill={fill} />
      <SecondaryCircle fill={fill} />
      <path
        d="M16,7l0,9"
        fill="none"
        stroke="#FFFFFF"
        stroke-dasharray="9"
        stroke-dashoffset="9"
        stroke-linecap="round"
        stroke-width="4"
      >
        <animate
          attributeName="stroke-dashoffset"
          begin="250ms"
          dur="0.2s"
          fill="freeze"
          values="9;0"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </path>
      <circle cx="16" cy="23" fill="#FFFFFF" opacity="0" r="2.5">
        <animate
          attributeName="opacity"
          begin="350ms"
          dur="0.25s"
          fill="freeze"
          values="0;1"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </circle>
    </svg>
  )
}

/** Animated spinning loader icon matching solid-toast's Loader icon. */
function LoaderIcon() {
  return (
    <svg
      height="1.25rem"
      style={{ overflow: 'visible' }}
      viewBox="0 0 32 32"
      width="1.25rem"
    >
      <path
        d="M16,6c3,0,5.7,1.3,7.5,3.4c1.5,1.8,2.5,4,2.5,6.6c0,5.5-4.5,10-10,10S6,21.6,6,16S10.5,6,16,6z"
        fill="none"
        stroke="#E5E7EB"
        stroke-miterlimit="10"
        stroke-width="4"
      />
      <path
        d="M16,6c3,0,5.7,1.3,7.5,3.4c0.6,0.7,1.1,1.4,1.5,2.2"
        fill="none"
        stroke="#4b5563"
        stroke-linecap="round"
        stroke-miterlimit="10"
        stroke-width="4"
      >
        <animateTransform
          attributeName="transform"
          dur="0.75s"
          from="0 16 16"
          repeatCount="indefinite"
          to="360 16 16"
          type="rotate"
        />
      </path>
    </svg>
  )
}

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

function MainCircle(props: { fill: string }) {
  const anim = {
    begin: '100ms',
    calcMode: 'spline' as const,
    dur: '0.35s',
    fill: 'freeze' as const,
    keySplines: '0.25 0.71 0.4 0.88; .59 .22 .87 .63',
    keyTimes: '0; 0.6; 1'
  }
  return (
    <circle cx="16" cy="16" fill={props.fill} r="0">
      <animate attributeName="opacity" values="0; 1; 1" {...anim} />
      <animate attributeName="r" values="0; 17.5; 16" {...anim} />
    </circle>
  )
}

function SecondaryCircle(props: { begin?: string; fill: string }) {
  const anim = {
    // eslint-disable-next-line solid/reactivity -- SVG attribute values are static strings
    begin: props.begin ?? '320ms',
    dur: '1s',
    fill: 'freeze' as const,
    ...genSVGCubicBezier('0.0 0.0 0.2 1')
  }
  return (
    <circle cx="16" cy="16" fill={props.fill} opacity="0" r="12">
      <animate attributeName="opacity" values="1; 0" {...anim} />
      <animate attributeName="r" values="12; 26" {...anim} />
    </circle>
  )
}

/** Animated check-in-circle icon matching solid-toast's Success icon. */
function SuccessIcon() {
  const fill = '#34C759'
  return (
    <svg
      height="1.25rem"
      style={{ overflow: 'visible' }}
      viewBox="0 0 32 32"
      width="1.25rem"
    >
      <MainCircle fill={fill} />
      <SecondaryCircle begin="350ms" fill={fill} />
      <path
        d="M9.8,17.2l3.8,3.6c0.1,0.1,0.3,0.1,0.4,0l9.6-9.7"
        fill="none"
        stroke="#FCFCFC"
        stroke-dasharray="22"
        stroke-dashoffset="22"
        stroke-linecap="round"
        stroke-miterlimit="10"
        stroke-width="4"
      >
        <animate
          attributeName="stroke-dashoffset"
          begin="250ms"
          dur="0.25s"
          fill="freeze"
          values="22;0"
          {...genSVGCubicBezier('0.0, 0.0, 0.58, 1.0')}
        />
      </path>
    </svg>
  )
}

// ----------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------

const VARIANT_ICONS: Record<ToastVariant, () => JSX.Element> = {
  default: () => <FiInfo class="w-5 h-5" />,
  error: () => <ErrorIcon />,
  loading: () => <LoaderIcon />,
  success: () => <SuccessIcon />,
  warning: () => <FiAlertTriangle class="w-5 h-5" />
}

const ICON_COLORS: Record<ToastVariant, string> = {
  default: 'text-blue-500',
  error: 'text-red-500',
  loading: 'text-blue-500',
  success: 'text-green-500',
  warning: 'text-amber-500'
}

const ACTION_STYLES = {
  danger: 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300',
  primary:
    'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
  secondary:
    'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
}

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

export const myToast = (props: CustomToastOptions) => {
  /* eslint-disable solid/reactivity -- destructured values used inside toast closure; safe */
  const {
    actions = [],
    closable = false,
    message,
    title,
    toastId,
    toastOptions,
    variant = 'default'
  } = props
  /* eslint-enable solid/reactivity */

  const duration = variant === 'loading' ? Infinity : 8000

  toast.custom(
    t => {
      let element: HTMLDivElement | undefined

      // toast.custom 不经过 solid-toast 的 ToastBar，默认没有进出动画，
      // 这里复刻 ToastBar 的 WAAPI 动画以保证与原生 toast 一致。
      createEffect(() => {
        if (!element) return
        const position = t.position ?? 'bottom-left'
        const direction = position.includes('top') ? 1 : -1
        if (t.visible) {
          element.animate(
            [
              {
                opacity: 0.5,
                transform: `translate3d(0,${direction * -200}%,0) scale(.6)`
              },
              { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
            ],
            {
              duration: 350,
              easing: 'cubic-bezier(.21,1.02,.73,1)',
              fill: 'forwards'
            }
          )
        } else {
          element.animate(
            [
              { opacity: 1, transform: 'translate3d(0,0,-1px) scale(1)' },
              {
                opacity: 0,
                transform: `translate3d(0,${direction * -150}%,-1px) scale(.4)`
              }
            ],
            {
              duration: 400,
              easing: 'cubic-bezier(.06,.71,.55,1)',
              fill: 'forwards'
            }
          )
        }
      })

      return (
        <div
          class={cn(
            'pointer-events-auto flex max-w-[350px] items-center gap-3 rounded-md border px-2.5 py-2 shadow-lg',
            'border-gray-200 bg-white text-gray-900',
            'dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100'
          )}
          ref={element}
          style={{ 'line-height': '1.3', 'will-change': 'transform' }}
        >
          {/* 1. Icon */}
          <div class={cn('shrink-0 text-lg', ICON_COLORS[variant])}>
            {VARIANT_ICONS[variant]()}
          </div>

          {/* 2. Content */}
          <div class="flex flex-col justify-center">
            <Show when={title}>
              <div class="text-sm font-semibold">{title}</div>
            </Show>
            <div class="text-sm text-gray-600 dark:text-gray-300">{message}</div>
          </div>

          {/* 3. Actions */}
          <Show when={actions.length > 0}>
            <div class="mx-1 h-4 w-px bg-gray-200 dark:bg-slate-700" />
            {/* mr-1.5: 让最右按钮到 toast 边缘的距离 = 最左按钮到分割线的距离（gap-3 + 分割线 mx-1 = 16px） */}
            <div class="flex shrink-0 items-center gap-3 mr-1.5">
              <For each={actions}>
                {action => (
                  <button
                    class={cn(
                      'text-sm font-medium transition-colors',
                      ACTION_STYLES[action.variant || 'primary']
                    )}
                    onClick={() => {
                      action.onClick?.()
                      toast.dismiss(t.id)
                    }}
                  >
                    {action.label}
                  </button>
                )}
              </For>
            </div>
          </Show>

          {/* 4. Close */}
          <Show when={closable}>
            <button
              class="ml-1 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-200 transition-colors"
              onClick={() => {
                toast.dismiss(t.id)
              }}
            >
              <FiX />
            </button>
          </Show>
        </div>
      )
    },
    {
      duration,
      position: 'bottom-left',
      ...(toastId && { id: toastId }),
      ...toastOptions
    }
  )
}
