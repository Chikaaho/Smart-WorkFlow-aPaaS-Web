<script setup lang="ts">
/* global ResizeObserver */
/**
 * DesignerCanvas — 流程设计器画布（P53 节点09：24px 网格底 + 缩放控件；
 * 节点/连线渲染与拖拽、四向连线、连线编辑会话、缩放平移适配）。
 *
 * 状态与交互逻辑在 use-designer-canvas 中（经 getter 直取主文件共享状态）；
 * selectionId/validationErrors/isVersionPreview 由主文件传入，选中经 select 事件回流。
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '@/locales'
import { buildEdgePath } from '@/adapters/process-graph'
// 节点图标字形与面板分组投影共用同一份展示层定义（Q56 抽取共享）
import { nodeIconPaths } from '@/modules/workflow/utils/designer-palette'
import type { BpmNodeCapability } from '@/contracts/bpm-node'
import type { GraphValidationError } from '@/modules/workflow/api'
import type { DesignerModel } from '@/adapters/process-graph'
import {
  useDesignerCanvas,
  P53_NODE_WIDTH,
  P53_NODE_HEIGHT,
  P53_GATEWAY_RADIUS,
} from '../composables/use-designer-canvas'

const { t } = useI18n()

const props = defineProps<{
  /** 画布模型 getter（主文件 modelRef 直取，避免 prop 传输时序差）。 */
  modelGet: () => DesignerModel | null
  /** 快照 serial getter。 */
  versionGet: () => number
  /** 当前选中元素 id。 */
  selectionId: string | null
  /** 校验错误（节点红框）。 */
  validationErrors: GraphValidationError[]
  /** 版本预览态（只读快照时隐藏端口/手柄并禁用交互）。 */
  isVersionPreview: boolean
  /** 画布变更后的快照回调。 */
  snapshot: () => void
}>()

const emit = defineEmits<{
  /** 选中同步（节点/连线/空白取消）。 */
  select: [id: string | null]
}>()

const canvas = useDesignerCanvas({
  model: () => props.modelGet(),
  version: () => props.versionGet(),
  selectionId: () => props.selectionId,
  isVersionPreview: () => props.isVersionPreview,
  onSelect: (id) => emit('select', id),
  snapshot: props.snapshot,
})

const {
  svgRef,
  viewBox,
  zoomPercent,
  zoomView,
  fitViewport,
  canvasNodes,
  canvasEdges,
  onWheel,
  onBgPointerDown,
  onPointerMove,
  onPointerUp,
  startNodeDrag,
  onNodePointerUp,
  startConnect,
  pendingConnectPos,
  pendingConnectTarget,
  onCanvasDrop,
  pathPoints,
  edgePathOf,
  edgeHitCursor,
  onEdgePointerDown,
  onEdgeHoverMove,
  onEdgeHoverLeave,
  edgeSegmentHandlesOf,
  beginEndpointDrag,
  beginSegmentDragFromHandle,
  activeDragCursor,
  isGatewayShape,
  nodeLabelLines,
  centerOnNode,
  addNodeFromCapability,
} = canvas

defineExpose<{
  fitViewport: () => void
  centerOnNode: (elementId: string) => void
  addNodeFromCapability: (cap: BpmNodeCapability) => void
}>({ fitViewport, centerOnNode, addNodeFromCapability })

/** 画布尺寸变化时重新锚定适配（字体/布局就绪后初适配有偏差）。 */
let canvasObserver: ResizeObserver | null = null
onMounted(() => {
  canvasObserver = new ResizeObserver(() => {
    if (svgRef.value && svgRef.value.clientWidth > 0) fitViewport()
  })
  if (svgRef.value) canvasObserver.observe(svgRef.value)
})

onBeforeUnmount(() => {
  canvasObserver?.disconnect()
  canvasObserver = null
})
</script>

<template>
  <!-- 画布（P53 节点09：24px 网格底 + 缩放控件 + 底部操作提示） -->
  <div class="designer-canvas-wrap">
    <svg
      ref="svgRef"
      class="pg-svg"
      :class="{ 'pg-svg-dragging': activeDragCursor !== null }"
      :style="activeDragCursor ? { '--pg-drag-cursor': activeDragCursor } : undefined"
      :width="'100%'"
      :height="'100%'"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      @wheel="onWheel"
      @pointerdown="onBgPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dragover.prevent
      @drop="onCanvasDrop"
    >
      <defs>
        <pattern id="designer-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" fill="#dde3ef" />
        </pattern>
        <marker
          id="designer-edge-arrow"
          markerUnits="userSpaceOnUse"
          markerWidth="8.5"
          markerHeight="7"
          refX="8.2"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L8.5,3.5 L0,7 z" class="designer-edge-arrow" />
        </marker>
        <marker
          id="designer-edge-arrow-selected"
          markerUnits="userSpaceOnUse"
          markerWidth="8.5"
          markerHeight="7"
          refX="8.2"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L8.5,3.5 L0,7 z" class="designer-edge-arrow-selected" />
        </marker>
      </defs>
      <rect class="pg-bg" x="-100000" y="-100000" width="200000" height="200000" />
      <template v-for="edge in canvasEdges" :key="edge.id">
        <path
          :d="edgePathOf(edge)"
          fill="none"
          class="designer-edge"
          :class="{ 'designer-edge-selected': selectionId === edge.id }"
          stroke-width="10"
          stroke="transparent"
          :style="{ cursor: edgeHitCursor(edge) }"
          :data-edge-id="edge.id"
          @pointerdown.stop="onEdgePointerDown($event, edge)"
          @pointermove="onEdgeHoverMove($event, edge)"
          @pointerleave="onEdgeHoverLeave(edge)"
        />
        <path
          :d="edgePathOf(edge)"
          fill="none"
          class="designer-edge-visual"
          :class="{ 'designer-edge-selected': selectionId === edge.id }"
          stroke-width="1.6"
          pointer-events="none"
        />
      </template>
      <path
        v-if="pendingConnectTarget"
        :d="
          buildEdgePath(
            { x: pendingConnectPos?.x ?? 0, y: pendingConnectPos?.y ?? 0 },
            { x: pendingConnectTarget.x, y: pendingConnectTarget.y },
            [],
          )
        "
        fill="none"
        class="designer-edge-pending"
        stroke-dasharray="6 4"
      />
      <g
        v-for="node in canvasNodes"
        :key="node.id"
        :transform="
          isGatewayShape(node.type)
            ? `translate(${node.x - P53_GATEWAY_RADIUS}, ${node.y - P53_GATEWAY_RADIUS})`
            : `translate(${node.x - P53_NODE_WIDTH / 2}, ${node.y - P53_NODE_HEIGHT / 2})`
        "
        class="designer-node"
        :class="{
          'designer-node-selected': selectionId === node.id,
          'designer-node-error': validationErrors.some((e) => e.nodeKey === node.id),
          'designer-node-start': node.type === 'START',
          'designer-node-end': node.type === 'END',
          'designer-node-draft': node.config?.nodeClass === 'draft',
        }"
        :data-node-id="node.id"
        @pointerdown="startNodeDrag($event, node)"
        @pointerup="onNodePointerUp($event, node)"
      >
        <rect
          v-if="!isGatewayShape(node.type)"
          :width="P53_NODE_WIDTH"
          :height="P53_NODE_HEIGHT"
          rx="4"
          class="designer-node-rect"
        />
        <!-- 网关为 28×28 外框内的 26×26 菱形（+号），名称置于菱形下方 -->
        <template v-else>
          <rect x="0" y="0" width="28" height="28" class="designer-node-gateway-frame" />
          <polygon
            points="14,1 27,14 14,27 1,14"
            class="designer-node-rect designer-node-gateway"
          />
          <path d="M14 7 V21 M7 14 H21" class="designer-node-gateway-plus" />
        </template>
        <!-- V011-BUG-023：四向锚点（上下左右缘中点）均可拖拽/点选拉线（ProcessOn 口径） -->
        <circle
          v-if="!isVersionPreview && selectionId === node.id && !isGatewayShape(node.type)"
          :cx="0"
          :cy="P53_NODE_HEIGHT / 2"
          r="3"
          class="designer-node-port"
          @pointerdown.stop="startConnect($event, node, 'left')"
        />
        <circle
          v-if="!isVersionPreview && selectionId === node.id && !isGatewayShape(node.type)"
          :cx="P53_NODE_WIDTH"
          :cy="P53_NODE_HEIGHT / 2"
          r="3"
          class="designer-node-port"
          @pointerdown.stop="startConnect($event, node, 'right')"
        />
        <circle
          v-if="!isVersionPreview && selectionId === node.id && !isGatewayShape(node.type)"
          :cx="P53_NODE_WIDTH / 2"
          :cy="0"
          r="3"
          class="designer-node-port"
          @pointerdown.stop="startConnect($event, node, 'top')"
        />
        <circle
          v-if="!isVersionPreview && selectionId === node.id && !isGatewayShape(node.type)"
          :cx="P53_NODE_WIDTH / 2"
          :cy="P53_NODE_HEIGHT"
          r="3"
          class="designer-node-port"
          @pointerdown.stop="startConnect($event, node, 'bottom')"
        />
        <!-- 设计09：节点图标为锁定 SVG 矢量字形（22×22，起点 (12,14)） -->
        <g
          v-if="!isGatewayShape(node.type)"
          class="designer-node-icon"
          transform="translate(12 11)"
        >
          <!-- 开始/结束：圆形描边 + 内部图形（参考 UI 口径）；其余节点共用 20×20 字形 -->
          <g transform="translate(1 1)">
            <template v-if="node.type === 'START'">
              <circle
                cx="10"
                cy="10"
                r="8.3"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <path d="M8.8 7 L13.2 10 L8.8 13 Z" fill="currentColor" />
            </template>
            <template v-else-if="node.type === 'END'">
              <circle
                cx="10"
                cy="10"
                r="8.3"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <rect x="7.6" y="7.6" width="4.8" height="4.8" rx="1" fill="currentColor" />
            </template>
            <template v-else>
              <path
                v-for="(pathData, pathIndex) in nodeIconPaths(node.type)"
                :key="pathIndex"
                :d="pathData"
              />
            </template>
          </g>
        </g>
        <text
          v-if="!isGatewayShape(node.type)"
          :x="42"
          :y="P53_NODE_HEIGHT / 2 + (nodeLabelLines(node.label).length > 1 ? -5 : 2)"
          text-anchor="start"
          class="designer-node-label"
        >
          <tspan
            v-for="(line, lineIndex) in nodeLabelLines(node.label)"
            :key="lineIndex"
            :x="42"
            :dy="lineIndex === 0 ? 0 : 17"
          >
            {{ line }}
          </tspan>
        </text>
        <text
          v-else
          x="14"
          y="52"
          text-anchor="middle"
          class="designer-node-label designer-node-label--gateway"
        >
          {{ node.label }}
        </text>
      </g>
      <!-- V011-BUG-025 / BF20261013-030：把连线编辑手柄放在节点之后，确保端点不被节点盒遮挡。 -->
      <template v-for="edge in canvasEdges" :key="'handles-' + edge.id">
        <template v-if="selectionId === edge.id && !isVersionPreview">
          <!-- BF20261013-030：内段中点手柄（垂直段左右拖 / 水平段上下拖，方向光标随轴） -->
          <rect
            v-for="handle in edgeSegmentHandlesOf(edge)"
            :key="'seg-' + edge.id + '-' + handle.index"
            :x="handle.x - 4.5"
            :y="handle.y - 4.5"
            width="9"
            height="9"
            rx="1.5"
            class="designer-edge-segment-handle"
            :style="{ cursor: handle.cursor }"
            @pointerdown.stop="beginSegmentDragFromHandle($event, edge, handle)"
          />
          <circle
            :cx="pathPoints(edge.path)[0]?.x ?? 0"
            :cy="pathPoints(edge.path)[0]?.y ?? 0"
            r="5"
            class="designer-edge-endpoint"
            @pointerdown.stop="beginEndpointDrag($event, edge, 'source')"
          />
          <circle
            :cx="pathPoints(edge.path)[pathPoints(edge.path).length - 1]?.x ?? 0"
            :cy="pathPoints(edge.path)[pathPoints(edge.path).length - 1]?.y ?? 0"
            r="5"
            class="designer-edge-endpoint"
            @pointerdown.stop="beginEndpointDrag($event, edge, 'target')"
          />
        </template>
      </template>
    </svg>
    <div class="canvas-zoom">
      <button type="button" class="zoom-btn" @click="zoomView(1 / 1.1)">−</button>
      <span class="zoom-value">{{ zoomPercent }}%</span>
      <button type="button" class="zoom-btn" @click="zoomView(1.1)">＋</button>
      <button type="button" class="zoom-fit" @click="fitViewport">
        {{ t('workflow.fitView') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── 画布（24px 网格 + 缩放控件 + 底部提示条）
   G08（42:4）：圆角内框 x236→x1568（左距 224+12、右距 1584-16），网格自内框 16px 内距起铺 */
.designer-canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  margin: 16px;
  padding: 16px;
  overflow: hidden;
  border: 1px solid #e4e9f2;
  border-radius: 8px;
  /* 参考 UI：白底 + 20px 点阵 */
  background: #fff;
}
.pg-bg {
  fill: url(#designer-grid);
}
.canvas-zoom {
  position: absolute;
  right: 16px;
  bottom: 16px;
  top: auto;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 300px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  color: #8190aa;
}
.zoom-btn {
  border: 0;
  background: transparent;
  padding: 0;
  color: #8190aa;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.zoom-value {
  min-width: 38px;
  text-align: center;
  font-size: 13px;
  color: #8190aa;
}
.zoom-fit {
  border: 0;
  background: transparent;
  padding: 0;
  color: #8190aa;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.zoom-btn:hover,
.zoom-fit:hover {
  color: var(--sw-color-primary);
}
.canvas-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 50px;
  box-sizing: border-box;
  padding: 17px 24px;
  background: #f4f7fc;
  border-top: 1px solid #d7deed;
  color: #8a98b0;
  font-size: 12px;
  line-height: 16px;
}

/* ── 节点卡片（fixture 终版几何：158.8×48.8 / 胶囊 24.4 / 选中态跟随品牌主题） ── */
.designer-node {
  cursor: move;
}
/* G08（42:4）：节点卡片 230×44（0.6px 内缩保持描边落在盒内；参考 UI：白卡细灰边） */
.designer-node-rect {
  x: 0.6px;
  y: 0.6px;
  width: 228.8px;
  height: 42.8px;
  rx: 4px;
  fill: #fff;
  stroke: #d5deec;
  stroke-width: 1.2;
}
.designer-node-start .designer-node-rect,
.designer-node-end .designer-node-rect {
  fill: #fff;
  stroke-width: 1.2;
}
.designer-node-start .designer-node-rect {
  stroke: #16a77b;
}
.designer-node-end .designer-node-rect {
  stroke: #ef5d71;
}
.designer-node-start .designer-node-label {
  fill: #12805c;
}
.designer-node-end .designer-node-label {
  fill: #c2303a;
}
.designer-node-start .designer-node-icon {
  color: #16a77b;
}
.designer-node-end .designer-node-icon {
  color: #ef5d71;
}
/* 设计09：起草节点（发起人填写）浅橙底、灰描边 */
.designer-node-draft .designer-node-rect {
  fill: #fff6f1;
  stroke: #7e8799;
}
.designer-node-selected .designer-node-rect {
  fill: #f4f8ff;
  stroke: var(--sw-color-primary);
  stroke-width: 1.6;
}
.designer-node-error .designer-node-rect {
  stroke: var(--el-color-danger);
  stroke-width: 2.5;
}
.designer-node-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
  fill: #19233b;
  pointer-events: none;
}
.designer-node-label--gateway {
  fill: #8a98b0;
  font-weight: 400;
}
.designer-node-icon {
  color: #8393b5;
  pointer-events: none;
}
.designer-node-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.designer-node-selected .designer-node-icon {
  color: var(--sw-color-primary);
}
.designer-node-gateway {
  fill: #f7a92c;
  stroke: #e79a1f;
  stroke-width: 1.4;
}
/* 28×28 节点外框（矢量菱形 26×26，不含描边外缘） */
.designer-node-gateway-frame {
  fill: none;
  stroke: none;
  pointer-events: none;
}
.designer-node-gateway-plus {
  fill: none;
  stroke: #fff;
  stroke-width: 1.8;
  stroke-linecap: round;
}
.designer-node-type {
  font-size: 11px;
  fill: #8393b5;
  pointer-events: none;
}
.designer-node-selected .designer-node-label {
  fill: var(--sw-color-primary);
}
.designer-node-port {
  fill: #a4adbe;
  stroke: var(--sw-color-primary);
  stroke-width: 1.5;
  cursor: crosshair;
}
/* BF20261013-030：内段中点手柄——实心方块（方向光标由拖动轴内联给出） */
.designer-edge-segment-handle {
  fill: var(--sw-color-primary);
  stroke: #fff;
  stroke-width: 1.5;
  pointer-events: all;
}
.designer-edge-endpoint {
  fill: var(--sw-color-primary-softer);
  stroke: var(--sw-color-primary);
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}
.designer-edge-endpoint:active {
  cursor: grabbing;
}
/* BF20261013-036：拖动会话期间统一光标——拖动中预览几何每帧变化，命中检测会让光标在
   小手/箭头/移动之间来回闪；拖动期间整块画布固定用会话光标（端点=grabbing，内段=按轴方向）。 */
.pg-svg-dragging,
.pg-svg-dragging :deep(*) {
  cursor: var(--pg-drag-cursor, grabbing) !important;
}

/* ── 连线（fixture：#A4ADBE 1.6 + 同色箭头） ── */
.designer-edge {
  cursor: pointer;
  /* stroke="transparent" 不参与 visiblePainted 命中；显式按描边命中 */
  pointer-events: stroke;
}
.designer-edge.designer-edge-selected {
  stroke: transparent;
}
.designer-edge-visual {
  stroke: #aeb9cb;
  stroke-width: 1.5;
  marker-end: url(#designer-edge-arrow);
  pointer-events: none;
}
.designer-edge-visual.designer-edge-selected {
  stroke: var(--sw-color-primary);
  stroke-width: 2;
  marker-end: url(#designer-edge-arrow-selected);
}
.designer-edge-arrow {
  fill: #8996ab;
  stroke: none;
}
.designer-edge-arrow-selected {
  fill: var(--sw-color-primary);
  stroke: none;
}
.designer-edge-pending {
  stroke: var(--el-color-warning);
}
</style>
