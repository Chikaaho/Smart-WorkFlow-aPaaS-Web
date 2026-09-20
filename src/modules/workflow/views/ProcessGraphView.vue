<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global WheelEvent, PointerEvent, Element, HTMLElement, ResizeObserver */
/**
 * ProcessGraphView — 自研流程图只读渲染（I3 §4.1：定义查看与实例轨迹高亮共用内核）。
 *
 * 单一图契约=ProcessGraph；状态高亮 data 流=活跃/已完成节点 id 列表。
 * 历史图缺坐标时由确定性兼容布局还原图形并显示「兼容布局」标记。
 * 缩放/平移/适配/定位当前内建；P53 设计（节点10/19）：锚定适配（左上锚点、ratio≤1）、
 * 单行节点+类型图标、网关菱形、右下缩放控件。
 * 错误回显沿用请求层 ApiError。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NODE_RUNTIME_STATE_CLASS } from '@/contracts/process-graph'
import type { ProcessGraphDocument, ProcessNodeRuntimeState } from '@/contracts/process-graph'
import {
  normalizeGraph,
  GRAPH_NODE_WIDTH,
  GRAPH_NODE_HEIGHT,
} from '@/adapters/process-graph'
import type { PositionedEdge, PositionedNode } from '@/adapters/process-graph'

const props = defineProps<{
  graph: ProcessGraphDocument | null
  trace?: {
    activeNodeIds: string[]
    completedNodeIds: string[]
  } | null
  height?: number
  /** 锚定适配留白（画布像素）：设计按画布相对位置固定图内容。 */
  fitMargins?: { left?: number; top?: number; right?: number; bottom?: number }
}>()

// ─── 画布视口 ───

/** 默认画布尺寸（挂载测量前的兜底）。 */
const CANVAS_WIDTH = 1152
const CANVAS_HEIGHT = 620

const NODE_W = GRAPH_NODE_WIDTH
const NODE_H = GRAPH_NODE_HEIGHT

const rootEl = ref<HTMLElement | null>(null)
const elSize = ref<{ w: number; h: number }>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT })
const zoomLevel = ref(1)

const viewBox = ref<{ x: number; y: number; w: number; h: number }>({
  x: 0,
  y: 0,
  w: CANVAS_WIDTH,
  h: CANVAS_HEIGHT,
})
const startPan = ref<{ x: number; y: number } | null>(null)
const startViewBox = ref<{ x: number; y: number; w: number; h: number } | null>(null)

const spec = computed(() =>
  props.graph
    ? normalizeGraph(props.graph, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT }, 22)
    : null,
)

/** 以图内容为锚（左上留白 + ratio≤1）适配视口；空图退回默认视图。 */
function fitViewport() {
  if (!spec.value) return
  const b = spec.value.bounds
  const m = {
    left: 60,
    top: 28,
    right: 60,
    bottom: 28,
    ...props.fitMargins,
  }
  const bw = Math.max(b.maxX - b.minX, 1)
  const bh = Math.max(b.maxY - b.minY, 1)
  const availW = elSize.value.w - m.left - m.right
  const availH = elSize.value.h - m.top - m.bottom
  const ratio = Math.min(1, availW / bw, availH / bh)
  zoomLevel.value = Math.max(ratio, 0.2)
  viewBox.value = {
    x: b.minX - m.left / zoomLevel.value,
    y: b.minY - m.top / zoomLevel.value,
    w: elSize.value.w / zoomLevel.value,
    h: elSize.value.h / zoomLevel.value,
  }
}

function zoom(factor: number) {
  const current = viewBox.value
  const cx = current.x + current.w / 2
  const cy = current.y + current.h / 2
  const w = Math.min(4000, Math.max(200, current.w * factor))
  const h = (w / current.w) * current.h
  zoomLevel.value = elSize.value.w / w
  viewBox.value = { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** 定位当前节点：将活跃节点移至视口中心（真实轨迹数据驱动）。 */
function locateCurrent() {
  const current = shownNodes.value.find((node) => nodeState(node) === 'current')
  if (!current) return
  const vb = viewBox.value
  viewBox.value = { ...vb, x: current.x - vb.w / 2, y: current.y - vb.h / 2 }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoom(event.deltaY > 0 ? 1.1 : 1 / 1.1)
}

function onPointerDown(event: PointerEvent) {
  ;(event.currentTarget as unknown as Element).setPointerCapture?.(event.pointerId)
  startPan.value = { x: event.clientX, y: event.clientY }
  startViewBox.value = { ...viewBox.value }
}

function onPointerMove(event: PointerEvent) {
  if (!startPan.value || !startViewBox.value) return
  const container = (event.currentTarget as unknown as HTMLElement).getBoundingClientRect()
  const ratio = startViewBox.value.w / container.width
  viewBox.value = {
    ...startViewBox.value,
    x: startViewBox.value.x - (event.clientX - startPan.value.x) * ratio,
    y: startViewBox.value.y - (event.clientY - startPan.value.y) * ratio,
  }
}

function onPointerUp() {
  startPan.value = null
  startViewBox.value = null
}

// ─── 状态映射 ───

function nodeState(node: PositionedNode): ProcessNodeRuntimeState {
  if (!props.trace) return 'idle'
  if (props.trace.activeNodeIds.includes(node.id)) return 'current'
  if (props.trace.completedNodeIds.includes(node.id)) return 'completed'
  return 'passedOver'
}

/**
 * 边的运行态（设计10/19）：两端均已完成且不含网关 → completed（绿色链路）；
 * 其余（含网关扇出、回流、未到达路径）恒为中性灰。
 */
function edgeState(edge: PositionedEdge): 'completed' | 'idle' {
  if (!props.trace) return 'idle'
  const source = shownNodes.value.find((n) => n.id === edge.sourceId)
  const target = shownNodes.value.find((n) => n.id === edge.targetId)
  if (!source || !target || source.type === 'GATEWAY' || target.type === 'GATEWAY') return 'idle'
  return nodeState(source) === 'completed' && nodeState(target) === 'completed'
    ? 'completed'
    : 'idle'
}

function isGateway(node: PositionedNode): boolean {
  return node.type === 'GATEWAY'
}

const shownNodes = computed(() => spec.value?.nodes ?? [])
/** config.visible=false 的边只保留逻辑后继语义，不渲染连线（设计10/19：会签出线不画）。 */
const shownEdges = computed(() =>
  (spec.value?.edges ?? []).filter((edge) => edge.config.visible !== false),
)

watch(
  () => props.graph,
  () => fitViewport(),
  { immediate: true },
)

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!rootEl.value) return
  const w = rootEl.value.clientWidth
  const h = rootEl.value.clientHeight
  if (w > 0 && h > 0) elSize.value = { w, h }
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const nw = Math.round(entry.contentRect.width)
    const nh = Math.round(entry.contentRect.height)
    if (nw > 0 && nh > 0 && (nw !== elSize.value.w || nh !== elSize.value.h)) {
      elSize.value = { w: nw, h: nh }
      fitViewport()
    }
  })
  observer.observe(rootEl.value)
  fitViewport()
})
onBeforeUnmount(() => observer?.disconnect())

defineExpose({ fitViewport, zoom, locateCurrent })
</script>

<template>
  <div ref="rootEl" class="pg-view" :style="{ height: (height ?? 420) + 'px' }">
    <el-alert
      v-if="spec?.compatibilityLayout"
      :title="t('workflow.compatLayoutNotice')"
      type="info"
      :closable="false"
      show-icon
      class="pg-compat-alert"
    />
    <svg
      :width="'100%'"
      :height="'100%'"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      class="pg-svg"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <defs>
        <marker
          v-for="tone in ['idle', 'completed']"
          :id="`pg-arrow-${tone}`"
          :key="tone"
          markerWidth="8"
          markerHeight="8"
          refX="8"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L8,4 L0,8 Z" :fill="tone === 'completed' ? '#16a77b' : '#a4adbe'" />
        </marker>
      </defs>
      <g>
        <path
          v-for="edge in shownEdges"
          :key="edge.id"
          :d="edge.path"
          fill="none"
          class="pg-edge"
          :class="`pg-edge-${edgeState(edge)}`"
          :marker-end="`url(#pg-arrow-${edgeState(edge)})`"
        />
      </g>
      <g
        v-for="node in shownNodes"
        :key="node.id"
        :transform="`translate(${node.x}, ${node.y})`"
        class="pg-node"
      >
        <template v-if="isGateway(node)">
          <polygon points="0,-22 22,0 0,22 -22,0" class="pg-node-diamond" />
          <path d="M-12 0H12M0 -12V12" class="pg-node-diamond-plus" />
          <text x="30" y="19" text-anchor="start" class="pg-node-gateway-label">
            {{ node.label }}
          </text>
        </template>
        <template v-else>
          <!-- 设计（节点19）：节点盒 158.8×48.8，矩形以中心定位（与设计坐标逐像素一致） -->
          <rect
            :x="-NODE_W / 2 - 0.4"
            :y="-NODE_H / 2 - 0.4"
            :width="NODE_W + 0.8"
            :height="NODE_H + 0.8"
            :rx="node.type === 'START' ? 24.4 : 5.4"
            class="pg-node-rect"
            :class="NODE_RUNTIME_STATE_CLASS[nodeState(node)]"
          />
          <rect
            v-if="nodeState(node) === 'current'"
            :x="-NODE_W / 2 - 3.9"
            :y="-NODE_H / 2 - 3.9"
            :width="NODE_W + 7.8"
            :height="NODE_H + 7.8"
            rx="6.5"
            class="pg-node-halo"
          />
          <rect
            v-if="nodeState(node) === 'current'"
            :x="-NODE_W / 2 - 2.8"
            :y="-2.4"
            width="4.8"
            height="4.8"
            rx="2.4"
            class="pg-node-port"
          />
          <rect
            v-if="nodeState(node) === 'current'"
            :x="NODE_W / 2 - 2"
            :y="-2.4"
            width="4.8"
            height="4.8"
            rx="2.4"
            class="pg-node-port"
          />
          <g class="pg-node-icon" transform="translate(-64.4, -8.7)">
            <template v-if="node.type === 'START'">
              <path d="M6 4 L15 10 L6 16 Z" class="pg-node-icon-fill" />
            </template>
            <template v-else-if="node.type === 'END'">
              <circle cx="10.5" cy="10" r="6.5" class="pg-node-icon-stroke" />
              <path d="M7.5 10 L9.5 12 L13.5 7.5" class="pg-node-icon-stroke" />
            </template>
            <template v-else>
              <!-- 设计（节点19）审批节点图标：圆角文档 + 三行文本线 + 右下人员徽标 -->
              <path
                d="M13.83 0 H0.92 C0.4 0 0 0.4 0 0.92 V15.58 C0 16.1 0.4 16.5 0.92 16.5 H13.83 C14.34 16.5 14.75 16.1 14.75 15.58 V0.92 C14.75 0.4 14.34 0 13.83 0 Z"
                class="pg-node-icon-stroke"
              />
              <path d="M2.75 3.67 H10.08 M2.75 7.33 H8.25 M2.75 11 H6.42" class="pg-node-icon-stroke" />
              <circle cx="14.75" cy="10.08" r="2.75" class="pg-node-icon-badge" />
              <path
                d="M9.17 17.42 C9.17 16.2 9.65 15.04 10.51 14.18 C11.37 13.32 12.53 12.83 13.75 12.83 C14.97 12.83 16.13 13.32 16.99 14.18 C17.85 15.04 18.33 16.2 18.33 17.42"
                class="pg-node-icon-stroke"
              />
            </template>
          </g>
          <text x="-39.4" :y="node.label.length > 8 ? -4 : 4.5" text-anchor="start" class="pg-node-label">
            <template v-if="node.label.length > 8">
              <tspan x="-39.4" dy="0">{{ node.label.slice(0, 8) }}</tspan>
              <tspan x="-39.4" dy="17">{{ node.label.slice(8) }}</tspan>
            </template>
            <template v-else>{{ node.label }}</template>
          </text>
        </template>
      </g>
    </svg>
    <span v-if="spec?.compatibilityLayout" class="pg-compat-tag">{{ t('workflow.compatLayout') }}</span>
    <div class="pg-zoom">
      <div class="pg-zoom__row">
        <el-button size="small" text @click="zoom(1.2)" aria-label="缩小">－</el-button>
        <span class="pg-zoom__level">{{ Math.round(zoomLevel * 100) }}%</span>
        <el-button size="small" text @click="zoom(1 / 1.2)" aria-label="放大">＋</el-button>
      </div>
      <div v-if="trace" class="pg-zoom__row pg-zoom__actions-row">
        <span class="pg-zoom__actions-text">
          {{ t('workflow.locateCurrent') }}&nbsp;&nbsp;/&nbsp;&nbsp;{{ t('workflow.fitView') }}
        </span>
        <button
          type="button"
          class="pg-zoom__action-hit pg-zoom__locate-hit"
          :aria-label="t('workflow.locateCurrent')"
          @click="locateCurrent"
        />
        <button
          type="button"
          class="pg-zoom__action-hit pg-zoom__fit-hit"
          :aria-label="t('workflow.fitView')"
          @click="fitViewport"
        />
      </div>
      <div v-else class="pg-zoom__row">
        <el-button size="small" text @click="fitViewport">{{ t('workflow.fitView') }}</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg-view {
  position: relative;
  width: 100%;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  /* P53 设计（节点10/19）：画布浅蓝灰 #E8EDF6 */
  background: #e8edf6;
  overflow: hidden;
}
.pg-svg {
  display: block;
  cursor: grab;
}
.pg-svg:active {
  cursor: grabbing;
}
/* 设计（节点19）：节点描边 #7E8799 1.2、圆角 5.4；完成 #16A77B；当前 #6F2DFF 2 + 光晕环。 */
.pg-node .pg-node-rect {
  fill: #ffffff;
  stroke: #7e8799;
  stroke-width: 1.2;
}
.pg-node .pg-node-diamond {
  fill: #ffffff;
  stroke: #8393b5;
  stroke-width: 1.4;
}
.pg-node-diamond-plus {
  stroke: #8393b5;
  stroke-width: 1.5;
  fill: none;
}
.pg-node-halo {
  fill: none;
  stroke: var(--sw-color-primary);
  stroke-opacity: 0.2;
  stroke-width: 3;
}
.pg-node-port {
  fill: #a4adbe;
  stroke: var(--sw-color-primary);
  stroke-width: 1.2;
}
.pg-state-current.pg-node-rect {
  fill: #f7f2ff;
  stroke: var(--sw-color-primary);
  stroke-width: 2;
}
.pg-state-completed.pg-node-rect {
  fill: #f0fbf6;
  stroke: #16a77b;
  stroke-width: 1.2;
}
.pg-state-passed-over.pg-node-rect {
  fill: #ffffff;
  stroke: #7e8799;
  stroke-width: 1.2;
}
.pg-state-failed.pg-node-rect {
  fill: rgba(224, 75, 85, 0.08);
  stroke: var(--sw-danger);
}
.pg-state-cancelled.pg-node-rect {
  fill: rgba(126, 137, 161, 0.1);
  stroke: #7e89a1;
}
.pg-node-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
  fill: #19233b;
}
.pg-node-gateway-label {
  font-size: 11px;
  fill: #7e8799;
}
/* 节点类型图标：描边随状态色（设计 #8393B5 1.6） */
.pg-node-icon {
  color: #8393b5;
}
.pg-node-icon .pg-node-icon-stroke {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pg-node-icon .pg-node-icon-fill {
  fill: currentColor;
  stroke: none;
}
.pg-node-icon .pg-node-icon-badge {
  fill: #16a77b;
  stroke: currentColor;
  stroke-width: 1.2;
}
.pg-state-current .pg-node-icon {
  color: var(--sw-color-primary);
}
.pg-state-completed .pg-node-icon {
  color: #16a77b;
}
.pg-edge {
  stroke: #a4adbe;
  stroke-width: 1.6;
}
.pg-edge-completed {
  stroke: #16a77b;
}
.pg-arrow {
  fill: none;
}
.pg-compat-tag {
  position: absolute;
  left: 12px;
  bottom: 8px;
  color: var(--sw-warning);
}
.pg-zoom {
  position: absolute;
  right: 22px;
  bottom: 44px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  background: #fff;
}
.pg-zoom__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.pg-zoom__actions-row {
  position: relative;
  width: 151px;
  height: 24px;
  justify-content: flex-start;
}
.pg-zoom__actions-text {
  display: block;
  width: 151px;
  line-height: 16px;
  text-align: center;
  color: var(--sw-color-primary);
  font-size: 12px;
}
.pg-zoom__action-hit {
  position: absolute;
  top: 0;
  width: 70px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.pg-zoom__action-hit:focus-visible {
  outline: 2px solid var(--sw-color-primary);
  outline-offset: -1px;
}
.pg-zoom__locate-hit {
  left: 0;
}
.pg-zoom__fit-hit {
  right: 0;
}
.pg-zoom__level {
  min-width: 40px;
  text-align: center;
  font-size: 12px;
  color: #344164;
}
.pg-zoom__locate {
  color: var(--sw-color-primary);
}
.pg-zoom__sep {
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.pg-zoom .el-button {
  margin: 0;
  line-height: 16px;
}
.pg-compat-alert {
  position: absolute;
  left: 12px;
  top: 8px;
  right: 100px;
}
</style>
