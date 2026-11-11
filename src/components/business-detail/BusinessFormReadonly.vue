<script setup lang="ts">
/**
 * BusinessFormReadonly — 有流程业务表单的只读展示唯一实现。
 *
 * 任务详情、抄送详情等页面共用：按表单定义渲染业务字段标签与控件，
 * 不把内部字段名（field_xxx）或原始 JSON 直接暴露给业务用户。
 */
import { computed, ref, watch } from 'vue'
import DynamicField from '@/components/DynamicField.vue'
import { normalizeFormFieldColSpan } from '@/contracts/form-layout'
import { getFormDefinition, resolveReferenceDisplay } from '@/adapters/form-runtime'
import type { FormSchema } from '@/contracts/form-schema'
import { normalizeFormFieldValue } from '@/contracts/form-value'

const props = withDefaults(
  defineProps<{
    formKey?: string | null
    recordId?: string | null
    record?: Record<string, unknown> | null
    loading?: boolean
    /** 打印模式（F2-2）：按定义里的 printTemplate 过滤字段/明细表，并输出抬头页脚。 */
    printMode?: boolean
  }>(),
  {
    formKey: '',
    recordId: '',
    record: null,
    loading: false,
    printMode: false,
  },
)

const schema = ref<FormSchema | null>(null)
const schemaLoading = ref(false)
const schemaUnavailable = ref(false)
const referenceLabels = ref<Record<string, string>>({})
let loadToken = 0

const effectiveLoading = computed(() => props.loading || schemaLoading.value)
const effectiveRecordId = computed(
  () => props.recordId || (typeof props.record?.id === 'string' ? props.record.id : ''),
)

/** 打印模板（F2-2/F2-3）：字段/明细表选择与抬头页脚随定义版本化。 */
const printTemplate = computed(() =>
  props.printMode && schema.value ? schema.value.printTemplate : undefined,
)

/** 打印模式下按模板筛选字段；模板未配置字段/明细表时保持全量（默认模板）。 */
const visibleFields = computed(() => {
  const fields = schema.value?.fields ?? []
  const template = printTemplate.value
  if (!template) return fields
  const fieldNames = template.fields && template.fields.length > 0 ? new Set(template.fields) : null
  const tableNames = template.tables && template.tables.length > 0 ? new Set(template.tables) : null
  return fields.filter((field) => {
    if (field.type === 'TABLE') {
      return !tableNames || tableNames.has(field.name)
    }
    return !fieldNames || fieldNames.has(field.name)
  })
})

const formItems = computed(() => {
  if (!schema.value) return []
  return visibleFields.value.map((field) => {
    const recordKey = field.type === 'REFERENCE' ? 'ref_' + field.name + '_id' : field.name
    return {
      field,
      colSpan: normalizeFormFieldColSpan(field.colSpan, field.type),
      value: normalizeFormFieldValue(field, props.record?.[recordKey]),
      referenceLabel: field.type === 'REFERENCE' ? (referenceLabels.value[field.name] ?? '') : '',
    }
  })
})

async function loadSchema(formKey: string) {
  const token = ++loadToken
  schema.value = null
  schemaUnavailable.value = false
  referenceLabels.value = {}
  if (!formKey) return
  schemaLoading.value = true
  try {
    const loaded = await getFormDefinition(formKey)
    if (token !== loadToken) return
    schema.value = loaded
    await resolveReferences(loaded, token)
  } catch {
    if (token !== loadToken) return
    schemaUnavailable.value = true
  } finally {
    if (token === loadToken) schemaLoading.value = false
  }
}

async function resolveReferences(loaded: FormSchema, token: number) {
  if (!props.record) return
  const next: Record<string, string> = {}
  for (const field of loaded.fields) {
    if (field.type !== 'REFERENCE') continue
    const refId = props.record['ref_' + field.name + '_id']
    if (refId == null || refId === '') continue
    try {
      next[field.name] = await resolveReferenceDisplay(
        String(field.targetFormId ?? ''),
        String(refId),
      )
    } catch {
      next[field.name] = String(refId)
    }
  }
  if (token === loadToken) referenceLabels.value = next
}

watch(
  () => props.formKey,
  (key) => void loadSchema(key ?? ''),
  { immediate: true },
)

watch(
  () => props.record,
  () => {
    if (schema.value) void resolveReferences(schema.value, loadToken)
  },
)
</script>

<template>
  <el-card class="business-form-card" shadow="never">
    <div v-loading="effectiveLoading" class="business-form">
      <div v-if="printTemplate?.header" class="business-form__print-header">
        {{ printTemplate.header }}
      </div>
      <h2 v-if="printTemplate && schema?.title" class="business-form__print-title">
        {{ schema.title }}
      </h2>
      <el-alert
        v-if="schemaUnavailable"
        title="表单信息暂时无法显示"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="!effectiveLoading && !record"
        title="暂未取到表单数据"
        type="info"
        :closable="false"
        show-icon
      />
      <div v-else-if="formItems.length > 0" class="business-form__grid">
        <div
          v-for="item in formItems"
          :key="item.field.name"
          class="business-form__field"
          :style="{ gridColumn: `span ${item.colSpan}` }"
        >
          <DynamicField
            :field="item.field"
            :model-value="item.value"
            readonly
            :reference-label="item.referenceLabel"
            :form-key="props.formKey || ''"
            :record-id="effectiveRecordId"
          />
        </div>
      </div>
      <el-empty v-else-if="!effectiveLoading" description="该表单没有可显示的内容" />
      <div v-if="printTemplate?.footer" class="business-form__print-footer">
        {{ printTemplate.footer }}
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.business-form-card {
  border: 1px solid var(--sw-border-light);
  border-radius: 0;
}
.business-form-card :deep(.el-card__body) {
  padding: 16px;
}
.business-form {
  min-height: 72px;
}
.business-form__print-header {
  margin-bottom: 8px;
  font-size: 12px;
  color: #333;
  text-align: center;
}
.business-form__print-title {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
}
.business-form__print-footer {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid #999;
  font-size: 12px;
  color: #333;
  text-align: center;
}
.business-form__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 16px 20px;
}
.business-form :deep(.dynamic-field__label) {
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: var(--sw-font-weight-body);
  line-height: 22px;
  color: var(--sw-text-regular);
}
.business-form__field {
  min-width: 0;
}
</style>
