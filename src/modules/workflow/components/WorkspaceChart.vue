<script setup lang="ts">
/**
 * WorkspaceChart — 12 种工作台图表的最小真实渲染器（SVG，无外部图表库）。
 *
 * 输入是服务端聚合结果或散点行数据；图型只决定几何与语义，不改变数据。
 * 颜色、图例、标签、网格、堆叠、双轴均来自卡片样式配置。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WorkspaceAggregateGroup } from '../api/workspace-analytics'
import {
  defaultChartStyle,
  formatChartValue,
  paletteColors,
  seriesColor,
  type WorkspaceAxisScale,
  type WorkspaceChartStyle,
  type WorkspaceChartType,
  type WorkspaceMetricConfig,
} from '../utils/workspace-data'

interface Point {
  x: number
  y: number
}

const props = withDefaults(
  defineProps<{
    chartType: WorkspaceChartType
    groups?: WorkspaceAggregateGroup[]
    metrics?: WorkspaceMetricConfig[]
    style?: WorkspaceChartStyle
    points?: Point[]
    target?: number
    axisScale?: WorkspaceAxisScale
    xLabel?: string
    yLabel?: string
    loading?: boolean
  }>(),
  {
    groups: () => [],
    metrics: () => [],
    style: () => defaultChartStyle(),
    points: () => [],
    target: 100,
    axisScale: () => ({}),
    xLabel: '',
    yLabel: '',
    loading: false,
  },
)

const series = computed(() =>
  props.metrics.map((metric, index) => {
    const name = metric.label || metric.field || '记录数'
    const key = metric.field || `metric-${index}`
    return {
      metric,
      name,
      legendName: metric.unit ? `${name} (${metric.unit})` : name,
      unit: metric.unit,
      axis: metric.axis,
      presentation: metric.presentation,
      color:
        props.style?.seriesColors?.[key] || metric.color || seriesColor(props.style, index, key),
    }
  }),
)

const showRightAxis = computed(
  () =>
    ['bar', 'hbar', 'line', 'area', 'combo'].includes(props.chartType) &&
    series.value.some((item) => item.axis === 'right'),
)

/** 散点当前是单组 X/Y 点位，统一用一种系列色而不是按点轮换。 */
const scatterColor = computed(() => series.value[0]?.color || colors.value[0])

/** 画布单位与容器像素 1:1（测量后收敛），避免缩放导致刻度/分类文字变小。 */
const W = ref(640)
const H = ref(250)
const PAD = { left: 46, right: 18, top: 14, bottom: 34 }
/** 热力图 Y 维度名较长时为其留出完整文字宽度。 */
const plotPadLeft = computed(() => {
  if (props.chartType !== 'heatmap') return PAD.left
  const longest = Math.max(0, ...props.groups.map((group) => String(group.key2 ?? '未分类').length))
  return Math.min(140, Math.max(PAD.left, longest * 12 + 14))
})
/** 右轴存在时为其刻度留出空间。 */
const plotPadRight = computed(() => (showRightAxis.value ? 44 : PAD.right))
const PLOT_W = computed(() => W.value - plotPadLeft.value - plotPadRight.value)
const PLOT_H = computed(() => H.value - PAD.top - PAD.bottom)
const plotRef = ref<globalThis.HTMLElement | null>(null)
let resizeObserver: globalThis.ResizeObserver | null = null

function measurePlot(): void {
  const el = plotRef.value
  if (!el) return
  const width = Math.max(240, Math.round(el.clientWidth))
  const height = Math.max(120, Math.round(el.clientHeight))
  if (width !== W.value) W.value = width
  if (height !== H.value) H.value = height
}

onMounted(() => {
  measurePlot()
  if (typeof globalThis.ResizeObserver === 'function' && plotRef.value) {
    resizeObserver = new globalThis.ResizeObserver(measurePlot)
    resizeObserver.observe(plotRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const colors = computed(() => paletteColors(props.style))

const categories = computed(() =>
  props.groups.map((group) =>
    group.key == null || group.key === '' ? '未分类' : String(group.key),
  ),
)

const valuesBySeries = computed(() =>
  series.value.map((_, index) =>
    props.groups.map((group) => {
      const value = group.values[index]
      const numeric = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(numeric) ? numeric : 0
    }),
  ),
)

function maxOf(axis: 'left' | 'right'): number {
  const values = valuesBySeries.value
    .map((row, index) => ({ row, axis: series.value[index]?.axis ?? 'left' }))
    .filter((item) => item.axis === axis)
    .flatMap((item) => item.row)
  const max = Math.max(1, ...values)
  return max * 1.15
}

function configuredMax(axis: 'left' | 'right'): number | null {
  const value = props.axisScale?.[axis]
  return typeof value === 'number' && value > 0 ? value : null
}

const maxLeft = computed(() => configuredMax('left') ?? maxOf('left'))
const maxRight = computed(() => configuredMax('right') ?? maxOf('right'))

function maxFor(axis: 'left' | 'right'): number {
  return axis === 'right' ? maxRight.value : maxLeft.value
}

function plotX(index: number): number {
  const count = Math.max(1, categories.value.length)
  return PAD.left + (PLOT_W.value / count) * (index + 0.5)
}

function plotYCategory(index: number): number {
  const count = Math.max(1, categories.value.length)
  return PAD.top + (PLOT_H.value / count) * (index + 0.5)
}

function plotY(value: number, axis: 'left' | 'right'): number {
  const max = axis === 'right' ? maxRight.value : maxLeft.value
  const top = PAD.top + PLOT_H.value - (Math.max(0, value) / max) * PLOT_H.value
  // 固定轴上限小于真实值时不让几何溢出绘图区。
  return Math.max(PAD.top, Math.min(PAD.top + PLOT_H.value, top))
}

const groupWidth = computed(() => PLOT_W.value / Math.max(1, categories.value.length))
const barWidth = computed(() =>
  Math.max(3, (groupWidth.value * 0.62) / Math.max(1, series.value.length)),
)

const gridLines = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: PAD.top + PLOT_H.value * ratio,
    value: Math.round(maxLeft.value * (1 - ratio)),
  })),
)

const rightGridLines = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: PAD.top + PLOT_H.value * ratio,
    value: Math.round(maxRight.value * (1 - ratio)),
  })),
)

const linePoints = computed(() =>
  series.value.map((item, seriesIndex) => {
    const values = valuesBySeries.value[seriesIndex] ?? []
    return values.map((value, index) => `${plotX(index)},${plotY(value, item.axis)}`).join(' ')
  }),
)

const areaPaths = computed(() =>
  series.value.map((item, seriesIndex) => {
    const values = valuesBySeries.value[seriesIndex] ?? []
    if (!values.length) return ''
    const top = values
      .map((value, index) => `${plotX(index)},${plotY(value, item.axis)}`)
      .join(' L ')
    const lastX = plotX(values.length - 1)
    const firstX = plotX(0)
    return `M ${firstX},${PAD.top + PLOT_H.value} L ${top} L ${lastX},${PAD.top + PLOT_H.value} Z`
  }),
)

// ─── 饼图 / 环形图 ───
interface PieSlice {
  path: string
  color: string
  label: string
  value: number
  percent: number
  full: boolean
  cx: number
  cy: number
  radius: number
  inner: number
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos((angle - 90) * (Math.PI / 180)),
    y: cy + radius * Math.sin((angle - 90) * (Math.PI / 180)),
  }
}

const pies = computed(() => {
  const count = Math.max(1, series.value.length)
  const pieW = PLOT_W.value / count
  const radius = Math.min(96, pieW * 0.32, PLOT_H.value * 0.42)
  const cy = PAD.top + PLOT_H.value / 2
  return series.value.map((item, seriesIndex) => {
    const values = valuesBySeries.value[seriesIndex] ?? []
    const total = values.reduce((sum, value) => sum + value, 0) || 1
    let angle = 0
    const slices: PieSlice[] = values.map((value, index) => {
      const sweep = (value / total) * 360
      const start = angle
      const end = angle + Math.max(sweep, value > 0 ? 0.6 : 0)
      angle = end
      const color =
        props.style?.seriesColors?.[categories.value[index]] ??
        colors.value[index % colors.value.length]
      const large = end - start <= 180 ? 0 : 1
      const from = polar(PAD.left + pieW * (seriesIndex + 0.5), cy, radius, end)
      const to = polar(PAD.left + pieW * (seriesIndex + 0.5), cy, radius, start)
      const inner = props.chartType === 'donut' ? radius * 0.58 : 0
      let path: string
      if (inner > 0) {
        const innerFrom = polar(PAD.left + pieW * (seriesIndex + 0.5), cy, inner, end)
        const innerTo = polar(PAD.left + pieW * (seriesIndex + 0.5), cy, inner, start)
        path = `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 0 ${to.x} ${to.y} L ${innerTo.x} ${innerTo.y} A ${inner} ${inner} 0 ${large} 1 ${innerFrom.x} ${innerFrom.y} Z`
      } else {
        path = `M ${PAD.left + pieW * (seriesIndex + 0.5)} ${cy} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 0 ${to.x} ${to.y} Z`
      }
      return {
        path,
        color,
        label: categories.value[index] ?? '',
        value,
        percent: (value / total) * 100,
        full: values.length === 1 || end - start >= 359.9,
        cx: PAD.left + pieW * (seriesIndex + 0.5),
        cy,
        radius,
        inner,
      }
    })
    return {
      item,
      cx: PAD.left + pieW * (seriesIndex + 0.5),
      cy,
      radius,
      slices,
      total: values.reduce((sum, value) => sum + value, 0),
    }
  })
})

// ─── 散点图 ───
const scatterBounds = computed(() => {
  const xs = props.points.map((point) => point.x)
  const ys = props.points.map((point) => point.y)
  const maxX = Math.max(1, ...xs) * 1.1
  const maxY = Math.max(1, ...ys) * 1.1
  return { maxX, maxY }
})

function scatterX(value: number) {
  return PAD.left + (value / scatterBounds.value.maxX) * PLOT_W.value
}
function scatterY(value: number) {
  return PAD.top + PLOT_H.value - (value / scatterBounds.value.maxY) * PLOT_H.value
}

// ─── 雷达图 ───
const radarAxes = computed(() => categories.value.slice(0, 6))
const radarMax = computed(() => {
  const values = valuesBySeries.value.flat().slice(0, radarAxes.value.length * series.value.length)
  return Math.max(1, ...values) * 1.15
})
const radarCenter = computed(() => ({
  x: W.value / 2,
  y: PAD.top + PLOT_H.value / 2 + 4,
}))
const radarRadius = computed(() => Math.max(24, Math.min(PLOT_H.value / 2 - 6, 120)))
function radarPoint(index: number, ratio: number) {
  const angle = (360 / Math.max(3, radarAxes.value.length)) * index
  const point = polar(radarCenter.value.x, radarCenter.value.y, radarRadius.value * ratio, angle)
  return `${point.x},${point.y}`
}
const radarGrid = computed(() =>
  [0.25, 0.5, 0.75, 1].map((ratio) =>
    radarAxes.value.map((_, index) => radarPoint(index, ratio)).join(' '),
  ),
)
const radarSeries = computed(() =>
  series.value.map((item, seriesIndex) => {
    const values = valuesBySeries.value[seriesIndex] ?? []
    return {
      ...item,
      points: radarAxes.value
        .map((_, index) => radarPoint(index, Math.max(0, values[index] ?? 0) / radarMax.value))
        .join(' '),
    }
  }),
)

// ─── 漏斗图 ───
const funnelRows = computed(() => {
  const values = valuesBySeries.value[0] ?? []
  const max = Math.max(1, ...values)
  const rows = categories.value.map((label, index) => ({
    label,
    value: values[index] ?? 0,
    ratio: (values[index] ?? 0) / max,
  }))
  return rows.sort((left, right) => right.value - left.value)
})

// ─── 仪表盘 ───
const gaugeValue = computed(() => valuesBySeries.value[0]?.[0] ?? 0)
const gaugeMax = computed(() => Math.max(1, props.target || 1, gaugeValue.value) * 1.1)
const gaugeRatio = computed(() => Math.min(1, gaugeValue.value / gaugeMax.value))
const gaugeTargetRatio = computed(() => Math.min(1, (props.target || 0) / gaugeMax.value))
const gaugeCenter = computed(() => ({
  x: W.value / 2,
  y: PAD.top + PLOT_H.value - 10,
}))
const gaugeRadius = computed(() => Math.max(32, Math.min(PLOT_H.value * 0.46, 120)))
const gaugeStart = -120
const gaugeEnd = 120
function gaugePoint(ratio: number, radius = gaugeRadius.value) {
  const angle = gaugeStart + (gaugeEnd - gaugeStart) * ratio
  return polar(gaugeCenter.value.x, gaugeCenter.value.y, radius, angle)
}
function gaugeArc(ratio: number) {
  const from = gaugePoint(ratio)
  const startPoint = gaugePoint(0)
  const large = ratio > 0.5 ? 1 : 0
  return `M ${startPoint.x} ${startPoint.y} A ${gaugeRadius.value} ${gaugeRadius.value} 0 ${large} 1 ${from.x} ${from.y}`
}

// ─── 热力图 ───
const heatmapModel = computed(() => {
  const first = props.groups.map((group) => String(group.key ?? '未分类'))
  const second = props.groups.map((group) => String(group.key2 ?? '未分类'))
  const xs = [...new Set(first)]
  const ys = [...new Set(second)]
  const values = props.groups.map((group) => {
    const raw = group.values[0]
    const numeric = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(numeric) ? numeric : 0
  })
  const max = Math.max(1, ...values)
  const byKey = new Map<string, number>()
  props.groups.forEach((group, index) => {
    byKey.set(
      `${String(group.key ?? '未分类')}\u0000${String(group.key2 ?? '未分类')}`,
      values[index] ?? 0,
    )
  })
  return { xs, ys, values, max, byKey }
})

function heatValue(row: string, column: string): number {
  return heatmapModel.value.byKey.get(`${column}\u0000${row}`) ?? 0
}
const heatCellW = computed(() => PLOT_W.value / Math.max(1, heatmapModel.value.xs.length))
const heatCellH = computed(() => PLOT_H.value / Math.max(1, heatmapModel.value.ys.length))

function heatColor(value: number): string {
  const [from, to] = props.style?.gradient ?? ['#dbeafe', '#7c3aed']
  const ratio = Math.min(1, value / heatmapModel.value.max)
  return mixHex(from, to, ratio)
}

function mixHex(from: string, to: string, ratio: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '')
    const full =
      clean.length === 3
        ? clean
            .split('')
            .map((c) => c + c)
            .join('')
        : clean
    return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16))
  }
  const left = parse(from)
  const right = parse(to)
  const mixed = left.map((value, index) => Math.round(value + (right[index] - value) * ratio))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

const isCartesian = computed(() =>
  ['bar', 'hbar', 'line', 'area', 'combo'].includes(props.chartType),
)
const isPie = computed(() => props.chartType === 'pie' || props.chartType === 'donut')
const isEmpty = computed(() => {
  if (props.chartType === 'scatter') return props.points.length === 0
  if (props.chartType === 'gauge') return false
  return props.groups.length === 0
})

function shortLabel(value: string, max = 8): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}
</script>

<template>
  <div class="wchart" :class="`wchart--${chartType}`">
    <div v-if="loading" class="wchart__mask">加载中…</div>
    <div v-if="style?.legend && chartType === 'scatter' && yLabel" class="wchart__legend">
      <span class="wchart__legend-item">
        <i :style="{ background: scatterColor }" />{{ yLabel }}
      </span>
    </div>
    <div v-else-if="style?.legend && metrics.length" class="wchart__legend">
      <span v-for="item in series" :key="item.name" class="wchart__legend-item">
        <i :style="{ background: item.color }" />{{ item.legendName }}
      </span>
    </div>

    <div ref="plotRef" class="wchart__plot">
      <svg v-if="!isEmpty" class="wchart__svg" :viewBox="`0 0 ${W} ${H}`" role="img">
        <!-- 直角坐标系：柱状/条形/折线/面积/组合 -->
        <template v-if="isCartesian">
          <g v-if="style?.grid !== false">
            <line
              v-for="line in gridLines"
              :key="`g${line.y}`"
              :x1="PAD.left"
              :x2="W - plotPadRight"
              :y1="line.y"
              :y2="line.y"
              class="wchart__grid"
            />
            <text
              v-for="line in gridLines"
              :key="`t${line.y}`"
              :x="PAD.left - 8"
              :y="line.y + 4"
              class="wchart__axis"
              text-anchor="end"
            >
              {{ line.value }}
            </text>
            <template v-if="showRightAxis">
              <line
                :x1="W - plotPadRight"
                :x2="W - plotPadRight"
                :y1="PAD.top"
                :y2="PAD.top + PLOT_H"
                class="wchart__axis-line"
              />
              <text
                v-for="line in rightGridLines"
                :key="`rt${line.y}`"
                :x="W - plotPadRight + 8"
                :y="line.y + 4"
                class="wchart__axis"
                text-anchor="start"
              >
                {{ line.value }}
              </text>
            </template>
          </g>
          <template v-if="chartType === 'hbar'">
            <g v-for="(category, index) in categories" :key="`h${index}`">
              <text
                :x="PAD.left - 8"
                :y="plotYCategory(index) + 4"
                class="wchart__axis"
                text-anchor="end"
              >
                {{ shortLabel(category, 6) }}
              </text>
              <rect
                v-for="(item, seriesIndex) in series"
                :key="`hb${seriesIndex}`"
                :x="PAD.left"
                :y="plotYCategory(index) - (barWidth * series.length) / 2 + seriesIndex * barWidth"
                :width="
                  Math.max(
                    1,
                    ((valuesBySeries[seriesIndex]?.[index] ?? 0) / maxFor(item.axis)) * PLOT_W,
                  )
                "
                :height="Math.max(2, barWidth - 2)"
                :fill="item.color"
                rx="2"
              />
            </g>
          </template>
          <template v-else>
            <g v-for="(category, index) in categories" :key="`c${index}`">
              <text :x="plotX(index)" :y="H - 10" class="wchart__axis" text-anchor="middle">
                {{ shortLabel(category) }}
              </text>
            </g>
            <g v-if="chartType !== 'line'">
              <template v-for="(item, seriesIndex) in series" :key="`s${seriesIndex}`">
                <template v-if="item.presentation !== 'line'">
                  <rect
                    v-for="(value, index) in valuesBySeries[seriesIndex]"
                    :key="`b${seriesIndex}-${index}`"
                    :x="plotX(index) - (barWidth * series.length) / 2 + seriesIndex * barWidth"
                    :y="plotY(value, item.axis)"
                    :width="Math.max(2, barWidth - 2)"
                    :height="Math.max(1, PAD.top + PLOT_H - plotY(value, item.axis))"
                    :fill="item.color"
                    rx="2"
                  />
                </template>
              </template>
            </g>
            <template v-if="chartType === 'area'">
              <path
                v-for="(path, seriesIndex) in areaPaths"
                :key="`a${seriesIndex}`"
                :d="path"
                :fill="series[seriesIndex]?.color"
                opacity="0.16"
              />
            </template>
            <template v-if="chartType === 'line' || chartType === 'area' || chartType === 'combo'">
              <template v-for="(item, seriesIndex) in series" :key="`l${seriesIndex}`">
                <polyline
                  v-if="
                    item.presentation === 'line' || chartType === 'line' || chartType === 'area'
                  "
                  :points="linePoints[seriesIndex]"
                  fill="none"
                  :stroke="item.color"
                  stroke-width="2.4"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <template
                  v-if="
                    style?.labels !== false &&
                    (item.presentation === 'line' || chartType === 'line' || chartType === 'area')
                  "
                >
                  <circle
                    v-for="(value, index) in valuesBySeries[seriesIndex]"
                    :key="`p${seriesIndex}-${index}`"
                    :cx="plotX(index)"
                    :cy="plotY(value, item.axis)"
                    r="3"
                    :fill="item.color"
                  />
                </template>
              </template>
            </template>
            <text
              v-for="(item, index) in series.slice(0, 3)"
              :key="`sl${index}`"
              :x="PAD.left + index * 120"
              :y="PAD.top + 8"
              class="wchart__series-label"
            >
              {{ item.name }}
            </text>
          </template>
        </template>

        <!-- 饼图 / 环形图 -->
        <template v-else-if="isPie">
          <g v-for="pie in pies" :key="`pie${pie.cx}`">
            <template v-for="(slice, index) in pie.slices" :key="`slice${index}`">
              <circle
                v-if="slice.full && slice.inner === 0"
                :cx="slice.cx"
                :cy="slice.cy"
                :r="slice.radius"
                :fill="slice.color"
              />
              <circle
                v-else-if="slice.full"
                :cx="slice.cx"
                :cy="slice.cy"
                :r="(slice.radius + slice.inner) / 2"
                fill="none"
                :stroke="slice.color"
                :stroke-width="slice.radius - slice.inner"
              />
              <path v-else :d="slice.path" :fill="slice.color" stroke="#fff" stroke-width="1.5" />
            </template>
            <text
              v-if="chartType === 'donut'"
              :x="pie.cx"
              :y="pie.cy + 5"
              class="wchart__donut-total"
              text-anchor="middle"
            >
              {{ Math.round(pie.total) }}
            </text>
            <text :x="pie.cx" :y="PAD.top + PLOT_H + 14" class="wchart__axis" text-anchor="middle">
              {{ pie.item.name }}
            </text>
          </g>
        </template>

        <!-- 散点图 -->
        <template v-else-if="chartType === 'scatter'">
          <line
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="PAD.top + PLOT_H"
            :y2="PAD.top + PLOT_H"
            class="wchart__axis-line"
          />
          <line
            :x1="PAD.left"
            :x2="PAD.left"
            :y1="PAD.top"
            :y2="PAD.top + PLOT_H"
            class="wchart__axis-line"
          />
          <circle
            v-for="(point, index) in points"
            :key="`sc${index}`"
            :cx="scatterX(point.x)"
            :cy="scatterY(point.y)"
            r="4.5"
            :fill="scatterColor"
            opacity="0.78"
          />
          <text
            v-if="xLabel"
            :x="(PAD.left + (W - PAD.right)) / 2"
            :y="H - 6"
            class="wchart__axis"
            text-anchor="middle"
          >
            {{ xLabel }}
          </text>
          <text
            v-if="yLabel"
            :x="12"
            :y="PAD.top + PLOT_H / 2"
            class="wchart__axis"
            text-anchor="middle"
            :transform="`rotate(-90 12 ${PAD.top + PLOT_H / 2})`"
          >
            {{ yLabel }}
          </text>
        </template>

        <!-- 雷达图 -->
        <template v-else-if="chartType === 'radar'">
          <polygon
            v-for="(grid, index) in radarGrid"
            :key="`rg${index}`"
            :points="grid"
            fill="none"
            class="wchart__grid"
          />
          <line
            v-for="(_, index) in radarAxes"
            :key="`ra${index}`"
            :x1="radarCenter.x"
            :y1="radarCenter.y"
            :x2="radarPoint(index, 1).split(',')[0]"
            :y2="radarPoint(index, 1).split(',')[1]"
            class="wchart__grid"
          />
          <polygon
            v-for="(item, seriesIndex) in radarSeries"
            :key="`rs${seriesIndex}`"
            :points="item.points"
            :fill="item.color"
            fill-opacity="0.13"
            :stroke="item.color"
            stroke-width="2"
          />
          <text
            v-for="(axis, index) in radarAxes"
            :key="`rt${index}`"
            :x="radarPoint(index, 1.15).split(',')[0]"
            :y="radarPoint(index, 1.15).split(',')[1]"
            class="wchart__axis"
            text-anchor="middle"
          >
            {{ shortLabel(axis, 5) }}
          </text>
        </template>

        <!-- 漏斗图 -->
        <template v-else-if="chartType === 'funnel'">
          <g v-for="(row, index) in funnelRows" :key="`f${index}`">
            <rect
              :x="W / 2 - (PLOT_W * row.ratio) / 2"
              :y="PAD.top + index * (PLOT_H / Math.max(1, funnelRows.length)) + 3"
              :width="Math.max(2, PLOT_W * row.ratio)"
              :height="Math.max(8, PLOT_H / Math.max(1, funnelRows.length) - 8)"
              :fill="colors[index % colors.length]"
              rx="4"
              opacity="0.9"
            />
            <text
              :x="W / 2"
              :y="
                PAD.top +
                index * (PLOT_H / Math.max(1, funnelRows.length)) +
                PLOT_H / Math.max(1, funnelRows.length) / 2 +
                4
              "
              class="wchart__funnel-label"
              text-anchor="middle"
            >
              {{ shortLabel(row.label, 8) }} · {{ formatChartValue(row.value, series[0]?.unit) }}
            </text>
          </g>
        </template>

        <!-- 仪表盘 -->
        <template v-else-if="chartType === 'gauge'">
          <path
            :d="gaugeArc(1)"
            fill="none"
            stroke="#e5e7eb"
            stroke-width="18"
            stroke-linecap="round"
          />
          <path
            :d="gaugeArc(gaugeRatio)"
            fill="none"
            :stroke="colors[0]"
            stroke-width="18"
            stroke-linecap="round"
          />
          <circle
            v-if="target > 0"
            :cx="gaugePoint(gaugeTargetRatio, gaugeRadius).x"
            :cy="gaugePoint(gaugeTargetRatio, gaugeRadius).y"
            r="5"
            fill="#fff"
            :stroke="colors[1] ?? '#3b82f6'"
            stroke-width="3"
          />
          <text :x="W / 2" :y="gaugeCenter.y - 8" class="wchart__gauge-value" text-anchor="middle">
            {{ formatChartValue(gaugeValue, series[0]?.unit) }}
          </text>
          <text :x="W / 2" :y="gaugeCenter.y + 20" class="wchart__axis" text-anchor="middle">
            目标 {{ target }}
          </text>
        </template>

        <!-- 热力图 -->
        <template v-else-if="chartType === 'heatmap'">
          <g v-for="(row, rowIndex) in heatmapModel.ys" :key="`hr${rowIndex}`">
            <g v-for="(column, colIndex) in heatmapModel.xs" :key="`hc${rowIndex}-${colIndex}`">
              <rect
                :x="plotPadLeft + colIndex * heatCellW"
                :y="PAD.top + rowIndex * heatCellH"
                :width="Math.max(2, heatCellW - 3)"
                :height="Math.max(2, heatCellH - 3)"
                :fill="heatColor(heatValue(row, column))"
                rx="2"
              />
              <text
                v-if="style?.labels !== false"
                :x="plotPadLeft + colIndex * heatCellW + heatCellW / 2"
                :y="PAD.top + rowIndex * heatCellH + heatCellH / 2 + 4"
                class="wchart__heat-label"
                text-anchor="middle"
              >
                {{ heatValue(row, column) }}
              </text>
            </g>
            <text
              :x="plotPadLeft - 8"
              :y="PAD.top + rowIndex * heatCellH + heatCellH / 2 + 4"
              class="wchart__axis"
              text-anchor="end"
            >
              {{ shortLabel(row, 5) }}
            </text>
          </g>
          <text
            v-for="(column, colIndex) in heatmapModel.xs"
            :key="`hx${colIndex}`"
            :x="plotPadLeft + colIndex * heatCellW + heatCellW / 2"
            :y="PAD.top + PLOT_H + 16"
            class="wchart__axis"
            text-anchor="middle"
          >
            {{ shortLabel(column, 5) }}
          </text>
        </template>
      </svg>
    </div>

    <div v-if="isEmpty" class="wchart__empty">暂无数据</div>
  </div>
</template>

<style scoped>
.wchart {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 140px;
  gap: 6px;
}

.wchart__mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  color: var(--sw-text-secondary);
  background: color-mix(in srgb, var(--sw-bg-surface) 70%, transparent);
  font-size: 12px;
}

.wchart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-height: 18px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.wchart__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.wchart__legend-item i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.wchart__plot {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.wchart__svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.wchart__grid {
  stroke: var(--sw-border-light, #eef0f4);
  stroke-width: 1;
}

.wchart__axis-line {
  stroke: var(--sw-border, #d9dde6);
  stroke-width: 1;
}

.wchart__axis {
  fill: var(--sw-text-tertiary, #98a2b3);
  font-size: 12px;
}

.wchart__series-label {
  fill: var(--sw-text-secondary);
  font-size: 12px;
}

.wchart__donut-total {
  fill: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.wchart__funnel-label {
  fill: #fff;
  font-size: 11px;
}

.wchart__gauge-value {
  fill: var(--sw-text-primary);
  font-size: 26px;
  font-weight: 700;
}

.wchart__heat-label {
  fill: #1f2937;
  font-size: 12px;
}

.wchart__empty {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 120px;
  color: var(--sw-text-tertiary);
  font-size: 12px;
  background: var(--sw-bg-muted, #fafbfc);
  border-radius: 6px;
}
</style>
