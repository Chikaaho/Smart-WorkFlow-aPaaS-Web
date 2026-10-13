<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ScriptConfig — BF20261013-021 表单字段「高级编辑（脚本）」配置面板。
 *
 * 脚本挂在当前字段上：值变化时执行；勾选「表单打开时也执行」后，装载/回显完成也执行一次。
 * 脚本里用 `#函数名(...)` 调用内置函数（裸字段名自动按名字处理，无需引号）。
 * 语法在输入时即时校验（编译不执行），不合法给出可读错误并在保存前拦截。
 */
import { computed } from 'vue'
import type { FieldPatch } from './field-config'
import type { FormSchemaField } from '@/contracts/form-schema'
import { validateFieldScript } from '@/modules/form/utils/field-scripts'

const props = defineProps<{
  field: FormSchemaField
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

const code = computed(() => props.field.script?.code ?? '')
const onLoad = computed(() => props.field.script?.onLoad ?? false)
const syntaxError = computed(() => (code.value.trim() ? validateFieldScript(code.value) : null))

/** 内置函数清单（展示 + 一键插入）。 */
const FUNCTIONS: { name: string; desc: string; snippet: string }[] = [
  { name: '获取字段值', desc: '读取另一字段的当前值', snippet: '#获取字段值(field_a)' },
  { name: '设置字段值', desc: '写入另一字段的值', snippet: '#设置字段值(field_b, "值")' },
  { name: '设置必填', desc: '切换必填（提交校验随之生效）', snippet: '#设置必填(field_b, true)' },
  { name: '设置隐藏', desc: '隐藏 / 显示字段', snippet: '#设置隐藏(field_b, true)' },
  { name: '设置只读', desc: '切换只读（不可编辑）', snippet: '#设置只读(field_b, true)' },
  { name: '提示消息', desc: '弹出提示消息', snippet: '#提示消息("提示内容")' },
  { name: '获取当前用户', desc: '当前登录用户 ID', snippet: '#获取当前用户()' },
  { name: '获取当前用户姓名', desc: '当前用户显示名', snippet: '#获取当前用户姓名()' },
  { name: '获取当前部门', desc: '当前用户部门 ID', snippet: '#获取当前部门()' },
]

function onCode(value: string) {
  updateScript(value, onLoad.value)
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

function insertSnippet(snippet: string) {
  const next = code.value.trim() ? `${code.value.replace(/\s*$/, '')}\n${snippet};` : `${snippet};`
  onCode(next)
}
</script>

<template>
  <h3 class="config__section">{{ t('form.scriptTitle') }}</h3>
  <div class="script">
    <el-input
      :model-value="code"
      type="textarea"
      :rows="4"
      class="script__code"
      :placeholder="t('form.scriptPlaceholder')"
      @update:model-value="onCode"
    />
    <el-checkbox :model-value="onLoad" @update:model-value="onOnLoad">
      {{ t('form.scriptOnLoad') }}
    </el-checkbox>
    <p v-if="syntaxError" class="script__error" role="alert">
      {{ t('form.scriptInvalid', { msg: syntaxError }) }}
    </p>
    <el-collapse class="script__help">
      <el-collapse-item :title="t('form.scriptFunctions')" name="fn">
        <div v-for="fn in FUNCTIONS" :key="fn.name" class="script__fn">
          <div class="script__fn-main">
            <code>#{{ fn.name }}</code>
            <span class="script__fn-desc">{{ fn.desc }}</span>
          </div>
          <el-button link size="small" @click="insertSnippet(fn.snippet)">
            {{ t('form.scriptInsert') }}
          </el-button>
        </div>
        <p class="script__hint">{{ t('form.scriptHint') }}</p>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.script {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script__code :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
}

.script__error {
  margin: 0;
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 16px;
}

.script__fn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 0;
}

.script__fn-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.script__fn-main code {
  font-size: 12px;
  color: var(--sw-primary, #6d5bd0);
}

.script__fn-desc {
  font-size: 11px;
  color: var(--sw-text-secondary, #8a8f9c);
}

.script__hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--sw-text-secondary, #8a8f9c);
  line-height: 16px;
}
</style>
