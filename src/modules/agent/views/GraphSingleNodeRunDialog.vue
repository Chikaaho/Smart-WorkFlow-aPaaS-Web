<script setup lang="ts">
import { useI18n } from '@/locales'
import type { AgentNodeRunResult } from '@/modules/agent/api'

/** 单节点运行对话框（G1-8 调试语义，不产生正式执行记录）。 */
defineProps<{
  variableNames: string[]
  inputs: Record<string, string>
  result: AgentNodeRunResult | null
  running: boolean
}>()

const emit = defineEmits<{
  'update-input': [name: string, value: string]
  confirm: []
}>()

const visible = defineModel<boolean>('visible', { required: true })

const { t } = useI18n()
</script>

<template>
  <el-dialog v-model="visible" :title="t('agent.runNode')" width="480px">
    <div class="insert-hint">{{ t('agent.runNodeHint') }}</div>
    <div class="panel-field__label">{{ t('agent.nodeRunInputsTitle') }}</div>
    <div v-for="name in variableNames" :key="name" class="single-run-field">
      <span class="single-run-field__name">{{ name }}</span>
      <el-input
        :model-value="inputs[name]"
        size="small"
        :placeholder="t('agent.nodeRunInputPlaceholder')"
        @update:model-value="emit('update-input', name, String($event))"
      />
    </div>
    <el-alert
      v-if="result"
      :title="result.success ? t('agent.nodeStatusSuccess') : t('agent.nodeStatusFailed')"
      :type="result.success ? 'success' : 'error'"
      :closable="false"
      show-icon
      class="execute-result"
    >
      <div v-if="result.output" class="node-run-text">
        {{ result.output }}
      </div>
      <div v-if="result.errorMessage" class="node-run-text node-run-error">
        {{ result.errorMessage }}
      </div>
      <div class="execute-meta">{{ t('agent.nodeRunLatency') }}：{{ result.latencyMs }}ms</div>
    </el-alert>
    <template #footer>
      <el-button size="small" @click="visible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button size="small" type="primary" :loading="running" @click="emit('confirm')">
        {{ t('agent.run') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.insert-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.panel-field__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.single-run-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.single-run-field__name {
  width: 110px;
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.node-run-text {
  margin: 4px 0;
  padding: 6px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.node-run-error {
  color: var(--el-color-danger);
}

.execute-result {
  margin-top: 8px;
}

.execute-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
