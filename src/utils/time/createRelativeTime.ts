// src/utils/time/createRelativeTime.ts
//
// Builds a memo that re-renders a "last played" string for a single
// game card. Honors the per-user TimeDisplay settings (language override
// + relative/absolute format + custom absolute pattern) by reading them
// off the supplied `options` accessor.
import type { TimeDisplayConfig } from '@bindings/TimeDisplayConfig'
import { createMemo, createSignal, onCleanup, type Accessor } from 'solid-js'

import type { Locale } from '~/i18n'

import {
  formatAbsoluteIso,
  formatTimeAgo,
  formatTimeAgoLocale,
  type TFunc as TFunction
} from '.'

export interface TimeDisplayOptions {
  /** Time display config from settings. */
  config: Accessor<TimeDisplayConfig>
  /** Effective locale after resolving `timeDisplay.language`. */
  locale: Accessor<Locale>
}

const DEFAULT_OPTIONS: TimeDisplayOptions = {
  config: () => ({
    absoluteFormat: 'YYYY-MM-DD HH:mm',
    format: 'relative',
    language: 'auto'
  }),
  locale: () => 'en-US'
}

const DEFAULT_INTERVAL = 60_000

// A single app-lifetime heartbeat. Every "relative time" memo subscribes to
// this one tick instead of each game card spinning its own setInterval —
// otherwise a grid of N visible cards kept N timers alive simultaneously.
const sharedTick: Accessor<number> = (() => {
  const [tick, setTick] = createSignal(Date.now())
  // Intentionally never cleared: one 60s timer for the whole app window.
  setInterval(() => setTick(Date.now()), DEFAULT_INTERVAL)
  return tick
})()

/**
 * Create a memo that re-computes the relative time string on a fixed
 * interval (default 1 minute) so "2 minutes ago" eventually becomes
 * "3 minutes ago" without re-rendering the parent.
 *
 * On the default interval the memo subscribes to a process-wide shared
 * tick; a non-default `intervalMs` spins a dedicated timer instead.
 *
 * Pass `options` to honor `AppearanceConfig.timeDisplay`. When `options`
 * is omitted the function behaves exactly like the old API (uses the
 * caller's translator and the relative format), keeping call sites
 * that haven't migrated yet working unchanged.
 */
export function createRelativeTime(
  timeTarget: Accessor<null | string>,
  t: TFunction,
  intervalMs = DEFAULT_INTERVAL,
  options: TimeDisplayOptions = DEFAULT_OPTIONS
) {
  let tick: Accessor<number>
  if (intervalMs === DEFAULT_INTERVAL) {
    tick = sharedTick
  } else {
    const [localTick, setLocalTick] = createSignal(Date.now())
    const timer = setInterval(() => setLocalTick(Date.now()), intervalMs)
    onCleanup(() => {
      clearInterval(timer)
    })
    tick = localTick
  }

  const memo = createMemo(() => {
    // Subscribe to tick so the memo refreshes on the heartbeat.
    tick()
    const time = timeTarget()
    const config = options.config()

    if (config.format === 'absolute') {
      return formatAbsoluteIso(time, config.absoluteFormat)
    }

    // Relative format. `language: 'auto'` defers to the caller's
    // translator so we keep reusing the global i18n dict (and any
    // future dict updates); an explicit override goes through the
    // locale-keyed table.
    if (config.language === 'auto') {
      return formatTimeAgo(time, t)
    }
    return formatTimeAgoLocale(time, options.locale())
  })
  return memo
}

/*

Usage (legacy):

  const timeAgo = createRelativeTime(() => props.game.lastPlayedTime, t);

Usage (with options):

  const timeAgo = createRelativeTime(
    () => props.game.lastPlayedTime,
    t,
    60_000,
    {
      locale: () => resolveTimeLanguage(config.settings.appearance.timeDisplay.language, locale()),
      config: () => config.settings.appearance.timeDisplay
    }
  );

*/
