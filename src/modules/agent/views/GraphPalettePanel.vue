<script setup lang="ts">
/* global DragEvent */
import { useI18n } from '@/locales'
import { NODE_TYPE_ACCENTS, NODE_TYPE_ICONS } from '@/modules/agent/utils/node-presentation'
import { nodeTypeLabel } from '@/modules/agent/utils/graphAdapter'
import { PALETTE_GROUPS, PALETTE_ICON_PATHS } from './graph-palette-config'

/**
 * 节点面板（分组 + 图标 + 名称；点击/拖入添加，V1 对齐流程设计器节点库）。
 * 拖放起始与点击新增由宿主画布编排承接。
 */
defineProps<{
  dragStart: (type: string, event: DragEvent) => void
  addNode: (type: string) => void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="palette">
    <div v-for="group in PALETTE_GROUPS" :key="group.labelKey" class="palette-group">
      <div class="palette-title">{{ t(group.labelKey) }}</div>
      <div class="palette-grid">
        <button
          v-for="type in group.types"
          :key="type"
          type="button"
          class="palette-item"
          :style="{ '--sw-palette-accent': NODE_TYPE_ACCENTS[type] }"
          draggable="true"
          :data-node-type="type"
          @dragstart="dragStart(type, $event)"
          @click="addNode(type)"
        >
          <svg class="palette-item__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              :d="PALETTE_ICON_PATHS[NODE_TYPE_ICONS[type] ?? 'dot']"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="palette-item__name">{{ nodeTypeLabel(type) }}</span>
        </button>
      </div>
    </div>
    <div class="palette-hint">{{ t('agent.paletteDragHint') }}</div>
  </div>
</template>

<style scoped>
.palette {
  width: 168px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow-y: auto;
  flex: none;
}

.palette-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.palette-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 4px;
}

/* V1：图标 + 名称卡片，两列网格，风格对齐流程设计器节点库 */
.palette-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.palette-item:hover {
  border-color: var(--sw-palette-accent, var(--el-color-primary));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.palette-item__icon {
  width: 20px;
  height: 20px;
  stroke: var(--sw-palette-accent, var(--el-color-primary));
  stroke-width: 1.8;
}

.palette-item__name {
  font-size: 12px;
  line-height: 16px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.palette-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 16px;
  margin-top: auto;
}
</style>
