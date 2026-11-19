<script setup lang="ts">
import { useI18n } from '@/locales'
import type { AgentGraphExecuteResp, AgentHumanTask } from '@/contracts/agent'
import type { StartParam } from '@/modules/agent/utils/graphAdapter'

/**
 * 执行测试面板（结果不落库，刷新即失）：入参行/结构化参数表单、
 * 生命周期状态、等待人工卡与执行结果告警（LC023-03 终态样式契约）。
 */
defineProps<{
  executeInput: string
  executing: boolean
  executeResult: AgentGraphExecuteResp | null
  lifecycleStatus: string
  lifecycleStatusLabel: string
  startParams: StartParam[]
  streamedOutput: string
  showExecutionLatency: boolean
  executeAlertType: 'success' | 'info' | 'error'
  executeAlertTitle: string
  waitingHumanTask: AgentHumanTask | null
  waitingAssigneeLabel: string
  paramValue: (name: string) => string | boolean
}>()

const emit = defineEmits<{
  'update:executeInput': [value: string]
  'set-param-value': [name: string, value: string | boolean]
  execute: []
  'cancel-execution': []
  'view-detail': []
  'open-human-task-dialog': []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="execute-panel">
    <div class="execute-row">
      <span class="execute-label">{{ t('agent.runTest') }}</span>
      <el-input
        v-if="startParams.length === 0"
        :model-value="executeInput"
        :placeholder="t('agent.testTextPlaceholder')"
        style="width: 360px"
        size="small"
        @update:model-value="emit('update:executeInput', String($event))"
      />
      <span v-else class="execute-label">{{ t('agent.structuredInputsTitle') }}</span>
      <el-button type="primary" size="small" :loading="executing" @click="emit('execute')">
        {{ t('agent.run') }}
      </el-button>
      <el-button
        v-if="executing && executeResult?.executionId"
        type="danger"
        plain
        size="small"
        @click="emit('cancel-execution')"
      >
        取消执行
      </el-button>
      <el-tag v-if="lifecycleStatus" type="info" size="small">
        {{ lifecycleStatusLabel }}
      </el-tag>
    </div>
    <!-- G3-6：等待人工处理，直接在当前页提交 -->
    <div v-if="lifecycleStatus === 'WAITING_HUMAN'" class="human-waiting-card">
      <div class="human-waiting-card__text">
        <div class="human-waiting-card__title">
          {{ t('agent.humanWaitingFor', { assignee: waitingAssigneeLabel }) }}
        </div>
        <div v-if="waitingHumanTask?.instructions" class="human-waiting-card__hint">
          {{ waitingHumanTask.instructions }}
        </div>
        <div v-else-if="waitingHumanTask" class="human-waiting-card__hint">
          {{ t('agent.humanTaskNode') }}：{{ waitingHumanTask.nodeId }}
        </div>
      </div>
      <el-button
        v-if="waitingHumanTask"
        size="small"
        type="primary"
        @click="emit('open-human-task-dialog')"
      >
        {{ t('agent.humanInboxOpen') }}
      </el-button>
    </div>
    <!-- G1-4：开始节点参数声明 → 结构化入参表单 -->
    <div v-if="startParams.length > 0" class="params-form">
      <div v-for="param in startParams" :key="param.name" class="param-field">
        <span class="param-field__label">
          {{ param.name }}<span v-if="param.required" class="param-required">*</span>
        </span>
        <el-switch
          v-if="param.type === 'boolean'"
          :model-value="paramValue(param.name) === true"
          @update:model-value="(value) => emit('set-param-value', param.name, value === true)"
        />
        <el-input
          v-else
          :model-value="String(paramValue(param.name) ?? '')"
          :type="param.type === 'json' ? 'textarea' : 'text'"
          :rows="param.type === 'json' ? 2 : undefined"
          :placeholder="param.description || t('agent.nodeRunInputPlaceholder')"
          size="small"
          style="width: 280px"
          @update:model-value="(value) => emit('set-param-value', param.name, String(value))"
        />
      </div>
    </div>
    <el-alert
      v-if="executeResult"
      :title="executeAlertTitle"
      :type="executeAlertType"
      :closable="false"
      show-icon
      class="execute-result"
    >
      <template v-if="executeResult.output || streamedOutput">
        <div class="stream-output">
          {{ t('agent.outputLabel', { output: executeResult.output || streamedOutput }) }}
        </div>
      </template>
      <template v-else-if="!executeResult.success && executeResult.errorMessage">
        <div>{{ t('agent.reasonLabel', { errorMessage: executeResult.errorMessage }) }}</div>
      </template>
      <!-- B2/G3：耗时只在成功/失败终态展示；取消/中断与运行中不显示 -->
      <div v-if="showExecutionLatency" class="execute-meta">
        {{ t('agent.latencyLabel', { latencyMs: executeResult.latencyMs }) }}
      </div>
      <div v-if="executeResult.executionId" class="execute-detail-link">
        <el-button size="small" link type="primary" @click="emit('view-detail')">
          {{ t('agent.viewExecution') }}
        </el-button>
      </div>
    </el-alert>
  </div>
</template>

<style scoped>
.human-waiting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  margin-top: 8px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 4px;
}

.human-waiting-card__title {
  font-size: 13px;
  font-weight: 600;
}

.human-waiting-card__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.execute-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
}

.params-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 10px;
}

.param-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-field__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.param-required {
  color: var(--el-color-danger);
  margin-left: 2px;
}

.execute-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.execute-label {
  font-size: 13px;
  font-weight: 600;
}

.execute-result {
  margin-top: 8px;
}

.execute-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.execute-detail-link {
  margin-top: 4px;
}
</style>
