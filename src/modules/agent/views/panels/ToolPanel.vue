<script setup lang="ts">
/**
 * TOOL 节点属性面板：工具下拉（internal/external 合并，value=toolName 精确值）
 * + 输入/输出变量名。写回统一 emit 上行：updateNodeData（工具）/ varNameChange（变量名）。
 */
import {
  DEFAULT_VARIABLE_NAME,
  NODE_CONFIG_KEY_INPUT_VAR,
  NODE_CONFIG_KEY_OUTPUT_VAR,
  NODE_CONFIG_KEY_TOOL_NAME,
} from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()

defineEmits<{
  updateNodeData: [key: string, value: unknown]
  varNameChange: [key: string, value: unknown]
}>()
</script>

<template>
  <div class="field-row">
    <div class="field-label">工具</div>
    <el-select
      :model-value="(node.data?.[NODE_CONFIG_KEY_TOOL_NAME] as string | undefined) ?? null"
      placeholder="选择工具"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_TOOL_NAME, v)"
    >
      <el-option
        v-for="t in toolOptions"
        :key="`${t.source}:${t.toolName}`"
        :label="`${t.toolName}（${t.source === 'internal' ? '内部' : '外部'}）`"
        :value="t.toolName"
      />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">输入变量名</div>
    <el-input
      :model-value="(node.data?.[NODE_CONFIG_KEY_INPUT_VAR] as string | undefined) ?? ''"
      :placeholder="`留空 = 默认变量 ${DEFAULT_VARIABLE_NAME}`"
      @change="(v) => $emit('varNameChange', NODE_CONFIG_KEY_INPUT_VAR, v)"
    />
  </div>
  <div class="field-row">
    <div class="field-label">输出变量名</div>
    <el-input
      :model-value="(node.data?.[NODE_CONFIG_KEY_OUTPUT_VAR] as string | undefined) ?? ''"
      :placeholder="`留空 = 默认变量 ${DEFAULT_VARIABLE_NAME}`"
      @change="(v) => $emit('varNameChange', NODE_CONFIG_KEY_OUTPUT_VAR, v)"
    />
  </div>
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
