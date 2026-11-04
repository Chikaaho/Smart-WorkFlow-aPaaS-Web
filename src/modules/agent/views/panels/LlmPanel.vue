<script setup lang="ts">
import { computed } from 'vue'
import HintTip from '@/components/HintTip.vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * LLM 节点属性面板（阶段 2）：
 * 供应商 → 模型两级选择（只列出启用供应商下的启用模型），可挂载工具
 * （节点内工具调用循环），以及系统 Prompt / 用户 Prompt 模板 / 输入输出变量名。
 * 写回统一 emit 上行；空白删键语义在 GraphDesigner.updateNodeData。
 */
import {
  DEFAULT_VARIABLE_NAME,
  NODE_CONFIG_KEY_INPUT_VAR,
  NODE_CONFIG_KEY_MODEL_ID,
  NODE_CONFIG_KEY_OUTPUT_VAR,
  NODE_CONFIG_KEY_PROVIDER_ID,
  NODE_CONFIG_KEY_SYSTEM_PROMPT,
  NODE_CONFIG_KEY_TOOL_NAMES,
  NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE,
} from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'
import type { AgentModelConfigOption } from '@/contracts/agent'

const props = defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
  varNameChange: [key: string, value: unknown]
}>()

/** 变量引用语法示例：悬停展示，避免模板内写 `{{ '{{xxx}}' }}` 触发解析错误。 */
const userPromptHint = computed(
  () => `${t('agent.userPromptHintLead')} {{variableName}} ${t('agent.userPromptHintTail')}`,
)

/** 供应商选项：从可选模型反推（后端只返回启用供应商下的启用模型）。 */
const providerOptions = computed(() => {
  const map = new Map<string, string>()
  for (const model of props.modelOptions) {
    if (model.providerId !== undefined) {
      map.set(String(model.providerId), model.providerName ?? `#${model.providerId}`)
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
})

/** 当前供应商：优先节点配置；旧图无 providerId 时按已选模型归属回显。 */
const selectedProviderId = computed<string | null>(() => {
  const configured = props.node.data?.[NODE_CONFIG_KEY_PROVIDER_ID]
  if (typeof configured === 'number' || typeof configured === 'string') return String(configured)
  const modelId = props.node.data?.[NODE_CONFIG_KEY_MODEL_ID]
  const model = props.modelOptions.find((m) => String(m.id) === String(modelId))
  return model?.providerId !== undefined ? String(model.providerId) : null
})

const providerModels = computed<AgentModelConfigOption[]>(() => {
  const providerId = selectedProviderId.value
  if (providerId === null) return []
  return props.modelOptions.filter((m) => String(m.providerId) === providerId)
})

const selectedToolNames = computed<string[]>(() => {
  const configured = props.node.data?.[NODE_CONFIG_KEY_TOOL_NAMES]
  if (Array.isArray(configured)) return configured.filter((v): v is string => typeof v === 'string')
  if (typeof configured === 'string' && configured.trim()) {
    return configured
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
})

function onProviderChange(providerId: string | null) {
  emit('updateNodeData', NODE_CONFIG_KEY_PROVIDER_ID, providerId ?? undefined)
  const currentModelId = props.node.data?.[NODE_CONFIG_KEY_MODEL_ID]
  const stillValid = props.modelOptions.some(
    (m) => String(m.id) === String(currentModelId) && String(m.providerId) === String(providerId),
  )
  if (!stillValid) {
    emit('updateNodeData', NODE_CONFIG_KEY_MODEL_ID, undefined)
  }
}

function onToolsChange(toolNames: string[]) {
  emit('updateNodeData', NODE_CONFIG_KEY_TOOL_NAMES, toolNames.length ? toolNames : undefined)
}

/** prompt 文本回写：空白 → emit undefined（GraphDesigner.updateNodeData 删键）；非空白原样 */
function onPromptChange(key: string, val: unknown) {
  const v = typeof val === 'string' ? val : ''
  emit('updateNodeData', key, v.trim() ? v : undefined)
}
</script>

<template>
  <div class="field-row">
    <div class="field-label">{{ t('agent.modelProviderLabel') }}</div>
    <el-select
      :model-value="selectedProviderId"
      :placeholder="t('agent.selectProviderFirst')"
      style="width: 100%"
      @change="onProviderChange"
    >
      <el-option v-for="p in providerOptions" :key="p.id" :label="p.name" :value="p.id" />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">{{ t('agent.modelConfig') }}</div>
    <el-select
      :model-value="(node.data?.[NODE_CONFIG_KEY_MODEL_ID] as number | undefined) ?? null"
      :placeholder="t('agent.selectModelConfig')"
      :disabled="selectedProviderId === null"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_MODEL_ID, v)"
    >
      <el-option
        v-for="m in providerModels"
        :key="m.id"
        :label="t('common.nameWithCode', { name: m.name, code: m.modelName })"
        :value="m.id"
      />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">
      {{ t('agent.llmToolsLabel') }}
      <HintTip :content="t('agent.llmToolsHint')" />
    </div>
    <el-select
      :model-value="selectedToolNames"
      multiple
      collapse-tags
      :placeholder="t('agent.llmToolsLabel')"
      style="width: 100%"
      @change="onToolsChange"
    >
      <el-option
        v-for="tool in toolOptions"
        :key="tool.toolName"
        :label="t('agent.toolOptionLabel', { toolName: tool.toolName, source: tool.source })"
        :value="tool.toolName"
      />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">
      {{ t('agent.systemPromptLabel') }}
    </div>
    <el-input
      :model-value="(node.data?.[NODE_CONFIG_KEY_SYSTEM_PROMPT] as string | undefined) ?? ''"
      type="textarea"
      :rows="4"
      :placeholder="t('agent.systemPromptEmptyHint')"
      maxlength="4000"
      @change="(v) => onPromptChange(NODE_CONFIG_KEY_SYSTEM_PROMPT, v)"
    />
  </div>
  <div class="field-row">
    <div class="field-label">
      {{ t('agent.userPromptLabel') }}
      <HintTip :content="userPromptHint" />
    </div>
    <el-input
      :model-value="(node.data?.[NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE] as string | undefined) ?? ''"
      type="textarea"
      :rows="4"
      :placeholder="t('agent.userPromptPlaceholder')"
      maxlength="4000"
      @change="(v) => onPromptChange(NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE, v)"
    />
  </div>
  <div class="field-row">
    <div class="field-label">{{ t('agent.inputVariableName') }}</div>
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
