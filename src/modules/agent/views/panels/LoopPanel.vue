<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * LOOP 节点属性面板：最大迭代次数数字输入（Integer ≥1，空值/非法删键、<1 提示不写入、
 * 缺省后端默认 10 的语义全部在 GraphDesigner.handleMaxIterationsChange）。
 */
import { NODE_CONFIG_KEY_MAX_ITERATIONS } from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()

defineEmits<{
  maxIterationsChange: [value: unknown]
}>()
</script>

<template>
  <div class="field-row">
    <div class="field-label">{{ t('agent.maxIterations') }}</div>
    <el-input
      :model-value="String(node.data?.[NODE_CONFIG_KEY_MAX_ITERATIONS] ?? '')"
      type="number"
      min="1"
      :placeholder="t('agent.maxIterationsPlaceholder')"
      @change="(v) => $emit('maxIterationsChange', v)"
    />
  </div>
  <el-alert :title="t('agent.loopPanelHint')" type="info" :closable="false" show-icon />
</template>

<style scoped>
.field-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.field-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
