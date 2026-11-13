<script setup lang="ts">
/**
 * 变量选择器（G1-5）：按上游节点分组列出可用变量。
 * 只负责展示与回传引用文本，插入行为由使用方面板决定。
 */
import { ref } from 'vue'
import { useI18n } from '@/locales'
import type { VariableGroup } from '@/modules/agent/utils/variableReferences'

defineProps<{
  groups: VariableGroup[]
}>()

const emit = defineEmits<{
  pick: [reference: string]
}>()

const { t } = useI18n()
const visible = ref(false)

function pick(reference: string) {
  visible.value = false
  emit('pick', reference)
}
</script>

<template>
  <el-popover v-model:visible="visible" placement="bottom-end" :width="280" trigger="click">
    <template #reference>
      <el-button size="small" link type="primary" class="variable-picker-trigger">
        {{ t('agent.insertVariable') }}
      </el-button>
    </template>
    <div class="variable-picker">
      <template v-if="groups.length > 0">
        <div v-for="group in groups" :key="group.nodeId" class="variable-group">
          <div class="variable-group__label">{{ group.label }}</div>
          <button
            v-for="variable in group.variables"
            :key="variable.reference"
            type="button"
            class="variable-item"
            @click="pick(variable.reference)"
          >
            {{ variable.reference }}
          </button>
        </div>
      </template>
      <div v-else class="variable-empty">{{ t('agent.noUpstreamVariables') }}</div>
    </div>
  </el-popover>
</template>

<style scoped>
.variable-picker {
  max-height: 280px;
  overflow-y: auto;
}

.variable-group + .variable-group {
  margin-top: 8px;
}

.variable-group__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.variable-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-family: var(--el-font-family-mono, monospace);
  cursor: pointer;
}

.variable-item:hover {
  background: var(--el-fill-color-light);
  color: var(--sw-color-primary, #7e306b);
}

.variable-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.variable-picker-trigger {
  padding: 0;
  height: auto;
}
</style>
