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
import { cn } from '~/lib/utils'
import { For, Show, type JSX } from 'solid-js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  /** Display label (supports i18n keys resolved by caller) */
  label: string
  /** Optional icon component */
  icon?: JSX.Element
  /** Mark as danger style (red) */
  danger?: boolean
  /** Whether the item is disabled */
  disabled?: boolean
  /** Callback when selected */
  onSelect: () => void
}

export interface ContextMenuSeparator {
  type: 'separator'
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

export interface ContextMenuProps {
  /** Menu entries — render in order; separators between groups */
  items: readonly ContextMenuEntry[]
  /** The trigger content */
  children: JSX.Element
}

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry && entry.type === 'separator'
}

// ── Component ────────────────────────────────────────────────────────────────

export function ContextMenu(props: ContextMenuProps) {
  return (
    <KobalteContextMenu>
      <KobalteContextMenu.Trigger class="contents">
        {props.children}
      </KobalteContextMenu.Trigger>
      <KobalteContextMenu.Portal>
        <KobalteContextMenu.Content class="z-50 min-w-[160px] rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 shadow-md outline-none animate-in fade-in zoom-in-95 duration-100">
          <For each={props.items as ContextMenuEntry[]}>
            {item => (
              <Show
                when={isSeparator(item)}
                fallback={
                  <KobalteContextMenu.Item
                    class={cn(
                      'flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors cursor-pointer',
                      (item as ContextMenuItem).danger
                        ? 'text-red-600 dark:text-red-400 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/30'
                        : 'text-gray-700 dark:text-gray-200 data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700'
                    )}
                    onSelect={() => (item as ContextMenuItem).onSelect()}
                    disabled={(item as ContextMenuItem).disabled}
                  >
                    <Show when={(item as ContextMenuItem).icon}>
                      <span class="w-4 h-4 shrink-0 flex items-center justify-center">
                        {(item as ContextMenuItem).icon}
                      </span>
                    </Show>
                    <span>{(item as ContextMenuItem).label}</span>
                  </KobalteContextMenu.Item>
                }
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
