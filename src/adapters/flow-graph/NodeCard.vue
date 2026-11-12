<script setup lang="ts">
/**
 * flow-graph 自定义节点卡片（G1-2）。
 *
 * 适配层只认中性图标词汇（icon key）与展示元数据，不解释业务节点类型：
 * 业务层在 FlowGraphNode.presentation 里给出 icon/accent/summary/status，
 * 本组件只负责渲染。卡片视觉对齐流程设计器：白底圆角卡片、左侧图标、
 * 标题 + 一行摘要、选中高亮、运行状态色。
 */
import { computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { FLOW_PRESENTATION_KEY, type FlowNodePresentation, type FlowNodeStatus } from './types'

const props = defineProps<{
  id: string
  label?: unknown
  data?: Record<string, unknown>
  selected?: boolean
}>()

interface FlowCardActions {
  insertAfter: (target: { kind: 'node'; id: string }) => void
}

const actions = inject<FlowCardActions | null>('sw-flow-actions', null)

const presentation = computed<FlowNodePresentation>(() => {
  const raw = props.data?.[FLOW_PRESENTATION_KEY]
  return raw && typeof raw === 'object' ? (raw as FlowNodePresentation) : {}
})

const title = computed(() => (typeof props.label === 'string' && props.label ? props.label : ''))
const summary = computed(() =>
  typeof presentation.value.summary === 'string' ? presentation.value.summary : '',
)
const accent = computed(() => presentation.value.accent || 'var(--sw-color-primary, #7e306b)')
const status = computed<FlowNodeStatus>(() => presentation.value.status ?? 'idle')

const STATUS_TEXT: Record<FlowNodeStatus, string> = {
  idle: '',
  running: '运行中',
  success: '成功',
  failed: '失败',
  skipped: '跳过',
  waiting: '等待人工',
}

const statusText = computed(() => STATUS_TEXT[status.value])

/** 中性图标词汇 → 24×24 线性图标路径（业务类型由业务层映射为图标 key） */
const ICON_PATHS: Record<string, string> = {
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  spark: 'M12 3l2.2 5.4L20 10.5l-5.8 2.1L12 18l-2.2-5.4L4 10.5l5.8-2.1z',
  tool: 'M4 20l6-6m0 0a5 5 0 1 0 6-6l-3 3-3-3 3-3a5 5 0 0 0-6 6z',
  branch: 'M12 3v5M12 8l6 4-6 4-6-4 6-4zM12 16v5',
  loop: 'M4 12a8 8 0 0 1 13.7-5.7M20 6v5h-5M20 12a8 8 0 0 1-13.7 5.7M4 18v-5h5',
  fork: 'M6 4v16M6 12h12M18 8v8',
  join: 'M6 8v8M6 12h12M18 4v16',
  book: 'M5 4h14v16H5zM9 4v16',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0',
  subgraph: 'M4 4h7v7H4zM13 13h7v7h-7zM11 7h4v6',
  dot: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
}

const iconPath = computed(() => ICON_PATHS[presentation.value.icon ?? 'dot'] ?? ICON_PATHS.dot)

function handleInsert() {
  actions?.insertAfter({ kind: 'node', id: props.id })
}
</script>

<template>
  <div
    class="sw-node-card"
    :class="[`sw-node-card--${status}`, { 'is-selected': selected }]"
    :style="{ '--sw-node-accent': accent }"
    :data-node-id="id"
  >
    <Handle type="target" :position="Position.Left" class="sw-node-handle" />
    <div class="sw-node-card__icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path :d="iconPath" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <div class="sw-node-card__body">
      <div class="sw-node-card__title">{{ title }}</div>
      <div v-if="summary" class="sw-node-card__summary" :title="summary">{{ summary }}</div>
    </div>
    <span v-if="statusText" class="sw-node-card__status" :title="statusText">
      {{ statusText }}
    </span>
    <button
      type="button"
      class="sw-node-card__insert nodrag nopan"
      title="插入节点"
      aria-label="插入节点"
      @click.stop="handleInsert"
    >
      +
    </button>
    <Handle type="source" :position="Position.Right" class="sw-node-handle" />
  </div>
</template>

<style scoped>
.sw-node-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 168px;
  max-width: 240px;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-left: 3px solid var(--sw-node-accent);
  border-radius: 8px;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.06);
  font-size: 13px;
  color: #303133;
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}

.sw-node-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.sw-node-card.is-selected {
  border-color: var(--sw-node-accent);
  box-shadow:
    0 0 0 2px rgba(126, 48, 107, 0.16),
    0 4px 16px rgba(0, 0, 0, 0.08);
}

.sw-node-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--sw-node-accent) 12%, #fff);
  color: var(--sw-node-accent);
  flex: none;
}

.sw-node-card__icon svg {
  width: 15px;
  height: 15px;
}

.sw-node-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sw-node-card__title {
  font-weight: 600;
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sw-node-card__summary {
  font-size: 12px;
  line-height: 16px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}

.sw-node-handle {
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1.5px solid var(--sw-node-accent);
}

.sw-node-card__insert {
  position: absolute;
  right: -13px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid #dcdfe6;
  border-radius: 50%;
  background: #fff;
  color: #606266;
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.sw-node-card:hover .sw-node-card__insert {
  opacity: 1;
}

.sw-node-card__insert:hover {
  border-color: var(--sw-node-accent);
  color: var(--sw-node-accent);
}

.sw-node-card__status {
  position: absolute;
  top: -9px;
  right: 8px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  background: #f4f4f5;
  color: #909399;
  white-space: nowrap;
}

/* 运行状态色（G1-7：等待/运行中/成功/失败/跳过） */
.sw-node-card--running {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
  animation: sw-node-pulse 1.4s ease-in-out infinite;
}

.sw-node-card--running .sw-node-card__status {
  background: #e7effc;
  color: #2563eb;
}

.sw-node-card--success {
  border-color: #67c23a;
}

.sw-node-card--success .sw-node-card__status {
  background: #f0f9eb;
  color: #529b2e;
}

.sw-node-card--failed {
  border-color: #f56c6c;
}

.sw-node-card--failed .sw-node-card__status {
  background: #fef0f0;
  color: #c45656;
}

.sw-node-card--skipped {
  border-style: dashed;
  opacity: 0.72;
}

.sw-node-card--skipped .sw-node-card__status {
  background: #f4f4f5;
  color: #909399;
}

.sw-node-card--waiting {
  border-color: #e6a23c;
  border-style: dashed;
}

.sw-node-card--waiting .sw-node-card__status {
  background: #fdf6ec;
  color: #b88230;
}

@keyframes sw-node-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.08);
  }
}
</style>
