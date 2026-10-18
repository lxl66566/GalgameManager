// Game runtime state — app-global, not tied to any page component.
//
// Previously the "which games are running / backing up" signals and the
// session-timing Map lived inside the Game page component. Navigating away
// unmounted the page, orphaning the tauri event listeners (which captured
// that component state) and losing session timing. Lifting everything here
// keeps the state alive for the whole app lifetime and registers the global
// recovery listeners exactly once.

import type { Game } from '@bindings/Game'
import type { Translator } from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { once } from '@tauri-apps/api/event'
import { errToStr, log } from '@utils/log'
import { formatSessionDuration } from '@utils/time'
import { showOrDefer } from '@utils/toastFocus'
import { createSignal } from 'solid-js'
import toast from 'solid-toast'

import type { Dictionary } from '~/i18n'
import { useConfig } from '~/store'

type TFunction = Translator<Dictionary>

const [playingIds, setPlayingIds] = createSignal<number[]>([])
const [backingUpIds, setBackingUpIds] = createSignal<number[]>([])
// ids with an in-flight launch (from the `exec` invoke until the spawn event
// arrives) — closes the isPlaying guard's await window against double-clicks.
const [launchingIds, setLaunchingIds] = createSignal<number[]>([])

// Session start timestamps keyed by game id. Lives for the whole app, so
// navigating the sidebar no longer zeroes out in-progress timing.
const sessionStartTimes = new Map<number, number>()

let isRuntimeInitialized = false

const isPlaying = (id: number) => playingIds().includes(id)
const isLaunching = (id: number) => launchingIds().includes(id)
const isBackingUp = (id: number) => backingUpIds().includes(id)

// Idempotent add: the spawn listener and the adopt path can both mark the
// same game, and duplicate entries would never be fully removed.
const markPlaying = (id: number) =>
  setPlayingIds(previous => (previous.includes(id) ? previous : [...previous, id]))
const unmarkPlaying = (id: number) =>
  setPlayingIds(previous => previous.filter(pid => pid !== id))
const markLaunching = (id: number) =>
  setLaunchingIds(previous => (previous.includes(id) ? previous : [...previous, id]))
const unmarkLaunching = (id: number) =>
  setLaunchingIds(previous => previous.filter(lid => lid !== id))

const markBackingUp = (id: number) => setBackingUpIds(previous => [...previous, id])
const unmarkBackingUp = (id: number) =>
  setBackingUpIds(previous => previous.filter(bid => bid !== id))

interface GameExitPayload {
  session_secs: number
  success: boolean
}

/**
 * Recover the set of running games on startup and register exit watchers.
 * Safe to call multiple times — only the first call does the work.
 */
export async function initGameRuntime(t: TFunction): Promise<void> {
  if (isRuntimeInitialized) return
  isRuntimeInitialized = true

  let ids: number[]
  try {
    ids = await invoke<number[]>('running_game_ids')
  } catch (error) {
    log.error(`Failed to query running games: ${errToStr(error)}`)
    return
  }

  setPlayingIds(ids)
  for (const id of ids) {
    void once<GameExitPayload>(`game://exit/${id}`, event => {
      unmarkPlaying(id)
      if (!event.payload.success) {
        const gameName = useConfig().config.games.find(g => g.id === id)?.name ?? ''
        showOrDefer(() => toast.error(gameName + t('hint.exitAbnormally')))
      }
    })
  }
}

/**
 * Launch a game: register spawn/exit listeners, record session timing, and
 * invoke the backend `exec`. On launch failure the listeners are torn down.
 */
export async function launchGame(game: Game, t: TFunction): Promise<void> {
  // `isPlaying` only flips when the spawn event arrives (after `exec`
  // resolves), so double-clicks inside that await window used to slip two
  // `exec` invokes through; `isLaunching` guards the whole launch flow.
  if (isPlaying(game.id) || isLaunching(game.id)) return

  markLaunching(game.id)
  try {
    // Preflight: the backend may already track this game (external start, or
    // a spawn event this frontend missed). Adopt the running state silently —
    // the game is running either way, so no error toast is warranted.
    if (await invoke<boolean>('is_game_running', { gameId: game.id })) {
      markPlaying(game.id)
      void once<GameExitPayload>(`game://exit/${game.id}`, () => {
        unmarkPlaying(game.id)
      })
      return
    }

    const [unlistenSpawn, unlistenExit] = await Promise.all([
      once(`game://spawn/${game.id}`, () => {
        sessionStartTimes.set(game.id, Date.now())
        markPlaying(game.id)
        toast.success(game.name + t('hint.isRunning'))
      }),
      once<GameExitPayload>(`game://exit/${game.id}`, event => {
        unmarkPlaying(game.id)

        const secs = event.payload.session_secs
        const duration = formatSessionDuration(secs * 1000)

        if (event.payload.success) {
          showOrDefer(() =>
            toast.success(`${game.name} ${t('game.sessionDuration', { duration })}`, {
              duration: 7000
            })
          )
        } else {
          showOrDefer(() =>
            toast.error(`${game.name}${t('hint.exitAbnormally')} (${duration})`)
          )
        }
      })
    ])

    try {
      await invoke('exec', { gameId: game.id })
    } catch (error) {
      // Distinguish plugin command failures from game launch failures
      const isPluginError = typeof error === 'string' && error.includes('Plugin ')
      if (isPluginError) {
        // error is narrowed to string here
        log.error(`Plugin error for game ${game.name}: ${error}`)
        toast.error(error)
      } else {
        log.error(`Failed to start game ${game.name}: ${errToStr(error)}`)
        toast.error(game.name + t('hint.failToStart') + errToStr(error))
      }
      // If the launch instruction itself failed, clean up the listeners we just registered.
      unlistenSpawn()
      unlistenExit()
    }
  } finally {
    // Not in the success branch: the spawn event may still be in flight, but
    // a re-click in that gap is caught by the `is_game_running` preflight.
    unmarkLaunching(game.id)
  }
}

export function useGameRuntime() {
  return {
    backingUpIds,
    isBackingUp,
    isPlaying,
    launch: launchGame,
    markBackingUp,
    playingIds,
    unmarkBackingUp
  }
}
