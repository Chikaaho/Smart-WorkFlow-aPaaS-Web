<script setup lang="ts">
/* global WheelEvent, PointerEvent, Element, HTMLElement */
/**
 * ProcessGraphView — 自研流程图只读渲染（I3 §4.1：定义查看与实例轨迹高亮共用内核）。
 *
 * 单一图契约=ProcessGraph；状态高亮 data 流=活跃/已完成节点 id 列表。
 * 历史图缺坐标时由确定性兼容布局还原图形并显示「兼容布局」标记。
 * 缩放/平移/适配内建；错误回显沿用请求层 ApiError。
 */
import { computed, ref, watch } from 'vue'
import { NODE_RUNTIME_STATE_CLASS } from '@/contracts/process-graph'
import type { ProcessGraphDocument, ProcessNodeRuntimeState } from '@/contracts/process-graph'
import { normalizeGraph, NODE_WIDTH, NODE_HEIGHT } from '@/adapters/process-graph'
import type { PositionedNode, PositionedEdge } from '@/adapters/process-graph'

const props = defineProps<{
  graph: ProcessGraphDocument | null
  trace?: {
    activeNodeIds: string[]
    completedNodeIds: string[]
  } | null
  height?: number
}>()

// ─── 画布视口 ───

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 620

const viewBox = ref<{ x: number; y: number; w: number; h: number }>({
  x: 0,
  y: 0,
  w: CANVAS_WIDTH,
  h: CANVAS_HEIGHT,
})
const startPan = ref<{ x: number; y: number } | null>(null)
const startViewBox = ref<{ x: number; y: number; w: number; h: number } | null>(null)

const spec = computed(() => (props.graph ? normalizeGraph(props.graph) : null))

/** 以图内容为核心适配视口（fitViewport 语义；空图退回默认视图）。 */
function fitViewport() {
  if (!spec.value) return
  const b = spec.value.bounds
  const pad = 60
  const w = Math.max(b.maxX - b.minX + pad * 2, 320)
  const h = Math.max(b.maxY - b.minY + pad * 2, 240)
  const ratio = Math.min(CANVAS_WIDTH / w, CANVAS_HEIGHT / h)
  const vw = CANVAS_WIDTH / ratio
  const vh = CANVAS_HEIGHT / ratio
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  viewBox.value = {
    x: cx - vw / 2,
    y: cy - vh / 2,
    w: vw,
    h: vh,
  }
}

function zoom(factor: number) {
  const current = viewBox.value
  const cx = current.x + current.w / 2
  const cy = current.y + current.h / 2
  const w = Math.min(4000, Math.max(200, current.w * factor))
  const h = (w / current.w) * current.h
  viewBox.value = { x: cx - w / 2, y: cy - h / 2, w, h }
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

function edgeState(edge: PositionedEdge): ProcessNodeRuntimeState {
  if (!props.trace) return 'idle'
  // 边的运行态跟随两端节点：起点活跃 → current；两端已完成 → completed；否则未经过
  if (props.trace.activeNodeIds.includes(edge.sourceId)) return 'current'
  if (
    props.trace.completedNodeIds.includes(edge.sourceId) &&
    (props.trace.completedNodeIds.includes(edge.targetId) ||
      props.trace.activeNodeIds.includes(edge.targetId))
  ) {
    return props.trace.activeNodeIds.includes(edge.targetId) ? 'current' : 'completed'
  }
  return 'passedOver'
}

const shownNodes = computed(() => spec.value?.nodes ?? [])
const shownEdges = computed(() => spec.value?.edges ?? [])

watch(
  () => props.graph,
  () => fitViewport(),
  { immediate: true },
)

defineExpose({ fitViewport, zoom })
</script>

<template>
  <div class="pg-view" :style="{ height: (height ?? 420) + 'px' }">
    <el-alert
      v-if="spec?.compatibilityLayout"
      title="历史图缺少画布坐标，已按确定性兼容布局展示；图形拓扑完整可用"
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
      <g>
        <path
          v-for="edge in shownEdges"
          :key="edge.id"
          :d="edge.path"
          fill="none"
          class="pg-edge"
          :class="`pg-edge-${edgeState(edge)}`"
          stroke-width="2"
        />
        <polygon
          v-for="edge in shownEdges"
          :key="`arw-${edge.id}`"
          class="pg-arrow"
          :class="`pg-edge-${edgeState(edge)}`"
        />
      </g>
      <g
        v-for="node in shownNodes"
        :key="node.id"
        :transform="`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`"
        class="pg-node"
        :class="NODE_RUNTIME_STATE_CLASS[nodeState(node)]"
      >
        <rect :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="8" class="pg-node-rect" />
        <text
          :x="NODE_WIDTH / 2"
          :y="NODE_HEIGHT / 2 - 4"
          text-anchor="middle"
          class="pg-node-label"
        >
          {{ node.label }}
        </text>
        <text
          :x="NODE_WIDTH / 2"
          :y="NODE_HEIGHT / 2 + 14"
          text-anchor="middle"
          class="pg-node-type"
        >
          {{ node.type }}
        </text>
      </g>
    </svg>
    <div class="pg-legend">
      <template v-if="trace">
        <span><i class="dot dot-current" /> 当前节点</span>
        <span><i class="dot dot-completed" /> 已完成</span>
        <span><i class="dot dot-passed-over" /> 未经过</span>
      </template>
      <span v-if="spec?.compatibilityLayout" class="pg-compat-tag">兼容布局</span>
    </div>
    <div class="pg-zoom">
      <el-button size="small" circle @click="zoom(1 / 1.2)">＋</el-button>
      <el-button size="small" circle @click="zoom(1.2)">－</el-button>
      <el-button size="small" @click="fitViewport">适配</el-button>
    </div>
  </div>
</template>

<style scoped>
.pg-view {
  position: relative;
  width: 100%;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: #fafafa;
  overflow: hidden;
}
.pg-svg {
  display: block;
  cursor: grab;
}
.pg-svg:active {
  cursor: grabbing;
}
.pg-node .pg-node-rect {
  fill: #ffffff;
  stroke: var(--el-border-color);
  stroke-width: 1.5;
}
.pg-state-current .pg-node-rect {
  fill: rgba(34, 197, 94, 0.12);
  stroke: #22c55e;
  stroke-width: 2.5;
}
.pg-state-completed .pg-node-rect {
  fill: rgba(148, 163, 184, 0.12);
  stroke: #94a3b8;
}
.pg-state-passed-over .pg-node-rect {
  fill: #f5f7fa;
  stroke: var(--el-border-color-lighter);
  stroke-dasharray: 4 3;
}
.pg-state-failed .pg-node-rect {
  fill: rgba(245, 108, 108, 0.12);
  stroke: #f56c6c;
}
.pg-state-cancelled .pg-node-rect {
  fill: rgba(144, 147, 153, 0.12);
  stroke: #909399;
}
.pg-node-label {
  font-size: 13px;
  font-weight: 500;
  fill: #303133;
}
.pg-node-type {
  font-size: 11px;
  fill: #909399;
}
.pg-edge {
  stroke: var(--el-border-color);
}
.pg-edge-current {
  stroke: #22c55e;
}
.pg-edge-completed {
  stroke: #94a3b8;
}
.pg-edge-passed-over {
  stroke: var(--el-border-color-lighter);
  stroke-dasharray: 4 3;
}
.pg-edge-failed {
  stroke: #f56c6c;
}
.pg-arrow {
  fill: none;
}
.pg-legend {
  position: absolute;
  left: 12px;
  bottom: 8px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #606266;
}
.pg-legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: middle;
}
.dot-current {
  background: #22c55e;
}
.dot-completed {
  background: #94a3b8;
}
.dot-passed-over {
  background: #dcdfe6;
}
.pg-zoom {
  position: absolute;
  right: 12px;
  top: 8px;
  display: flex;
  gap: 6px;
}
.pg-compat-alert {
  position: absolute;
  left: 12px;
  top: 8px;
  right: 100px;
}
.pg-compat-tag {
  color: #e6a23c;
}
</style>
