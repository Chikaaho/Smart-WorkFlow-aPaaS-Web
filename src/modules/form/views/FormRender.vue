<script setup lang="ts">
/**
 * FormRender — 低代码表单渲染页（页型 A）。
 *
 * ## 三种模式
 * | recordId | mode   | 行为                                |
 * |----------|--------|-------------------------------------|
 * | 无       | —      | 新建空表单，可填可提交              |
 * | 有       | view   | 只读回显，隐藏提交按钮              |
 * | 有       | edit   | 可编辑回显（保存走 seam「待上线」） |
 *
 * ## 记录加载
 * - 进页若带 recordId：调 queryFormData(filters:[id EQ recordId]) 取单记录
 * - TABLE 字段：JSON 串 → 数组
 * - REFERENCE 字段：后端物理列 ref_{name}_id → formData.{name}（存 id）
 * - REFERENCE 显示名：resolveReferenceDisplay → referenceLabels[name]
 *   显示名单独注入 DynamicField 的 referenceLabel prop，不污染 v-model
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { SubTableRowAction, SubTableRowActionType } from '@/modules/form/api/form'
import {
  getFormDefinition,
  submitForm,
  getFormData,
  updateFormData,
  normalizeSubmitData,
} from '@/modules/form/api/form'
import { ApiError } from '@/foundation/request'
import DynamicField from '@/components/DynamicField.vue'
import { resolveReferenceDisplay } from '@/modules/form/utils/resolve-reference-display'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

/* ── 路由参数 ── */

const route = useRoute()
const router = useRouter()
const formKey = String(route.params.formKey)
const recordId = route.query.recordId ? String(route.query.recordId) : ''
const mode = route.query.mode === 'edit' ? 'edit' : 'view'

/* ── 状态 ── */

const schema = ref<FormSchema | null>(null)
const loading = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const formData = reactive<Record<string, unknown>>({})
/** 客户端提交校验提示：与字段同处网格单元，提示出现时自然撑高当前行。 */
const validationErrors = reactive<Record<string, string>>({})
/** REFERENCE 字段显示名映射：{ fieldName: displayName } */
const referenceLabels = reactive<Record<string, string>>({})
/** 乐观锁版本号（编辑回显时从 GET 详情获取，保存时 PUT 回传） */
const version = ref<number>(0)

// 查看只读模式：有 recordId 且 mode=view；无 recordId 时永远是新建（可编辑）
const isViewMode = computed(() => !!recordId && mode === 'view')
const pageTitle = computed(() => {
  if (!schema.value) return `表单 — ${formKey}`
  const modeLabel = isViewMode.value ? '（查看）' : recordId ? '（编辑）' : ''
  return `${schema.value.title}${modeLabel}`
})

/* ── 字段默认值初始化 ── */

function initField(field: FormSchemaField) {
  switch (field.type) {
    case 'TABLE':
      formData[field.name] = []
      break
    case 'BOOL':
      formData[field.name] = false
      break
    case 'NUMBER':
      formData[field.name] = 0
      break
    default:
      formData[field.name] = ''
  }
}

function tryParseJSON(str: string, fallback: unknown): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

/* ── schema 加载 + 记录加载 ── */

async function loadSchema() {
  loading.value = true
  errorMsg.value = ''
  try {
    schema.value = await getFormDefinition(formKey)
    if (!schema.value) return

    if (recordId) {
      await loadRecord(schema.value)
    } else {
      for (const field of schema.value.fields) initField(field)
    }
  } catch {
    errorMsg.value = '表单定义加载失败，请检查 formKey 是否正确'
  } finally {
    loading.value = false
  }
}

/**
 * 按 recordId 加载已有记录并回填 formData。
 * - 调 GET /api/form/data/{formKey}/{recordId} 取单记录
 * - 提取 version 用于乐观锁
 * - TABLE 字段: JSON 串 → 数组，每行打 _rowAction: 'UNCHANGED' + _rowId
 * - REFERENCE 字段: 物理列 ref_{name}_id → formData.{name}
 * - REFERENCE 显示名: 并发解析后写入 referenceLabels
 */
async function loadRecord(schema: FormSchema) {
  try {
    const record = await getFormData(formKey, recordId)

    // 存储乐观锁版本号
    version.value = (record.version as number) ?? 0

    const refPromises: Promise<void>[] = []

    for (const field of schema.fields) {
      switch (field.type) {
        case 'TABLE': {
          const raw = record[field.name]
          const arr: unknown = typeof raw === 'string' ? tryParseJSON(raw, []) : (raw ?? [])
          formData[field.name] = Array.isArray(arr)
            ? arr.map((row: unknown) => {
                const r = row as Record<string, unknown>
                return {
                  ...r,
                  _rowAction: 'UNCHANGED' as const,
                  _rowId: String(r.id ?? ''),
                }
              })
            : []
          break
        }
        case 'REFERENCE': {
          const physCol = `ref_${field.name}_id`
          const refValue = record[physCol]
          formData[field.name] = refValue ?? ''

          if (refValue && field.targetFormId) {
            const p = resolveReferenceDisplay(field.targetFormId, String(refValue)).then(
              (display) => {
                referenceLabels[field.name] = display
              },
            )
            refPromises.push(p)
          }
          break
        }
        default: {
          const val = record[field.name]
          formData[field.name] = val !== null && val !== undefined ? val : ''
        }
      }
    }

    // 并发等待所有 REFERENCE 显示名解析
    if (refPromises.length > 0) {
      await Promise.all(refPromises)
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 1507) {
        errorMsg.value = '记录已被删除'
        return
      }
      errorMsg.value = `记录加载失败：${err.msg}`
    } else {
      errorMsg.value = '记录加载失败'
    }
  }
}

/* ── 业务错误码映射 ── */

function businessError(code: number, fallback: string): string {
  const MAP: Record<number, string> = {
    1401: '必填字段缺失，请检查所有必填项',
    1403: '字段值超出字典允许范围，请重新选择',
    1507: '记录已被删除',
    1508: '记录已被他人修改，请刷新后重试',
  }
  return MAP[code] ?? fallback
}

/**
 * 组装编辑保存的 PUT 请求体。
 * - data: 主表非 TABLE 字段（经 normalizeSubmitData 归一）
 * - version: 从 GET 详情获取的乐观锁版本号
 * - subTableRows: TABLE 字段的行变动动作列表（从 _rowAction / _rowId 提取）
 */
function buildUpdatePayload(): {
  data: Record<string, unknown>
  version: number
  subTableRows: Record<string, SubTableRowAction[]>
} {
  const data: Record<string, unknown> = {}
  const subTableRows: Record<string, SubTableRowAction[]> = {}

  if (!schema.value) return { data, version: version.value, subTableRows }

  const nonTableFields: FormSchemaField[] = []

  for (const field of schema.value.fields) {
    if (field.type === 'TABLE') {
      const rows = (Array.isArray(formData[field.name]) ? formData[field.name] : []) as Record<
        string,
        unknown
      >[]
      subTableRows[field.name] = rows.map((row) => {
        const { _rowAction, _rowId, ...businessData } = row as Record<string, unknown> & {
          _rowAction?: string
          _rowId?: string
        }
        const action: SubTableRowActionType =
          (_rowAction as SubTableRowActionType | undefined) ?? 'UNCHANGED'
        const entry: SubTableRowAction = { action }
        if (_rowId) entry.id = String(_rowId)
        if (action !== 'DELETE') {
          entry.data = businessData as Record<string, unknown>
        }
        return entry
      })
    } else {
      nonTableFields.push(field)
      data[field.name] = formData[field.name]
    }
  }

  return {
    data: normalizeSubmitData(data, nonTableFields),
    version: version.value,
    subTableRows,
  }
}

function isEmptyRequiredValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * 提交前先在真实填写页展示字段内联校验。
 * 这不是后端校验的替代：后端仍会对同一必填规则复核；前端只负责把错误绑定到
 * 对应网格单元，使错误提示参与 CSS Grid 的自然行高计算。
 */
function validateRequiredFields(): boolean {
  for (const key of Object.keys(validationErrors)) delete validationErrors[key]
  if (!schema.value) return true

  for (const field of schema.value.fields) {
    if (field.required && isEmptyRequiredValue(formData[field.name])) {
      validationErrors[field.name] = '此字段为必填项'
    }
  }

  return Object.keys(validationErrors).length === 0
}

/* ── 提交 / 保存 ── */

async function handleSubmit() {
  submitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  if (!validateRequiredFields()) {
    errorMsg.value = '请完善必填项后再提交'
    submitting.value = false
    return
  }

  // 编辑保存：走 PUT 更新端点
  if (recordId) {
    try {
      const payload = buildUpdatePayload()
      await updateFormData(formKey, recordId, payload)
      successMsg.value = '保存成功'
      // 保存成功后重新加载记录（版本号已变，拉取最新数据）
      if (schema.value) await loadRecord(schema.value)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 1507) {
          errorMsg.value = '记录已被删除'
          // 回列表
          // eslint-disable-next-line no-undef
          window.setTimeout(() => {
            router.push({ name: 'form-data', params: { formKey } })
          }, 1500)
          submitting.value = false
          return
        }
        if (err.code === 1508) {
          errorMsg.value = '记录已被他人修改，请刷新后重试'
          // 刷新数据
          if (schema.value) await loadRecord(schema.value)
          submitting.value = false
          return
        }
        errorMsg.value = businessError(err.code, err.msg)
      } else {
        errorMsg.value = '保存失败，请稍后重试'
      }
    } finally {
      submitting.value = false
    }
    return
  }

  // 新建提交：走 POST 创建端点
  try {
    const id = await submitForm(formKey, { ...formData }, schema.value?.fields)
    successMsg.value = `提交成功，记录 ID：${id}`

    // 按业务键（记录 ID）查询流程实例，只有实例真实创建才提示"流程已发起"。
    // 实例由表单提交事件在事务提交后异步创建，短暂轮询等待其可见（最多约 5s）。
    const started = await waitForInstanceByBusinessKey(id)
    if (started) {
      ElMessage.success({
        message: '提交成功，流程已发起',
        duration: 3000,
      })
      // 跳转到发起人可查看实例状态与流转记录的真实页面
      // eslint-disable-next-line no-undef
      window.setTimeout(() => {
        router.push('/workflow/instances')
      }, 1500)
    } else {
      // 未绑定流程/发起失败：如实提示仅保存数据，不声称流程已发起
      ElMessage.info({
        message: '提交成功（该表单未关联已发布流程，仅保存数据）',
        duration: 4000,
      })
    }
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = businessError(err.code, err.msg)
    } else {
      errorMsg.value = '提交失败：后端提交端点待上线'
    }
  } finally {
    submitting.value = false
  }
}

/** 按记录 ID 轮询查询流程实例是否真实创建（AFTER_COMMIT 异步创建存在短暂延迟） */
async function waitForInstanceByBusinessKey(recordId: string): Promise<boolean> {
  const { queryInstances } = await import('@/modules/workflow/api')
  const maxAttempts = 10
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const page = await queryInstances({ pageNum: 1, pageSize: 1 }, { businessKey: recordId })
      if (page.list.length > 0) return true
    } catch {
      // 查询失败不判定为未发起，继续重试直至超限
    }
    // eslint-disable-next-line no-undef
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

// ── 挂载 ──
onMounted(loadSchema)
</script>

<template>
  <div class="form-render-page">
    <el-skeleton v-if="loading && !schema" :rows="4" animated />
    <template v-else>
      <!-- 提示条 -->
      <el-alert
        v-if="errorMsg"
        type="error"
        :title="errorMsg"
        show-icon
        :closable="false"
        class="form-render-page__alert"
      />
      <el-alert
        v-if="successMsg"
        type="success"
        :title="successMsg"
        show-icon
        :closable="false"
        class="form-render-page__alert"
      />

      <el-empty v-if="!schema && !errorMsg" description="表单不存在或加载失败" />

      <template v-else-if="schema">
        <!-- 页标题 -->
        <h1 class="form-render-page__title">{{ pageTitle }}</h1>
        <p v-if="!isViewMode" class="form-render-page__hint">带 * 为必填项</p>

        <!-- 字段渲染区 -->
        <div class="form-render-page__card">
          <div class="form-render-page__group">
            <div
              v-for="field in schema.fields"
              :key="field.name"
              class="form-render-page__field"
              :style="{ gridColumn: `span ${getFormFieldColSpan(field)}` }"
              :data-col-span="getFormFieldColSpan(field)"
              :data-grid-field-type="field.type"
              :data-grid-field-name="field.name"
            >
              <DynamicField
                :field="field"
                :model-value="formData[field.name]"
                :readonly="isViewMode"
                :reference-label="referenceLabels[field.name] ?? ''"
                @update:model-value="formData[field.name] = $event"
              />
              <p
                v-if="validationErrors[field.name]"
                class="form-render-page__field-error"
                role="alert"
                :data-validation-error-for="field.name"
              >
                {{ validationErrors[field.name] }}
              </p>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <template v-if="!isViewMode">
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ recordId ? '保存' : '提交' }}
          </el-button>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.form-render-page {
  max-width: 920px;
  margin: 0 auto;
  padding: var(--sw-space-24) var(--sw-space-24);
}

.form-render-page__alert {
  margin-bottom: var(--sw-space-16);
}

.form-render-page__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--sw-text-primary);
  margin: 0 0 var(--sw-space-8);
}

.form-render-page__hint {
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
  margin: 0 0 var(--sw-space-20);
}

.form-render-page__card {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
  padding: 22px 28px;
  margin-bottom: var(--sw-space-20);
}

.form-render-page__group {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-flow: row;
  row-gap: var(--sw-form-row-gap);
}

.form-render-page__field {
  min-width: 0;
  padding-inline: var(--sw-space-8);
  box-sizing: border-box;
}

.form-render-page__field-error {
  margin: var(--sw-space-4) 0 0;
  color: var(--sw-danger);
  font-size: var(--sw-font-caption);
  line-height: 1.5;
}
</style>
