<script setup lang="ts">
/**
 * 字段校验规则弹窗（设计节点 273:1845）。
 *
 * 把原先内联在属性面板里的最小/最大长度、正则、提示收进独立弹窗：
 * 本地草稿编辑，确认才回写同一字段；取消/关闭不应用。
 */
import { computed, reactive, watch } from 'vue'
import { useI18n } from '@/locales'
import type { DesignerItem } from './types'
import type { FieldPatch } from './field-config'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    field: DesignerItem | null
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [patch: FieldPatch]
}>()

const draft = reactive<{
  length?: number
  minLength?: number
  pattern: string
  patternMessage: string
}>({
  length: undefined,
  minLength: undefined,
  pattern: '',
  patternMessage: '',
})

/** 最大长度只属于 TEXT；RICH_TEXT 保留其余三项。 */
const showMaxLength = computed(() => props.field?.field.type === 'TEXT')

function loadDraft() {
  const source = props.field?.field as
    | { length?: number; minLength?: number; pattern?: string; patternMessage?: string }
    | undefined
  draft.length = source?.length
  draft.minLength = source?.minLength
  draft.pattern = source?.pattern ?? ''
  draft.patternMessage = source?.patternMessage ?? ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) loadDraft()
  },
  { immediate: true },
)

function close() {
  emit('update:modelValue', false)
}

function confirm() {
  if (!props.field || props.readonly) return
  const patch: FieldPatch = {
    minLength: draft.minLength,
    pattern: draft.pattern || undefined,
    patternMessage: draft.patternMessage || undefined,
  }
  if (showMaxLength.value) patch.length = draft.length
  emit('confirm', patch)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('form.fieldValidationRules')"
    class="field-validation-dialog"
    width="720px"
    align-center
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="fv-grid">
      <div class="fv-field">
        <label class="fv-field__label">{{ t('form.minLength') }}</label>
        <el-input-number
          v-model="draft.minLength"
          class="fv-field__control"
          data-testid="fv-min"
          :min="0"
          :controls="true"
          :placeholder="t('form.notSet')"
        />
      </div>
      <div v-if="showMaxLength" class="fv-field">
        <label class="fv-field__label">{{ t('form.maxLength') }}</label>
        <el-input-number
          v-model="draft.length"
          class="fv-field__control"
          data-testid="fv-max"
          :min="1"
          :controls="true"
          :placeholder="t('form.notSet')"
        />
      </div>
      <div class="fv-field">
        <label class="fv-field__label">{{ t('form.patternExpression') }}</label>
        <el-input
          v-model="draft.pattern"
          data-testid="fv-pattern"
          maxlength="512"
          :placeholder="t('form.notSet')"
        />
      </div>
      <div class="fv-field">
        <label class="fv-field__label">{{ t('form.patternMessage') }}</label>
        <el-input
          v-model="draft.patternMessage"
          data-testid="fv-message"
          maxlength="200"
          :placeholder="t('form.patternMessagePlaceholder')"
        />
      </div>
    </div>

    <template #footer>
      <el-button :disabled="readonly" @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="readonly" @click="confirm">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.fv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}
.fv-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}
.fv-field__label {
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}
.fv-field__control {
  width: 100%;
}
</style>

<style>
/* 设计节点 273:1845：720×282，四字段 2×2，底部右对齐取消/确定。 */
.field-validation-dialog.el-dialog {
  box-sizing: border-box;
  display: flex;
  height: 282px;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  /* 本弹窗作用域默认细边框，不覆盖焦点/危险/禁用 */
  --el-border-color: #dde3ef;
  --el-input-border-color: #dde3ef;
}
.field-validation-dialog .el-dialog__header {
  box-sizing: border-box;
  margin: 0 0 20px;
  padding: 28px 25px 0;
}
.field-validation-dialog .el-dialog__title {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 24px;
}
.field-validation-dialog .el-dialog__headerbtn {
  top: 24px;
  right: 24px;
  width: 32px;
  height: 32px;
}
.field-validation-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 25px;
}
.field-validation-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin: 0;
  padding: 18px 25px 26px;
}
.field-validation-dialog .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
</style>
