// src/utils/time/createRelativeTime.ts
//
// Builds a memo that re-renders a "last played" string for a single
// game card. Honors the per-user TimeDisplay settings (language override
// + relative/absolute format + custom absolute pattern) by reading them
// off the supplied `options` accessor.
import type { TimeDisplayConfig } from '@bindings/TimeDisplayConfig'
import type { Locale } from '~/i18n'
import { createMemo, createSignal, onCleanup, type Accessor } from 'solid-js'
import { formatAbsoluteIso, formatTimeAgo, formatTimeAgoLocale, type TFunc } from '.'

export interface TimeDisplayOptions {
  /** Effective locale after resolving `timeDisplay.language`. */
  locale: Accessor<Locale>
  /** Time display config from settings. */
  config: Accessor<TimeDisplayConfig>
}

const DEFAULT_OPTIONS: TimeDisplayOptions = {
  locale: () => 'en-US',
  config: () => ({
    language: 'auto',
    format: 'relative',
    absoluteFormat: 'YYYY-MM-DD HH:mm'
  })
}

/**
 * Create a memo that re-computes the relative time string on a fixed
 * interval (default 1 minute) so "2 minutes ago" eventually becomes
 * "3 minutes ago" without re-rendering the parent.
 *
 * Pass `options` to honor `AppearanceConfig.timeDisplay`. When `options`
 * is omitted the function behaves exactly like the old API (uses the
 * caller's translator and the relative format), keeping call sites
 * that haven't migrated yet working unchanged.
 */
export function createRelativeTime(
  timeTarget: Accessor<string | null>,
  t: TFunc,
  intervalMs = 60000,
  options: TimeDisplayOptions = DEFAULT_OPTIONS
) {
  // Heartbeat that triggers recomputation every `intervalMs`.
  const [tick, setTick] = createSignal(Date.now())
  const timer = setInterval(() => setTick(Date.now()), intervalMs)
  onCleanup(() => clearInterval(timer))

  return createMemo(() => {
    // Subscribe to tick so the memo refreshes on the heartbeat.
    tick()
    const time = timeTarget()
    const cfg = options.config()

    if (cfg.format === 'absolute') {
      return formatAbsoluteIso(time, cfg.absoluteFormat)
    }

    // Relative format. `language: 'auto'` defers to the caller's
    // translator so we keep reusing the global i18n dict (and any
    // future dict updates); an explicit override goes through the
    // locale-keyed table.
    if (cfg.language === 'auto') {
      return formatTimeAgo(time, t)
    }
    return formatTimeAgoLocale(time, options.locale())
  })
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
