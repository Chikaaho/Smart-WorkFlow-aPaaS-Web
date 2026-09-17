<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
import { ApiError, getErrorMessage } from '@/foundation/request'
import DynamicField from '@/components/DynamicField.vue'
import { resolveReferenceDisplay } from '@/modules/form/utils/resolve-reference-display'
import { parseVisibilityRules, hiddenFieldNames } from '@/modules/form/utils/visibility-rules'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

/* ── 路由参数 ── */

const route = useRoute()
const router = useRouter()
const formKey = String(route.params.formKey)
const recordId = route.query.recordId ? String(route.query.recordId) : ''
const mode = route.query.mode === 'edit' ? 'edit' : 'view'
/** 草稿填报模式：route.query.mode === 'draft'（可选 draftId 打开已有草稿） */
const isDraftMode = ref(route.query.mode === 'draft')
const draftId = route.query.draftId ? String(route.query.draftId) : ''

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
/** 显隐联动（v0.0.2）：随载荷实时复算应隐藏的字段；提交与服务端复算同口径。 */
const hiddenFields = computed(() =>
  schema.value ? hiddenFieldNames(parseVisibilityRules(schema.value), formData) : new Set<string>(),
)
/** 渲染列表：过滤隐藏字段（LABEL 说明文字照常渲染）。 */
const visibleSchemaFields = computed(() =>
  schema.value ? schema.value.fields.filter((f) => !hiddenFields.value.has(f.name)) : [],
)
/** 乐观锁版本号（编辑回显时从 GET 详情获取，保存时 PUT 回传） */
const version = ref<number>(0)

// ── 草稿模式状态 ──
const draftTitle = ref('') // 草稿标题（新建草稿时可填）
const draftSaving = ref(false) // 保存/提交草稿进行中
const draftRefreshVersion = ref(false) // 保存时是否重绑表单最新已发布版本（D3）

// 查看只读模式：有 recordId 且 mode=view；无 recordId 时永远是新建（可编辑）
const isViewMode = computed(() => !!recordId && mode === 'view')
const pageTitle = computed(() => {
  if (!schema.value) return t('form.titleWithKey', { formKey })
  if (isDraftMode.value) return t('form.draftEntryTitle', { title: schema.value.title })
  const modeLabel = isViewMode.value
    ? t('form.titleSuffixView')
    : recordId
      ? t('form.titleSuffixEdit')
      : ''
  return `${schema.value.title}${modeLabel}`
})

/** 跨模块按需加载 workflow api（动态 import，规避 modules 互引的静态依赖） */
async function getWorkflowApi() {
  return import('@/modules/workflow/api')
}

/* ── 字段默认值初始化 ── */

function initField(field: FormSchemaField) {
  // 默认值（v0.0.2）：仅新建填报且无已有值时应用；草稿恢复/编辑回显不覆盖原值。
  // LABEL 非输入字段，无值。
  if (field.type === 'LABEL') {
    return
  }
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    formData[field.name] = Array.isArray(field.defaultValue)
      ? [...field.defaultValue]
      : field.defaultValue
    return
  }
  switch (field.type) {
    case 'TABLE':
      formData[field.name] = []
      break
    case 'MULTISELECT':
    case 'ATTACHMENT':
    case 'IMAGE':
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

    if (isDraftMode.value) {
      if (draftId) {
        await loadDraftPayload(schema.value)
      } else {
        for (const field of schema.value.fields) initField(field)
      }
    } else if (recordId) {
      await loadRecord(schema.value)
    } else {
      for (const field of schema.value.fields) initField(field)
    }
  } catch {
    errorMsg.value = t('form.definitionLoadFailed')
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
        errorMsg.value = t('form.recordDeleted')
        return
      }
      errorMsg.value = t('form.recordLoadFailedDetail', { msg: err.msg })
    } else {
      errorMsg.value = t('form.recordLoadFailedTitle')
    }
  }
}

/* ── 业务错误码映射 ──
 * P61 §3.4：同一业务码只允许一个文案权威。本页不再自建映射，
 * 统一走 `foundation/request/error-code-map`（后端 msg 优先 → 中央兜底），
 * 消除「同一码在 FormData 页与本页显示不同文案」的漂移。 */
function businessError(code: number, fallback: string): string {
  return getErrorMessage(code, fallback)
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
    if (hiddenFields.value.has(field.name)) continue // 隐藏字段不参与本次必填校验
    if (field.required && isEmptyRequiredValue(formData[field.name])) {
      validationErrors[field.name] = t('form.fieldRequired')
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
    errorMsg.value = t('form.completeRequired')
    submitting.value = false
    return
  }

  // 编辑保存：走 PUT 更新端点
  if (recordId) {
    try {
      const payload = buildUpdatePayload()
      await updateFormData(formKey, recordId, payload)
      successMsg.value = t('common.saveSuccess')
      // 保存成功后重新加载记录（版本号已变，拉取最新数据）
      if (schema.value) await loadRecord(schema.value)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 1507) {
          errorMsg.value = t('form.recordDeleted')
          // 回列表
          // eslint-disable-next-line no-undef
          window.setTimeout(() => {
            router.push({ name: 'form-data', params: { formKey } })
          }, 1500)
          submitting.value = false
          return
        }
        if (err.code === 1508) {
          errorMsg.value = t('foundation.errRecordModified')
          // 刷新数据
          if (schema.value) await loadRecord(schema.value)
          submitting.value = false
          return
        }
        errorMsg.value = businessError(err.code, err.msg)
      } else {
        errorMsg.value = t('form.saveFailed')
      }
    } finally {
      submitting.value = false
    }
    return
  }

  // 新建提交：走 POST 创建端点
  try {
    const submitData: Record<string, unknown> = {}
    for (const field of schema.value?.fields ?? []) {
      if (!hiddenFields.value.has(field.name)) {
        submitData[field.name] = formData[field.name]
      }
    }
    const id = await submitForm(formKey, submitData, schema.value?.fields)
    successMsg.value = t('form.submitSuccessWithId', { id })

    // 按业务键（记录 ID）查询流程实例，只有实例真实创建才提示"流程已发起"。
    // 实例由表单提交事件在事务提交后异步创建，短暂轮询等待其可见（最多约 5s）。
    const started = await waitForInstanceByBusinessKey(id)
    if (started) {
      ElMessage.success({
        get message() {
          return t('form.submittedProcessStarted')
        },
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
        get message() {
          return t('form.submittedDataOnly')
        },
        duration: 4000,
      })
    }
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = businessError(err.code, err.msg)
    } else {
      errorMsg.value = t('form.submitEndpointUnavailable')
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

/* ── 草稿模式：反填 / 保存 / 提交 ── */

/**
 * 草稿模式：读已有草稿 payload 反填控件。
 * 与 DynamicField 的 update:model-value 走同一条赋值路径（formData[name] = value）。
 */
async function loadDraftPayload(schema: FormSchema) {
  const { getDraft } = await getWorkflowApi()
  try {
    const draft = await getDraft(draftId)
    draftTitle.value = draft.title ?? ''
    let values: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(draft.payload)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        values = parsed as Record<string, unknown>
      }
    } catch {
      // payload 非法 JSON：按空草稿处理，控件保留默认值
    }
    for (const field of schema.fields) {
      if (!(field.name in values)) {
        initField(field)
        continue
      }
      const val = values[field.name]
      if (field.type === 'TABLE') {
        formData[field.name] = Array.isArray(val) ? val : []
      } else if (field.type === 'REFERENCE') {
        const refValue = val !== null && val !== undefined ? String(val) : ''
        formData[field.name] = refValue
        // 显示名解析与记录详情回显同源（resolveReferenceDisplay）：
        // 草稿恢复不解析会把原始 id 当显示值，破坏「存 id / 显示 value」红线。
        if (refValue && field.targetFormId) {
          void resolveReferenceDisplay(field.targetFormId, refValue).then((display) => {
            referenceLabels[field.name] = display
          })
        }
      } else {
        formData[field.name] = val !== null && val !== undefined ? val : ''
      }
    }
  } catch (err) {
    errorMsg.value =
      err instanceof ApiError
        ? t('form.draftLoadFailedDetail', { msg: err.msg })
        : t('form.draftLoadFailedTitle')
  }
}

/** 控件值 → payload 对象：剥离子表行内部标记（_rowAction/_rowId） */
function buildDraftPayloadObject(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!schema.value) return out
  for (const field of schema.value.fields) {
    const val = formData[field.name]
    if (field.type === 'TABLE' && Array.isArray(val)) {
      out[field.name] = (val as Record<string, unknown>[]).map(
        ({ _rowAction: _ra, _rowId: _ri, ...clean }) => clean,
      )
    } else {
      out[field.name] = val
    }
  }
  return out
}

/** 保存草稿：有 draftId → updateDraft；否则 → createDraft */
async function handleSaveDraft() {
  if (!schema.value) return
  draftSaving.value = true
  try {
    const payload = JSON.stringify(buildDraftPayloadObject())
    const { createDraft, updateDraft } = await getWorkflowApi()
    if (draftId) {
      await updateDraft(draftId, {
        title: draftTitle.value.trim() || null,
        payload,
        refreshFormVersion: draftRefreshVersion.value || undefined,
      })
      ElMessage.success(t('common.draftSaved'))
    } else {
      await createDraft({
        title: draftTitle.value.trim() || null,
        formKey,
        payload,
      })
      ElMessage.success(t('form.draftCreated'))
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveDraftFailed'))
  } finally {
    draftSaving.value = false
  }
}

/** 提交草稿：先保存控件值（updateDraft），再受理提交并轮询命令终态 */
async function handleSubmitDraft() {
  if (!schema.value) return
  if (!validateRequiredFields()) {
    errorMsg.value = t('form.completeRequired')
    return
  }
  draftSaving.value = true
  errorMsg.value = ''
  try {
    const { updateDraft, submitDraft, pollCommandStatus } = await getWorkflowApi()
    await updateDraft(draftId, {
      title: draftTitle.value.trim() || null,
      payload: JSON.stringify(buildDraftPayloadObject()),
      refreshFormVersion: draftRefreshVersion.value || undefined,
    })
    const accept = await submitDraft(draftId)
    const finalStatus = await pollCommandStatus(accept.commandId)
    if (finalStatus?.status === 'COMPLETED') {
      ElMessage.success(t('common.submitSuccess'))
      // eslint-disable-next-line no-undef
      window.setTimeout(() => {
        void router.push('/workflow/my-drafts')
      }, 1200)
    } else if (finalStatus?.status === 'FAILED') {
      errorMsg.value = finalStatus.failureReason ?? t('common.submitFailed')
    } else {
      // 超时未终态：如实提示，不伪装成功
      ElMessage.warning(t('common.processingCheckLater'))
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('form.draftSubmitFailed'))
  } finally {
    draftSaving.value = false
  }
}

function backToDrafts() {
  void router.push('/workflow/my-drafts')
}

// ── P53 节点 27：右侧说明栏的模式标签（渲染期求值，避免语言固化） ──
const modeLabel = computed(() => {
  if (isViewMode.value) return t('formSide.modeView')
  if (isDraftMode.value) return t('formSide.modeDraft')
  return t('formSide.modeSubmit')
})

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

      <el-empty v-if="!schema && !errorMsg" :description="t('form.notFoundOrLoadFailed')" />

      <template v-else-if="schema">
        <!-- 页标题 -->
        <h1 class="form-render-page__title">{{ pageTitle }}</h1>
        <p v-if="!isViewMode" class="form-render-page__hint">{{ t('form.requiredHint') }}</p>

        <div class="form-render-page__layout">
          <div class="form-render-page__main">
            <!-- 字段渲染区 -->
            <div class="form-render-page__card">
              <div class="form-render-page__group">
                <div
                  v-for="field in visibleSchemaFields"
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

            <!-- 操作按钮：草稿模式 -->
            <template v-if="isDraftMode">
              <div class="form-render-page__draft-bar">
                <el-input
                  v-model="draftTitle"
                  :placeholder="t('form.draftTitleOptional')"
                  maxlength="100"
                  class="form-render-page__draft-title"
                />
                <span class="form-render-page__draft-process-hint">
                  {{ t('form.processResolvedByBinding') }}
                </span>
                <el-checkbox v-if="draftId" v-model="draftRefreshVersion">{{
                  t('form.rebindLatest')
                }}</el-checkbox>
                <el-button :loading="draftSaving" @click="handleSaveDraft">{{
                  t('common.saveDraft')
                }}</el-button>
                <el-button
                  v-if="draftId"
                  type="primary"
                  :loading="draftSaving"
                  @click="handleSubmitDraft"
                >
                  {{ t('form.submitDraft') }}
                </el-button>
                <el-button link @click="backToDrafts">{{ t('form.backToMyDrafts') }}</el-button>
              </div>
            </template>
            <!-- 操作按钮：表单数据模式（行为不变） -->
            <template v-else-if="!isViewMode">
              <el-button type="primary" :loading="submitting" @click="handleSubmit">
                {{ recordId ? t('common.save') : t('common.submit') }}
              </el-button>
            </template>
          </div>

          <!-- 流程说明（节点 27）：只展示真实可得信息，不虚构版本/发起范围 -->
          <aside class="form-render-page__aside">
            <div class="form-render-page__aside-card">
              <h3 class="form-render-page__aside-title">{{ t('formSide.infoTitle') }}</h3>
              <div class="form-render-page__aside-row">
                <span>{{ t('formSide.formNameLabel') }}</span>
                <strong>{{ schema.title }}</strong>
              </div>
              <div class="form-render-page__aside-row">
                <span>{{ t('formSide.infoFormKey') }}</span>
                <strong>{{ formKey }}</strong>
              </div>
              <div class="form-render-page__aside-row">
                <span>{{ t('formSide.infoMode') }}</span>
                <strong>{{ modeLabel }}</strong>
              </div>
              <p class="form-render-page__aside-hint">{{ t('form.processResolvedByBinding') }}</p>
            </div>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.form-render-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--sw-space-24) var(--sw-space-24);
}

/* P53 节点 27：左表单右说明双栏；窄屏单列 */
.form-render-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--sw-space-20);
  align-items: start;
}
.form-render-page__main {
  min-width: 0;
}
.form-render-page__aside-card {
  padding: var(--sw-space-20);
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.form-render-page__aside-title {
  margin: 0 0 var(--sw-space-12);
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.form-render-page__aside-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sw-border-lighter);
  font-size: 13px;
}
.form-render-page__aside-row span {
  color: var(--sw-text-secondary);
}
.form-render-page__aside-row strong {
  color: var(--sw-text-primary);
  word-break: break-all;
}
.form-render-page__aside-hint {
  margin: var(--sw-space-12) 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--sw-text-secondary);
}
@media (max-width: 991px) {
  .form-render-page__layout {
    grid-template-columns: 1fr;
  }
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

.form-render-page__draft-bar {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  flex-wrap: wrap;
}

.form-render-page__draft-title {
  width: 220px;
}

.form-render-page__draft-process-hint {
  color: var(--sw-color-text-secondary);
  font-size: var(--sw-font-size-sm);
}
</style>
