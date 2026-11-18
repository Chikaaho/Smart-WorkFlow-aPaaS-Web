<script setup lang="ts">
import { useI18n } from '@/locales'
import DynamicField from '@/components/DynamicField.vue'
import type { OpinionField, OpinionFieldRenderApi } from '../composables/use-task-opinion-form'

/**
 * TaskOpinionFields — 审批意见字段渲染。
 *
 * 值访问/写入/必填校验经 api 属性复用页面同一份实现（use-task-opinion-form），
 * 组件不自建副本；字段显隐已在页面完成，这里只渲染可见字段。
 */
defineProps<{
  fields: OpinionField[]
  api: OpinionFieldRenderApi
}>()

const { t } = useI18n()
</script>

<template>
  <div class="opinion-form">
    <div
      v-for="field in fields"
      :key="field.key"
      class="opinion-field"
      :class="{ 'is-invalid': api.isInvalid(field.key) }"
    >
      <template v-if="field.type === 'NOTE'">
        <span class="opinion-note">{{ field.label }}</span>
      </template>
      <template v-else>
        <label :for="`opinion-${field.key}`">
          {{ field.label || field.key }}<span v-if="field.required" class="required-mark"> *</span>
        </label>
        <textarea
          v-if="field.type === 'TEXTAREA'"
          :id="`opinion-${field.key}`"
          :value="api.textOf(field)"
          :maxlength="field.maxLength"
          rows="3"
          @input="api.set(field.key, ($event.target as HTMLTextAreaElement).value)"
        />
        <DynamicField
          v-else-if="field.type === 'USER'"
          :field="{ name: field.key, type: 'USER', label: field.label }"
          :model-value="api.valueOf(field)"
          :show-label="false"
          @update:model-value="api.set(field.key, $event)"
        />
        <select
          v-else-if="field.type === 'SELECT'"
          :id="`opinion-${field.key}`"
          :value="String(api.valueOf(field) ?? '')"
          @change="api.set(field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('common.pleaseSelect') }}</option>
          <option v-for="option in field.options ?? []" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
        <div v-else-if="field.type === 'RADIO'" class="opinion-options">
          <label v-for="option in field.options ?? []" :key="option" class="opinion-option">
            <input
              :name="`opinion-${field.key}`"
              type="radio"
              :value="option"
              :checked="api.valueOf(field) === option"
              @change="api.set(field.key, option)"
            />
            {{ option }}
          </label>
        </div>
        <input
          v-else
          :id="`opinion-${field.key}`"
          :type="api.inputTypeOf(field)"
          :value="api.inputOf(field)"
          :min="field.min"
          :max="field.max"
          :maxlength="field.maxLength"
          @input="
            api.set(
              field.key,
              field.type === 'NUMBER'
                ? Number(($event.target as HTMLInputElement).value)
                : ($event.target as HTMLInputElement).value,
            )
          "
        />
      </template>
      <p v-if="api.isInvalid(field.key)" class="opinion-field__error" role="alert">
        {{ t('workflow.validationRequiredInline', { label: field.label || field.key }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.opinion-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.opinion-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0;
}
.opinion-field.is-invalid input,
.opinion-field.is-invalid textarea,
.opinion-field.is-invalid select {
  border-color: var(--el-color-danger);
}
.opinion-field__error {
  margin: 0;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 18px;
}
.opinion-field input,
.opinion-field textarea,
.opinion-field select {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
}
.opinion-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
/* 单选项整项不收缩、不换行：避免窄容器把“按计划执行”挤成逐字折行。 */
.opinion-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  white-space: nowrap;
}
.required-mark {
  color: var(--el-color-danger);
}
.opinion-note {
  color: var(--sw-text-secondary);
}
</style>
