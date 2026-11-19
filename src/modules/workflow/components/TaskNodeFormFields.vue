<script setup lang="ts">
import { useI18n } from '@/locales'
import DynamicField from '@/components/DynamicField.vue'
import type { FormSchema } from '@/contracts/form-schema'

/**
 * TaskNodeFormFields — P64 节点审批表单字段区。
 *
 * 并入审批区只呈现字段组件，不显示表单名称；草稿保存与模型由页面持有。
 */
defineProps<{
  fields: FormSchema['fields']
  data: Record<string, unknown>
  errors: string[]
  saving: boolean
  editable: boolean
  acting: string | null
  isReadonly: (field: FormSchema['fields'][number]) => boolean
}>()

const emit = defineEmits<{
  set: [name: string, value: unknown]
  saveDraft: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="approval-form">
    <div class="nodeform-fields">
      <div v-for="field in fields" :key="field.name" class="nodeform-field">
        <DynamicField
          :field="field"
          :model-value="data[field.name]"
          :readonly="isReadonly(field)"
          @update:model-value="emit('set', field.name, $event)"
        />
      </div>
    </div>
    <div v-if="errors.length > 0" class="nodeform-errors" role="alert">
      <p v-for="item in errors" :key="item">{{ item }}</p>
    </div>
    <div v-if="editable" class="nodeform-actions">
      <el-button
        size="small"
        :loading="saving"
        :disabled="acting !== null"
        @click="emit('saveDraft')"
      >
        保存草稿
      </el-button>
      <span class="nodeform-meta">{{ t('workflow.taskFormSubmitNote') }}</span>
    </div>
  </div>
</template>

<style scoped>
/* ─────────── P64 阶段Ⅰ：节点审批表单（并入审批区） ─────────── */
.approval-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.nodeform-meta {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
.nodeform-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  column-gap: 28px;
  row-gap: 14px;
}
.nodeform-errors {
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
}
.nodeform-errors p {
  margin: 2px 0;
}
.nodeform-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
