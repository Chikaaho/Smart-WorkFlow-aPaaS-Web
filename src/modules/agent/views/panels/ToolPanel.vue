<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
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
import VariablePicker from './VariablePicker.vue'

const props = defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
  varNameChange: [key: string, value: unknown]
}>()

const variableGroups = computed(() => props.variableGroups ?? [])

/** 上游变量名回填 inputVar（G1-5；节点作用域取点后的变量名） */
function onPickInputVar(reference: string) {
  const raw = reference.replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
  const name = raw.includes('.') ? raw.slice(raw.indexOf('.') + 1) : raw
  emit('varNameChange', NODE_CONFIG_KEY_INPUT_VAR, name)
}
</script>

<template>
  <div class="field-row">
    <div class="field-label">{{ t('agent.toolLabel') }}</div>
    <el-select
      :model-value="(node.data?.[NODE_CONFIG_KEY_TOOL_NAME] as string | undefined) ?? null"
      :placeholder="t('agent.selectTool')"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_TOOL_NAME, v)"
    >
      <el-option
        v-for="tool in toolOptions"
        :key="`${tool.source}:${tool.toolName}`"
        :label="
          t('common.nameWithCode', {
            name: tool.toolName,
            code: tool.source === 'internal' ? t('common.internal') : t('common.external'),
          })
        "
        :value="tool.toolName"
      />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">
      {{ t('agent.inputVariableName') }}
      <VariablePicker :groups="variableGroups" @pick="onPickInputVar" />
    </div>
    <el-input
      :model-value="(node.data?.[NODE_CONFIG_KEY_INPUT_VAR] as string | undefined) ?? ''"
      :placeholder="t('agent.varNamePlaceholder', { DEFAULT_VARIABLE_NAME })"
      @change="(v) => $emit('varNameChange', NODE_CONFIG_KEY_INPUT_VAR, v)"
    />
  </div>
  <div class="field-row">
    <div class="field-label">{{ t('agent.outputVariableName') }}</div>
    <el-input
      :model-value="(node.data?.[NODE_CONFIG_KEY_OUTPUT_VAR] as string | undefined) ?? ''"
      :placeholder="t('agent.varNamePlaceholder', { DEFAULT_VARIABLE_NAME })"
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
