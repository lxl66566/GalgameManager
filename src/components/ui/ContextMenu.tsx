/**
 * ContextMenu — A reusable, extensible right-click context menu built on
 * Kobalte's ContextMenu primitive.
 *
 * Usage:
 * ```tsx
 * <ContextMenu items={[
 *   { label: 'Open', icon: FiFolder, onSelect: () => ... },
 *   { type: 'separator' },
 *   { label: 'Delete', icon: FiTrash, danger: true, onSelect: () => ... },
 * ]}>
 *   <div>Right-click me</div>
 * </ContextMenu>
 * ```
 */
import { ContextMenu as KobalteContextMenu } from '@kobalte/core/context-menu'
import { For, Show, type JSX } from 'solid-js'

import { cn } from '~/lib/utils'

// ── Types ─────────

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

export interface ContextMenuItem {
  /** Mark as danger style (red) */
  danger?: boolean
  /** Whether the item is disabled */
  disabled?: boolean
  /** Optional icon component */
  icon?: JSX.Element
  /** Display label (supports i18n keys resolved by caller) */
  label: string
  /** Callback when selected */
  onSelect: () => void
}

export interface ContextMenuProps {
  /** The trigger content */
  children: JSX.Element
  /** Menu entries — render in order; separators between groups */
  items: readonly ContextMenuEntry[]
}

export interface ContextMenuSeparator {
  type: 'separator'
}

export function ContextMenu(props: ContextMenuProps) {
  return (
    <KobalteContextMenu>
      <KobalteContextMenu.Trigger class="contents">
        {props.children}
      </KobalteContextMenu.Trigger>
      <KobalteContextMenu.Portal>
        <KobalteContextMenu.Content class="animate-in fade-in zoom-in-95 z-50 min-w-[160px] rounded-md border border-gray-200 bg-white p-1 shadow-md duration-100 outline-none dark:border-gray-600 dark:bg-gray-800">
          <For each={props.items as ContextMenuEntry[]}>
            {item => (
              <Show
                fallback={
                  <KobalteContextMenu.Item
                    class={cn(
                      'flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors cursor-pointer',
                      (item as ContextMenuItem).danger
                        ? 'text-red-600 dark:text-red-400 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/30'
                        : 'text-gray-700 dark:text-gray-200 data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700'
                    )}
                    disabled={(item as ContextMenuItem).disabled}
                    onSelect={() => {
                      ;(item as ContextMenuItem).onSelect()
                    }}
                  >
                    <Show when={(item as ContextMenuItem).icon}>
                      <span class="flex h-4 w-4 shrink-0 items-center justify-center">
                        {(item as ContextMenuItem).icon}
                      </span>
                    </Show>
                    <span>{(item as ContextMenuItem).label}</span>
                  </KobalteContextMenu.Item>
                }
                when={isSeparator(item)}
              >
                <KobalteContextMenu.Separator class="my-1 h-px bg-gray-200 dark:bg-gray-600" />
              </Show>
            )}
          </For>
        </KobalteContextMenu.Content>
      </KobalteContextMenu.Portal>
    </KobalteContextMenu>
  )
}

// ── Component ─────

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry
}
