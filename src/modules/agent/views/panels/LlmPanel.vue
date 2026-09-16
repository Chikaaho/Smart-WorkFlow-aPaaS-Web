<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * LLM 节点属性面板：模型配置下拉 + 系统 Prompt + 用户 Prompt 模板 + 输入/输出变量名。
 * 写回统一 emit 上行：updateNodeData（模型配置/文本字段，空白删键语义在
 * GraphDesigner.updateNodeData）/ varNameChange（变量名，留空删键语义在
 * GraphDesigner.handleVarNameChange）。
 */
import {
  DEFAULT_VARIABLE_NAME,
  NODE_CONFIG_KEY_INPUT_VAR,
  NODE_CONFIG_KEY_MODEL_ID,
  NODE_CONFIG_KEY_OUTPUT_VAR,
  NODE_CONFIG_KEY_SYSTEM_PROMPT,
  NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE,
} from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'

/** 用户 Prompt 模板 hint 中的变量引用语法示例（避免模板内写 `{{ '{{xxx}}' }}` 触发解析错误） */
const VAR_SYNTAX_EXAMPLE = '{{variableName}}'

defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
  varNameChange: [key: string, value: unknown]
}>()

/** prompt 文本回写：空白 → emit undefined（GraphDesigner.updateNodeData 删键）；非空白原样 */
function onPromptChange(key: string, val: unknown) {
  const v = typeof val === 'string' ? val : ''
  emit('updateNodeData', key, v.trim() ? v : undefined)
}
</script>

<template>
  <div class="field-row">
    <div class="field-label">{{ t('agent.modelConfig') }}</div>
    <el-select
      :model-value="(node.data?.[NODE_CONFIG_KEY_MODEL_ID] as number | undefined) ?? null"
      :placeholder="t('agent.selectModelConfig')"
      style="width: 100%"
      @change="(v) => $emit('updateNodeData', NODE_CONFIG_KEY_MODEL_ID, v)"
    >
      <el-option
        v-for="m in modelOptions"
        :key="m.id"
        :label="t('common.nameWithCode', { name: m.name, code: m.modelName })"
        :value="m.id"
      />
    </el-select>
  </div>
  <div class="field-row">
    <div class="field-label">
      {{ t('agent.systemPromptLabel') }}
      <span class="field-hint">{{ t('agent.systemPromptHint') }}</span>
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
      <span class="field-hint">
        {{ t('agent.userPromptHintLead') }}
        <code v-text="VAR_SYNTAX_EXAMPLE" />
        {{ t('agent.userPromptHintTail') }}
      </span>
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

.field-hint {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  line-height: 1.4;
}

.field-hint code {
  background: var(--el-fill-color);
  padding: 0 4px;
  border-radius: 2px;
  font-family: monospace;
}
</style>
