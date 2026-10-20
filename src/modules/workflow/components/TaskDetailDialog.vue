<script setup lang="ts">
/**
 * TaskDetailDialog — 任务详情/办理的统一弹窗外壳。
 *
 * 待办、已办、已办（新契约）等列表共用：弹窗内直接复用 TaskDetail 的
 * 表单数据、流程详情与审批区，不再跳转整页。办理完成后由列表刷新。
 */
import { useI18n } from '@/locales'
import BusinessDetailDialog from '@/components/business-detail/BusinessDetailDialog.vue'
import TaskDetail from '../views/TaskDetail.vue'

const { t } = useI18n()

withDefaults(
  defineProps<{
    modelValue: boolean
    taskId: string
    title?: string
  }>(),
  { title: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  completed: []
}>()

function onCompleted() {
  emit('update:modelValue', false)
  emit('completed')
}
</script>

<template>
  <BusinessDetailDialog
    :model-value="modelValue"
    :title="title || t('workflow.instanceDetail')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #task>
      <TaskDetail v-if="modelValue" :task-id="taskId" embedded @completed="onCompleted" />
    </template>
  </BusinessDetailDialog>
</template>
