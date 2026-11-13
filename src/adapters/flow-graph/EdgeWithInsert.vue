<script setup lang="ts">
/**
 * flow-graph 自定义连线（G1-3）：贝塞尔连线 + 中点「+」插入按钮 + 条件关键词标签。
 * 适配层不解释关键词语义，仅渲染 Edge.label 文本；点击「+」经注入的 actions 回调业务层。
 */
import { computed, inject } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Position } from '@vue-flow/core'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  label?: unknown
  selected?: boolean
  markerEnd?: string
}>()

interface FlowEdgeActions {
  insertAfter: (target: { kind: 'edge'; id: string }) => void
}

const actions = inject<FlowEdgeActions | null>('sw-flow-actions', null)

const path = computed(() => {
  const [edgePath] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })
  return edgePath
})

const labelText = computed(() =>
  typeof props.label === 'string' && props.label.trim() !== '' ? props.label.trim() : '',
)

/**
 * 关键词标签位置（X2）：标签贴着所属连线（贝塞尔中点，白色底片压线），
 * 横向钳制在两卡之间的间隙内，避免压住卡片；间隙连标签都放不下（手工拖近）时
 * 才落到两卡下方空白带。
 */
const LABEL_CHAR_W = 12
const LABEL_PAD = 18
const LABEL_CLEAR_BELOW = 64
const labelPos = computed(() => {
  const [, bezX, bezY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })
  const gap = Math.abs(props.targetX - props.sourceX)
  const estWidth = labelText.value.length * LABEL_CHAR_W + LABEL_PAD
  if (gap >= estWidth + 10) {
    const half = estWidth / 2 + 2
    const lo = Math.min(props.sourceX, props.targetX) + half
    const hi = Math.max(props.sourceX, props.targetX) - half
    const x = Math.min(Math.max(bezX, lo), hi)
    return { x, y: bezY }
  }
  return {
    x: bezX,
    y: Math.max(props.sourceY, props.targetY) + LABEL_CLEAR_BELOW,
  }
})

function handleInsert() {
  actions?.insertAfter({ kind: 'edge', id: props.id })
}
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path"
    :marker-end="markerEnd"
    class="sw-edge-path"
    :class="{ 'is-selected': selected }"
  />
  <EdgeLabelRenderer>
    <div
      class="sw-edge-center nodrag nopan"
      :style="{ transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)` }"
    >
      <button
        type="button"
        class="sw-edge-insert"
        title="在此连线中插入节点"
        aria-label="在此连线中插入节点"
        @click.stop="handleInsert"
      >
        +
      </button>
      <span v-if="labelText" class="sw-edge-keyword" :title="labelText">{{ labelText }}</span>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.sw-edge-center {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: all;
  z-index: 1;
}

.sw-edge-insert {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid #c0c4cc;
  border-radius: 50%;
  background: #fff;
  color: #606266;
  font-size: 13px;
  line-height: 16px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.sw-edge-center:hover .sw-edge-insert {
  opacity: 1;
}

.sw-edge-insert:hover {
  border-color: var(--sw-color-primary, #7e306b);
  color: var(--sw-color-primary, #7e306b);
}

.sw-edge-keyword {
  padding: 1px 8px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e4e7ed;
  color: #606266;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.sw-edge-path .vue-flow__edge-path) {
  stroke: #b1b3bb;
  stroke-width: 1.5;
}

:deep(.sw-edge-path.is-selected .vue-flow__edge-path) {
  stroke: var(--sw-color-primary, #7e306b);
  stroke-width: 2;
}
</style>
