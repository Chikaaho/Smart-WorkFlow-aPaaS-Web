<script setup lang="ts">
import { useI18n } from '@/locales'
import { NODE_TYPE_ACCENTS, NODE_TYPE_ICONS } from '@/modules/agent/utils/node-presentation'
import { nodeTypeLabel } from '@/modules/agent/utils/graphAdapter'
import { INSERT_GROUPS, PALETTE_ICON_PATHS } from './graph-palette-config'

/** 插入节点类型选择对话框（「+」插入，按分组展示、剔除开始/结束）。 */
defineProps<{
  hint: string
}>()

const emit = defineEmits<{
  confirm: [type: string]
}>()

const visible = defineModel<boolean>('visible', { required: true })

const { t } = useI18n()
</script>

<template>
  <el-dialog v-model="visible" :title="t('agent.insertNodeTitle')" width="520px">
    <div class="insert-hint">{{ hint }}</div>
    <div v-for="group in INSERT_GROUPS" :key="group.labelKey" class="insert-group">
      <div class="insert-group__title">{{ t(group.labelKey) }}</div>
      <div class="insert-grid">
        <button
          v-for="type in group.types"
          :key="type"
          type="button"
          class="insert-item"
          :style="{ '--sw-palette-accent': NODE_TYPE_ACCENTS[type] }"
          @click="emit('confirm', type)"
        >
          <svg class="insert-item__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              :d="PALETTE_ICON_PATHS[NODE_TYPE_ICONS[type] ?? 'dot']"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="insert-item__name">{{ nodeTypeLabel(type) }}</span>
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.insert-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.insert-group + .insert-group {
  margin-top: 10px;
}

.insert-group__title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.insert-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

/* V1：插入对话框与节点面板同一「图标 + 名称」卡片风格 */
.insert-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.insert-item:hover {
  border-color: var(--sw-palette-accent, var(--el-color-primary));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.insert-item__icon {
  width: 22px;
  height: 22px;
  stroke: var(--sw-palette-accent, var(--el-color-primary));
  stroke-width: 1.8;
}

.insert-item__name {
  font-size: 12px;
  line-height: 16px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}
</style>
