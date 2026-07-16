// src/pages/Statistics/StackedPlaytimeChart.tsx
// d3 stacked bar chart: x = time buckets, y = playtime, one colored segment
// per game. Solid owns the outer DOM + tooltip, d3 owns everything inside
// <svg> (data join, scales, axes, transitions).
//
// Interactions:
// - Hovering a column (including the padding around it) reports
//   `{ bucketKey, gameId }` upward and shows a tooltip; `gameId` is set when
//   the cursor is exactly on that game's segment, so the tooltip can gray out
//   the other games.
// - `focusGameId` (hovering the per-game list) re-bases that game's segments
//   onto the x axis and fades all other games to gray, without rescaling.
import { useColorMode } from '@kobalte/core'
import * as d3 from 'd3'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component
} from 'solid-js'
import { formatDuration, type BucketDatum, type DurationUnits } from './timeRange'

export interface ChartSeriesItem {
  id: number
  name: string
  color: string
}

export interface ChartHover {
  bucketKey: string
  /** Game under the cursor within the bucket; null over empty column space. */
  gameId: number | null
}

interface StackedPlaytimeChartProps {
  data: BucketDatum[]
  series: ChartSeriesItem[]
  focusGameId: number | null
  onHover: (info: ChartHover | null) => void
  /** Short unit strings (e.g. 'h' / 'm' / 's') for axis + tooltip. */
  units: DurationUnits
  locale: string
  class?: string
}

const HEIGHT = 300
const MARGIN = { top: 22, right: 8, bottom: 32, left: 40 }
const TRANSITION_MS = 280

/** One rendered bar segment. y0/y1 are cumulative seconds from the baseline. */
interface Seg {
  key: string
  gameId: number
  v: number
  y0: number
  y1: number
  isTop: boolean
}

interface TickLabel {
  key: string
  label: string
}

const StackedPlaytimeChart: Component<StackedPlaytimeChartProps> = props => {
  const { colorMode } = useColorMode()
  let wrapRef: HTMLDivElement | undefined
  let svgRef: SVGSVGElement | undefined
  const [width, setWidth] = createSignal(0)
  const [tip, setTip] = createSignal<{
    x: number
    y: number
    flip: boolean
    bucketKey: string
    gameId: number | null
  } | null>(null)

  // First render must be instant; only later updates animate.
  let renderedOnce = false
  // Dedupe onHover callbacks so moving the cursor inside one segment does not
  // re-render the whole page on every mousemove.
  let lastHoverKey: string | null = null

  onMount(() => {
    const ro = new ResizeObserver(entries => {
      setWidth(Math.max(0, Math.floor(entries[0]?.contentRect.width ?? 0)))
    })
    if (wrapRef) ro.observe(wrapRef)
    onCleanup(() => ro.disconnect())
  })

  createEffect(() => {
    render(
      props.data,
      props.series,
      props.focusGameId,
      width(),
      colorMode() === 'dark',
      props.units,
      props.locale
    )
  })

  function render(
    data: BucketDatum[],
    series: ChartSeriesItem[],
    focus: number | null,
    w: number,
    dark: boolean,
    units: DurationUnits,
    locale: string
  ) {
    if (!svgRef || w <= 0 || data.length === 0) return
    const innerW = w - MARGIN.left - MARGIN.right
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom

    const maxTotal = Math.max(1, d3.max(data, d => d.total) ?? 1)
    const useHours = maxTotal >= 3600
    const factor = useHours ? 3600 : 60
    const unitLabel = useHours ? units.hour : units.minute

    const x = d3
      .scaleBand()
      .domain(data.map(d => d.key))
      .range([0, innerW])
      .padding(0.25)
    const y = d3
      .scaleLinear()
      .domain([0, maxTotal / factor])
      .nice()
      .range([innerH, 0])

    const theme = {
      axis: dark ? '#9ca3af' : '#6b7280',
      grid: dark ? 'rgba(75,85,99,0.35)' : 'rgba(209,213,219,0.6)',
      dim: dark ? '#4b5563' : '#d1d5db'
    }
    const colorOf = new Map(series.map(s => [s.id, s.color] as const))

    const svg = d3.select(svgRef)
    svg.attr('width', w).attr('height', HEIGHT).attr('viewBox', `0 0 ${w} ${HEIGHT}`)
    let root = svg.select<SVGGElement>('g.root')
    if (root.empty()) {
      root = svg.append('g').attr('class', 'root')
      root.append('g').attr('class', 'y-axis')
      root.append('g').attr('class', 'bars')
      root.append('g').attr('class', 'x-axis')
      root.append('g').attr('class', 'overlay')
      root.append('text').attr('class', 'unit-label')
    }
    root.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const dur = renderedOnce ? TRANSITION_MS : 0

    // ── stacked segments ────────────────────────────────────────────────
    const segs: Seg[] = []
    for (const b of data) {
      let acc = 0
      let last: Seg | null = null
      for (const s of series) {
        const v = b.perGame.get(s.id) ?? 0
        if (v <= 0) continue
        const seg: Seg = {
          key: b.key,
          gameId: s.id,
          v,
          y0: acc,
          y1: acc + v,
          isTop: false
        }
        segs.push(seg)
        last = seg
        acc += v
      }
      if (last) last.isTop = true
    }

    // In focus mode the focused game is re-stacked from the baseline; the
    // others stay in place but fade out (the y scale is kept, so proportions
    // stay comparable).
    const segY = (d: Seg): number =>
      focus != null && d.gameId === focus ? y(d.v / factor) : y(d.y1 / factor)
    const segH = (d: Seg): number => Math.max(0, innerH - y(d.v / factor))
    const segFill = (d: Seg): string =>
      focus != null && d.gameId !== focus
        ? theme.dim
        : (colorOf.get(d.gameId) ?? theme.dim)
    const segOpacity = (d: Seg): number =>
      focus != null && d.gameId !== focus ? 0.25 : 1
    const segRx = (d: Seg): number =>
      focus != null ? (d.gameId === focus ? 2.5 : 1) : d.isTop ? 2.5 : 0

    root
      .select<SVGGElement>('g.bars')
      .selectAll<SVGRectElement, Seg>('rect')
      .data(segs, d => `${d.key}|${d.gameId}`)
      .join(
        enter => {
          const e = enter
            .append('rect')
            .attr('x', d => x(d.key) ?? 0)
            .attr('width', x.bandwidth())
            .attr('y', innerH)
            .attr('height', 0)
            .attr('opacity', 0)
            .attr('fill', segFill)
            .attr('rx', segRx)
          e.transition()
            .duration(dur)
            .ease(d3.easeCubicOut)
            .attr('y', segY)
            .attr('height', segH)
            .attr('opacity', segOpacity)
          return e
        },
        update => {
          update
            .transition()
            .duration(dur)
            .ease(d3.easeCubicOut)
            .attr('x', d => x(d.key) ?? 0)
            .attr('width', x.bandwidth())
            .attr('y', segY)
            .attr('height', segH)
            .attr('fill', segFill)
            .attr('opacity', segOpacity)
            .attr('rx', segRx)
          return update
        },
        exit => {
          exit
            .transition()
            .duration(dur)
            .attr('y', innerH)
            .attr('height', 0)
            .attr('opacity', 0)
            .remove()
          return exit
        }
      )

    // ── y axis + horizontal gridlines ───────────────────────────────────
    const yAxis = d3.axisLeft(y).ticks(4).tickSize(-innerW).tickPadding(6)
    const gy = root.select<SVGGElement>('g.y-axis')
    if (renderedOnce) {
      gy.transition().duration(dur).ease(d3.easeCubicOut).call(yAxis)
    } else {
      gy.call(yAxis)
    }
    gy.select('.domain').attr('stroke', 'none')
    gy.selectAll('.tick line').attr('stroke', theme.grid)
    gy.selectAll('.tick text').attr('fill', theme.axis).attr('font-size', 11)

    root
      .select<SVGTextElement>('text.unit-label')
      .attr('x', -MARGIN.left + 6)
      .attr('y', -8)
      .attr('fill', theme.axis)
      .attr('font-size', 11)
      .text(unitLabel)

    // ── x axis (custom band labels, supports two-line week labels) ──────
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' })
    const dense = data.length > 10 && data[0].unit === 'day'
    const tickLabels: TickLabel[] = data
      .filter(b => !dense || b.start.getDate() === 1 || (b.start.getDate() - 1) % 5 === 0)
      .map(b => {
        if (b.unit === 'month') return { key: b.key, label: monthFmt.format(b.start) }
        if (data.length <= 10) {
          // Week view: '7/14 Tue' / '7/14 周二'
          return {
            key: b.key,
            label: `${b.start.getMonth() + 1}/${b.start.getDate()} ${weekdayFmt.format(b.start)}`
          }
        }
        return { key: b.key, label: String(b.start.getDate()) }
      })

    const gx = root.select<SVGGElement>('g.x-axis')
    gx.selectAll<SVGLineElement, number>('line.domain')
      .data([0])
      .join('line')
      .attr('class', 'domain')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', innerH + 0.5)
      .attr('y2', innerH + 0.5)
      .attr('stroke', theme.grid)

    gx.selectAll<SVGTextElement, TickLabel>('text.tick-label')
      .data(tickLabels, d => d.key)
      .join(
        enter => {
          const e = enter
            .append('text')
            .attr('class', 'tick-label')
            .attr('text-anchor', 'middle')
            .attr('y', innerH + 15)
            .attr('x', d => (x(d.key) ?? 0) + x.bandwidth() / 2)
            .attr('opacity', 0)
          e.transition().duration(dur).attr('opacity', 1)
          return e
        },
        update => {
          update
            .transition()
            .duration(dur)
            .ease(d3.easeCubicOut)
            .attr('y', innerH + 15)
            .attr('x', d => (x(d.key) ?? 0) + x.bandwidth() / 2)
            .attr('opacity', 1)
          return update
        },
        exit => {
          exit.transition().duration(dur).attr('opacity', 0).remove()
          return exit
        }
      )
      .attr('fill', theme.axis)
      .attr('font-size', 11)
      .text(d => d.label)

    // ── hover overlay: full-height rects spanning the whole band step ───
    const padX = (x.step() - x.bandwidth()) / 2
    const overlay = root
      .select<SVGGElement>('g.overlay')
      .selectAll<SVGRectElement, BucketDatum>('rect')
      .data(data, d => d.key)

    const overlayMerged = overlay.join(
      enter =>
        enter
          .append('rect')
          .attr('fill', 'transparent')
          .attr('y', 0)
          .attr('height', innerH)
          .attr('x', d => Math.max(0, (x(d.key) ?? 0) - padX))
          .attr(
            'width',
            d =>
              Math.min(innerW, Math.max(0, (x(d.key) ?? 0) - padX) + x.step()) -
              Math.max(0, (x(d.key) ?? 0) - padX)
          ),
      update =>
        update
          .attr('height', innerH)
          .attr('x', d => Math.max(0, (x(d.key) ?? 0) - padX))
          .attr(
            'width',
            d =>
              Math.min(innerW, Math.max(0, (x(d.key) ?? 0) - padX) + x.step()) -
              Math.max(0, (x(d.key) ?? 0) - padX)
          )
    )

    const clearHover = () => {
      setTip(null)
      if (lastHoverKey !== null) {
        lastHoverKey = null
        props.onHover(null)
      }
    }

    // Clear hover only when the pointer leaves the chart or moves into the
    // margins / axis-label zone (i.e. anywhere not covered by an overlay
    // rect). Moving between columns must NOT clear — that would flicker the
    // linked per-game list.
    /* eslint-disable solid/reactivity -- these are d3 event handlers, not render-scope functions */
    svg
      .on('mousemove', (event: MouseEvent) => {
        if (event.target === svgRef) clearHover()
      })
      .on('mouseleave', clearHover)

    overlayMerged.on('mousemove', (event: MouseEvent, d) => {
      const node = root.node()
      if (!node) return
      const [, my] = d3.pointer(event, node)

      // Hit-test stacked segments top-down to know which game is hovered.
      let gameId: number | null = null
      let acc = 0
      for (const s of series) {
        const v = d.perGame.get(s.id) ?? 0
        if (v <= 0) continue
        const yTop = y((acc + v) / factor)
        const yBot = y(acc / factor)
        if (my >= yTop && my <= yBot) {
          gameId = s.id
          break
        }
        acc += v
      }

      const bandCenter = MARGIN.left + (x(d.key) ?? 0) + x.bandwidth() / 2
      setTip({
        x: bandCenter,
        y: MARGIN.top + Math.min(Math.max(my, 0), innerH),
        flip: bandCenter > innerW / 2,
        bucketKey: d.key,
        gameId
      })
      const hoverKey = `${d.key}|${gameId ?? ''}`
      if (hoverKey !== lastHoverKey) {
        lastHoverKey = hoverKey
        props.onHover({ bucketKey: d.key, gameId })
      }
    })
    /* eslint-enable solid/reactivity */

    renderedOnce = true
  }

  // ── tooltip (Solid-owned HTML, follows the cursor) ──────────────────────
  const tipData = createMemo(() => {
    const t = tip()
    if (!t) return null
    const bucket = props.data.find(b => b.key === t.bucketKey)
    if (!bucket) return null
    const rows = props.series
      .map(s => ({ ...s, secs: bucket.perGame.get(s.id) ?? 0 }))
      .filter(r => r.secs > 0)
      .sort((a, b) => b.secs - a.secs)
    return { ...t, bucket, rows }
  })

  const tipTitle = (bucket: BucketDatum): string =>
    bucket.unit === 'day'
      ? new Intl.DateTimeFormat(props.locale, {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }).format(bucket.start)
      : new Intl.DateTimeFormat(props.locale, { year: 'numeric', month: 'long' }).format(
          bucket.start
        )

  return (
    <div ref={wrapRef} class={`relative w-full ${props.class ?? ''}`}>
      <svg ref={svgRef} class="block" role="img" />
      <Show when={tipData()}>
        {td => (
          <div
            class="pointer-events-none absolute z-10 min-w-36 max-w-64 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/95"
            style={{
              left: `${td().x}px`,
              top: `${td().y}px`,
              transform: `translate(${td().flip ? 'calc(-100% - 10px)' : '10px'}, -50%)`
            }}
          >
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {tipTitle(td().bucket)}
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatDuration(td().bucket.total, props.units)}
            </div>
            <div class="mt-1 space-y-0.5">
              <For each={td().rows}>
                {r => {
                  const dimmed = () => td().gameId != null && td().gameId !== r.id
                  return (
                    <div class="flex items-center gap-1.5 text-xs leading-4">
                      <span
                        class="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ 'background-color': dimmed() ? '#9ca3af' : r.color }}
                      />
                      <span
                        class={`truncate ${
                          dimmed()
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {r.name}
                      </span>
                      <span
                        class="ml-auto pl-2 font-medium"
                        style={{ color: dimmed() ? '#9ca3af' : r.color }}
                      >
                        {formatDuration(r.secs, props.units)}
                      </span>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}

export default StackedPlaytimeChart
