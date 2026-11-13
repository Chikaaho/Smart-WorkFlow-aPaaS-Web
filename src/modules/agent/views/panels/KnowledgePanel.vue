<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
/**
 * KNOWLEDGE 节点属性面板（F1 阶段 3）：知识库、topK、相似度阈值、输入/输出变量。
 * 写回统一 emit 上行；面板自身零副作用。
 */
import {
  DEFAULT_VARIABLE_NAME,
  NODE_CONFIG_KEY_INPUT_VAR,
  NODE_CONFIG_KEY_KNOWLEDGE_BASE_ID,
  NODE_CONFIG_KEY_OUTPUT_VAR,
  NODE_CONFIG_KEY_SIMILARITY_THRESHOLD,
  NODE_CONFIG_KEY_TOP_K,
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

const { t } = useI18n()
</script>

<template>
  <div class="field-row">
    <div class="field-label">{{ t('agent.knowledgeBaseLabel') }}</div>
    <el-select
      :model-value="
        (node.data?.[NODE_CONFIG_KEY_KNOWLEDGE_BASE_ID] as string | number | undefined) ?? null
      "
      :placeholder="t('agent.knowledgeSelectBase')"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_KNOWLEDGE_BASE_ID, v)"
    >
      <el-option v-for="kb in knowledgeOptions" :key="kb.id" :label="kb.name" :value="kb.id" />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">{{ t('agent.knowledgeTopKShort') }}</div>
    <el-input-number
      :model-value="(node.data?.[NODE_CONFIG_KEY_TOP_K] as number | undefined) ?? 5"
      :min="1"
      :max="20"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_TOP_K, v)"
    />
  </div>
  <div class="field-row">
    <div class="field-label">{{ t('agent.knowledgeThreshold') }}</div>
    <el-input-number
      :model-value="(node.data?.[NODE_CONFIG_KEY_SIMILARITY_THRESHOLD] as number | undefined) ?? 0"
      :min="0"
      :max="1"
      :step="0.05"
      :precision="2"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_SIMILARITY_THRESHOLD, v)"
    />
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
