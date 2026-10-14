<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ScriptConfig — BF20261013-021/022 表单字段「高级编辑（脚本）」配置面板。
 *
 * 脚本挂在当前字段上：值变化时执行；勾选「表单打开时也执行」后，装载/回显完成也执行一次。
 * BF20261013-022②：脚本改经统一弹窗编辑（左侧分类函数、点击插入、问号悬停说明），
 * 面板内保留只读预览、即时语法校验与 onLoad 勾选。
 */
import { computed, ref } from 'vue'
import type { FieldPatch } from './field-config'
import type { FormSchemaField } from '@/contracts/form-schema'
import { validateFieldScript } from '@/modules/form/utils/field-scripts'
import ScriptDialog from '@/components/ScriptDialog.vue'
import { FORM_SCRIPT_FUNCTIONS } from '@/components/script-catalog'

const props = defineProps<{
  field: FormSchemaField
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

const code = computed(() => props.field.script?.code ?? '')
const onLoad = computed(() => props.field.script?.onLoad ?? false)
const syntaxError = computed(() => (code.value.trim() ? validateFieldScript(code.value) : null))

const dialogVisible = ref(false)

function previewText(codeText: string): string {
  const trimmed = codeText.trim()
  if (!trimmed) return ''
  const firstLine = trimmed.split('\n')[0] ?? ''
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine
}

function onDialogSave(next: string) {
  updateScript(next, onLoad.value)
}

function onOnLoad(value: string | number | boolean) {
  updateScript(code.value, Boolean(value))
}

function updateScript(nextCode: string, nextOnLoad: boolean) {
  const trimmed = nextCode.trim()
  if (!trimmed) {
    emit('update', { script: undefined })
    return
  }
  emit('update', { script: nextOnLoad ? { code: nextCode, onLoad: true } : { code: nextCode } })
}
</script>

<template>
  <h3 class="config__section">{{ t('form.scriptTitle') }}</h3>
  <div class="script">
    <div class="script__preview" data-testid="script-preview">
      <span v-if="previewText(code)" class="script__preview-code">{{ previewText(code) }}</span>
      <span v-else class="script__preview-empty">{{ t('form.scriptEmpty') }}</span>
    </div>
    <el-button class="script__edit" @click="dialogVisible = true">
      {{ code.trim() ? t('form.scriptEdit') : t('form.scriptWrite') }}
    </el-button>
    <el-checkbox :model-value="onLoad" @update:model-value="onOnLoad">
      {{ t('form.scriptOnLoad') }}
    </el-checkbox>
    <p v-if="syntaxError" class="script__error" role="alert">
      {{ t('form.scriptInvalid', { msg: syntaxError }) }}
    </p>
    <ScriptDialog
      v-model:visible="dialogVisible"
      :title="t('form.scriptDialogTitle')"
      :code="code"
      :functions="FORM_SCRIPT_FUNCTIONS"
      :placeholder="t('form.scriptPlaceholder')"
      @save="onDialogSave"
    />
  </div>
</template>

<style scoped>
.script {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script__preview {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 6px 8px;
  min-height: 30px;
  background: #fafafd;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 17px;
  word-break: break-all;
}

.script__preview-code {
  color: var(--el-text-color-regular);
}

.script__preview-empty {
  color: var(--el-text-color-placeholder);
}

.script__error {
  margin: 0;
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 16px;
}
</style>
