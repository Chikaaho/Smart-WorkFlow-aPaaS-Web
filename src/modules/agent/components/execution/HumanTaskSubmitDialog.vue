<script setup lang="ts">
/**
 * 人工任务提交弹窗（G3-2）：展示说明/字段/决策按钮，填写后提交。
 * 服务端校验处理人身份与单次提交；提交成功后执行自动恢复。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { submitHumanTask } from '@/modules/agent/api'
import type { AgentExecutionLifecycle } from '@/modules/agent/api'
import type { AgentHumanTask } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'

const props = defineProps<{
  modelValue: boolean
  task: AgentHumanTask | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submitted: [state: AgentExecutionLifecycle]
}>()

const { t } = useI18n()

const values = ref<Record<string, string>>({})
const decision = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const fields = computed(() => props.task?.fields ?? [])
const buttons = computed(() => props.task?.buttons ?? [])

watch(
  () => props.task,
  (task) => {
    values.value = {}
    decision.value = ''
    errorMessage.value = ''
    for (const field of task?.fields ?? []) {
      values.value[field.name] = ''
    }
  },
  { immediate: true },
)

function optionsOf(field: { options?: string }): string[] {
  return (field.options ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '')
}

function close() {
  emit('update:modelValue', false)
}

async function handleSubmit() {
  const task = props.task
  if (!task) return
  errorMessage.value = ''
  if (!decision.value) {
    errorMessage.value = t('agent.humanTaskDecisionRequired')
    return
  }
  for (const field of fields.value) {
    if (field.required && !String(values.value[field.name] ?? '').trim()) {
      errorMessage.value = t('agent.humanTaskFieldRequired', {
        name: field.label || field.name,
      })
      return
    }
  }
  submitting.value = true
  try {
    const state = await submitHumanTask(
      task.executionId,
      task.id,
      { ...values.value },
      decision.value,
    )
    emit('submitted', state)
    close()
  } catch (err) {
    errorMessage.value = err instanceof ApiError ? err.msg : t('agent.executionFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('agent.humanTaskSubmitTitle')"
    width="520px"
    @update:model-value="(v) => emit('update:modelValue', Boolean(v))"
  >
    <template v-if="task">
      <div class="human-task-meta">
        <span>{{ t('agent.humanTaskExecution') }} #{{ task.executionId }}</span>
        <span>{{ t('agent.humanTaskNode') }} {{ task.nodeId }}</span>
        <span v-if="task.timeoutSeconds">
          {{ t('agent.humanTaskTimeoutLabel', { seconds: task.timeoutSeconds }) }}
        </span>
      </div>
      <div v-if="task.instructions" class="human-task-instructions">
        {{ task.instructions }}
      </div>

      <div v-for="field in fields" :key="field.name" class="human-task-field">
        <div class="human-task-field__label">
          {{ field.label || field.name }}
          <span v-if="field.required" class="required">*</span>
        </div>
        <el-select
          v-if="field.type === 'select'"
          v-model="values[field.name]"
          size="small"
          style="width: 100%"
        >
          <el-option v-for="opt in optionsOf(field)" :key="opt" :label="opt" :value="opt" />
        </el-select>
        <el-input
          v-else
          v-model="values[field.name]"
          size="small"
          :type="field.type === 'number' ? 'number' : 'text'"
        />
      </div>

      <div class="human-task-field">
        <div class="human-task-field__label">{{ t('agent.humanButtonsTitle') }}</div>
        <el-radio-group v-model="decision">
          <el-radio-button v-for="button in buttons" :key="button.keyword" :value="button.keyword">
            {{ button.label || button.keyword }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
        class="human-task-error"
      />
    </template>

    <template #footer>
      <el-button size="small" @click="close">{{ t('common.cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="submitting" @click="handleSubmit">
        {{ t('agent.humanTaskSubmit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.human-task-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.human-task-instructions {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 12px;
  line-height: 20px;
  white-space: pre-wrap;
}

.human-task-field {
  margin-bottom: 12px;
}

.human-task-field__label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.required {
  color: var(--el-color-danger);
}

.human-task-error {
  margin-top: 8px;
}
</style>
