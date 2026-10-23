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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
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
import { createFieldScripts } from '@/modules/form/utils/field-scripts'
import { createFormEvents } from '@/modules/form/utils/form-events'
import { useUserStore } from '@/stores/user'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import { InstanceFlowPanel } from '@/adapters/instance-flow'
import {
  createTaskApproval,
  getInstanceRelation,
  type InstanceRelation,
} from '@/adapters/instance-relation'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

/* ── 路由参数 ── */

const route = useRoute()
const router = useRouter()
const formKey = String(route.params.formKey)
const recordId = route.query.recordId ? String(route.query.recordId) : ''

/* ── 0.1.7 #30：统一详情关系——无权限提示/参与人只读+流程信息/审批人内联动作 ── */

const relation = ref<InstanceRelation | null>(null)
const actionComment = ref('')
const approval = ref<{
  submitting: { value: '' | 'approve' | 'reject' }
  submit: (action: 'APPROVE' | 'REJECT') => Promise<void>
} | null>(null)

const isApprover = computed(
  () => relation.value?.relation === 'APPROVER' && !!relation.value?.pendingTaskId,
)
const actionSubmitting = computed(() => approval.value?.submitting.value ?? '')

/**
 * 有流程的表单详情：流程信息作为表单下方的外挂组件渲染（无流程不渲染）。
 * 权限链与表单共用：表单数据权限（记录可读）→ 参与人 → 审批人。
 */
const hasProcessInfo = computed(
  () => relation.value?.relation !== 'NONE' && !!relation.value?.instance,
)
const approvalHistory = computed(() => relation.value?.approvalHistory ?? [])
const currentNodeKey = computed(() => relation.value?.instance?.currentNodeKeys?.[0] ?? null)

async function loadRelation() {
  if (!recordId || !formKey) return
  try {
    relation.value = await getInstanceRelation(formKey, recordId)
  } catch {
    // 关系查询失败按无关系处理：详情仍按数据权限展示
    relation.value = { relation: 'NONE' }
  }
}

/** 控制面唯一来源=workflow 模块 use-task-approval；本页只提供任务号/负载/完成刷新。 */
async function ensureApprovalControl() {
  if (approval.value) return approval.value
  approval.value = await createTaskApproval({
    taskId: () => relation.value?.pendingTaskId,
    buildPayload: (action) => {
      const comment = actionComment.value.trim()
      return comment ? { action, comment, opinionData: { comment } } : { action }
    },
    onCompleted: () => loadRelation(),
  })
  return approval.value
}

async function submitRelationAction(action: 'APPROVE' | 'REJECT') {
  const control = await ensureApprovalControl()
  await control.submit(action)
}
const mode = route.query.mode === 'edit' ? 'edit' : 'view'
/** 草稿填报模式：route.query.mode === 'draft'（可选 draftId 打开已有草稿） */
const isDraftMode = ref(route.query.mode === 'draft')
const draftId = route.query.draftId ? String(route.query.draftId) : ''

/* ── 状态 ── */

const schema = ref<FormSchema | null>(null)
const loading = ref(false)
const submitting = ref(false)
const submissionFinalized = ref(false)
const postSubmitEventError = ref('')
const lastSubmittedId = ref('')
const postEventRetrying = ref(false)
const errorMsg = ref('')
const formData = reactive<Record<string, unknown>>({})
/** 客户端提交校验提示：与字段同处网格单元，提示出现时自然撑高当前行。 */
const validationErrors = reactive<Record<string, string>>({})
/** REFERENCE 字段显示名映射：{ fieldName: displayName } */
const referenceLabels = reactive<Record<string, string>>({})
/** 显隐联动（v0.0.2）：随载荷实时复算应隐藏的字段；提交与服务端复算同口径。 */
const hiddenFields = computed(() =>
  schema.value ? hiddenFieldNames(parseVisibilityRules(schema.value), formData) : new Set<string>(),
)
/** BF20261013-021：字段脚本运行时（值变更触发字段脚本；onLoad 脚本在数据装载后执行）。 */
const fieldScripts = createFieldScripts({
  getSchema: () => schema.value,
  model: formData,
  // 只读查看态不执行脚本（不产生任何写入/状态变化）
  enabled: () => !isViewMode.value && !submissionFinalized.value,
})
onUnmounted(() => fieldScripts.dispose())
let userStore: ReturnType<typeof useUserStore> | null = null
try {
  userStore = useUserStore()
} catch {
  // 组件单测与独立预览无 Pinia；身份函数按无登录态处理。
}
const formEvents = createFormEvents({
  getSchema: () => schema.value,
  model: formData,
  controls: fieldScripts.overrides,
  writable: () => !isViewMode.value && !submissionFinalized.value,
  identity: () =>
    userStore?.user
      ? {
          userId: userStore.user.id,
          userName: userStore.user.displayName,
          deptId: userStore.user.deptId,
        }
      : null,
  processContext: () => ({
    status: relation.value?.instance?.status ?? '',
    taskId: relation.value?.pendingTaskId ?? '',
  }),
  allowedIntegrations: () => [],
  confirm: async (message) => {
    try {
      await ElMessageBox.confirm(message, t('form.fillDraftTitle'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      })
      return true
    } catch {
      return false
    }
  },
  notify: (kind, message) => ElMessage({ type: kind, message }),
})
/** 脚本隐藏与声明式隐藏合并：脚本 true 加隐藏、false 显式放行（提交与渲染同口径）。 */
const hiddenAll = computed(() => {
  const merged = new Set(hiddenFields.value)
  for (const [name, hidden] of Object.entries(fieldScripts.overrides.hidden)) {
    if (hidden) merged.add(name)
    else merged.delete(name)
  }
  return merged
})
/** 渲染列表：过滤隐藏字段（LABEL 说明文字照常渲染）。 */
const visibleSchemaFields = computed(() =>
  schema.value ? schema.value.fields.filter((f) => !hiddenAll.value.has(f.name)) : [],
)
/** 有效必填 / 有效只读（脚本覆盖优先，静态配置兜底）。 */
function fieldRequired(field: FormSchemaField): boolean {
  return fieldScripts.overrides.required[field.name] ?? field.required ?? false
}
function fieldReadonly(field: FormSchemaField): boolean {
  return (
    isViewMode.value ||
    submissionFinalized.value ||
    (fieldScripts.overrides.readonly[field.name] ?? false)
  )
}
/** 渲染用字段（必填覆盖写回字段对象，供 DynamicField 星标与校验同源）。 */
const renderFields = computed(() =>
  visibleSchemaFields.value.map((f) => {
    const required = fieldRequired(f)
    return required === (f.required ?? false) ? f : ({ ...f, required } as FormSchemaField)
  }),
)
/** 乐观锁版本号（编辑回显时从 GET 详情获取，保存时 PUT 回传） */
const version = ref<number>(0)

// ── 草稿模式状态 ──
const draftTitle = ref('') // 草稿标题（新建草稿时可填）
const draftSaving = ref(false) // 保存/提交草稿进行中
const draftRefreshVersion = ref(false) // 保存时是否重绑表单最新已发布版本（D3）

// 查看只读模式：有 recordId 且 mode=view；无 recordId 时永远是新建（可编辑）
const isViewMode = computed(() => !!recordId && mode === 'view')

/** 页面标题只表达动作，不展示表单名/流程名（0.1.7 #13）。 */
const pageTitle = computed(() => {
  if (isDraftMode.value) return t('form.fillDraftTitle')
  if (isViewMode.value) return t('common.detail')
  if (recordId) return t('form.editDataTitle')
  if (route.query.process) return t('form.startProcessTitle')
  return t('form.createDataTitle')
})

// ── 0.1.7 #16：提交成功 → 居中确认弹窗（用户点击确认后再离开） ──
const submitDialogVisible = ref(false)
/** 提交成功确认后的去向：已发起流程 → 我发起的；仅存数据 → 返回来源页 */
const submitDialogGotoInstances = ref(false)

function confirmSubmitDialog() {
  submitDialogVisible.value = false
  if (submitDialogGotoInstances.value) {
    void router.push('/workflow/my-instances')
  } else {
    goBack()
  }
}

/** 跨模块按需加载流程草稿接缝（动态 import，规避 modules 互引的静态依赖） */
async function getProcessDraftApi() {
  return import('@/adapters/process-draft')
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
    case 'DICT':
      // BF20261013-009：下拉多选默认空数组（值=key/code 列表）；单选保持空串
      formData[field.name] = field.multiple ? [] : ''
      break
    case 'USER':
    case 'DEPT':
      // P63 多选：默认空数组（值=ID 列表）；单选保持空串
      if (field.multiple) formData[field.name] = []
      else formData[field.name] = ''
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
      const loaded = await loadRecord(schema.value)
      // 0.1.7 #30：权限第一关（表单数据查看权限）通过后，才判断参与人/审批人关系
      if (loaded && isViewMode.value) {
        await loadRelation()
      }
    } else {
      for (const field of schema.value.fields) initField(field)
    }
    // BF20261013-021：数据装载完成后执行 onLoad 字段脚本（新建/草稿/回显三态同口径）
    fieldScripts.runOnLoad()
    fieldScripts.resetBaseline()
    const eventResult = await formEvents.runOnLoad()
    if (!eventResult.ok) {
      ElMessage.warning(`表单已加载，加载事件未完成：${eventResult.error ?? '未知错误'}`)
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
async function loadRecord(schema: FormSchema): Promise<boolean> {
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
    return true
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 1507) {
        errorMsg.value = t('form.recordDeleted')
        return false
      }
      if (err.code === 403) {
        // 权限链第一关：无查看权限即止，不再查询流程关系（不外泄流程信息）
        errorMsg.value = t('form.noPermissionView')
        return false
      }
      errorMsg.value = t('form.recordLoadFailedDetail', { msg: err.msg })
    } else {
      errorMsg.value = t('form.recordLoadFailedTitle')
    }
    return false
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
    // BF021：脚本隐藏字段与声明式隐藏同口径，不参与本次必填校验
    if (hiddenAll.value.has(field.name)) continue
    if (fieldRequired(field) && isEmptyRequiredValue(formData[field.name])) {
      validationErrors[field.name] = t('form.fieldRequired')
      continue
    }
    if (
      (field.type === 'TEXT' || field.type === 'RICH_TEXT') &&
      !isEmptyRequiredValue(formData[field.name])
    ) {
      const text = String(formData[field.name])
      const codePoints = Array.from(text).length
      if (field.minLength && field.minLength > 0 && codePoints < field.minLength) {
        validationErrors[field.name] = t('form.fieldMinLength', { count: field.minLength })
        continue
      }
      if (field.length && field.length > 0 && codePoints > field.length) {
        validationErrors[field.name] = t('form.fieldMaxLength', { count: field.length })
        continue
      }
      if (field.pattern?.trim()) {
        let matches: boolean
        try {
          matches = new RegExp(`^(?:${field.pattern})$`, 'u').test(text)
        } catch {
          matches = false
        }
        if (!matches) {
          validationErrors[field.name] =
            field.patternMessage?.trim() || t('form.fieldPatternInvalid')
        }
      }
    }
  }

  return Object.keys(validationErrors).length === 0
}

/* ── 提交 / 保存 ── */

async function handleSubmit() {
  submitting.value = true
  errorMsg.value = ''

  // 提交前事件先结清已有字段联动，再执行脚本及其联动，最后做最终客户端校验。
  await nextTick()
  fieldScripts.resetBaseline()
  const before = await formEvents.runBeforeSubmit()
  if (!before.ok) {
    errorMsg.value = before.cancelled
      ? `提交已取消：${before.error ?? ''}`
      : `提交前处理失败：${before.error ?? '未知错误'}`
    submitting.value = false
    return
  }
  fieldScripts.resetBaseline()
  await nextTick()

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
      postSubmitEventError.value = ''
      lastSubmittedId.value = recordId
      const after = await formEvents.runAfterSubmit(recordId)
      submissionFinalized.value = true
      if (!after.ok) {
        postSubmitEventError.value = after.error ?? '提交后动作失败'
        ElMessage.warning(`已保存，后续处理失败：${postSubmitEventError.value}`)
      }
      ElMessage.success(t('common.saveSuccess'))
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
      if (!hiddenAll.value.has(field.name)) {
        submitData[field.name] = formData[field.name]
      }
    }
    const id = await submitForm(formKey, submitData, schema.value?.fields)

    postSubmitEventError.value = ''
    lastSubmittedId.value = id
    const after = await formEvents.runAfterSubmit(id)
    submissionFinalized.value = true
    if (!after.ok) {
      postSubmitEventError.value = after.error ?? '提交后动作失败'
      ElMessage.warning(`已提交，后续处理失败：${postSubmitEventError.value}`)
    }

    // 探测实例是否真实创建（决定确认后的去向）；提示文案统一为「提交成功」。
    // 实例由表单提交事件在事务提交后异步创建，短暂轮询等待其可见（最多约 5s）。
    const started = await waitForInstanceByBusinessKey(formKey, id)
    // 0.1.7 #16：提交结果以居中确认弹窗呈现，由用户点击确认后再离开本页
    submitDialogGotoInstances.value = started
    submitDialogVisible.value = true
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

async function retryPostSubmitEvents() {
  if (!lastSubmittedId.value || postEventRetrying.value) return
  postEventRetrying.value = true
  const result = await formEvents.runAfterSubmit(lastSubmittedId.value, true)
  postEventRetrying.value = false
  if (result.ok) {
    postSubmitEventError.value = ''
    ElMessage.success('后续处理已完成')
  } else {
    postSubmitEventError.value = result.error ?? '提交后动作失败'
  }
}

/** 按表单键+记录 ID 轮询查询本人实例是否真实创建（AFTER_COMMIT 异步创建存在短暂延迟） */
async function waitForInstanceByBusinessKey(formKey: string, recordId: string): Promise<boolean> {
  const { countProcessInstancesByBusinessKey } = await import('@/adapters/process-runtime')
  const maxAttempts = 10
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if ((await countProcessInstancesByBusinessKey(formKey, recordId)) > 0) return true
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
  const { getDraft } = await getProcessDraftApi()
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
    const { createDraft, updateDraft } = await getProcessDraftApi()
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
    const { updateDraft, submitDraft, pollCommandStatus } = await getProcessDraftApi()
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

/** 0.1.7 #13：左上圆角返回——历史返回优先，兜底回流程中心 */
function goBack() {
  // eslint-disable-next-line no-undef
  if (window.history.length > 1) {
    router.back()
  } else {
    void router.push('/workflow/catalog')
  }
}

// ── 挂载 ──
onMounted(() => {
  void loadSchema()
  // 0.1.7 #30：数据详情（查看态）页签统一为「详情」
  if (isViewMode.value) {
    // eslint-disable-next-line no-undef
    window.document.title = t('common.detail')
  }
})
</script>

<template>
  <div class="form-render-page">
    <el-skeleton v-if="loading && !schema" :rows="4" animated />
    <template v-else>
      <!-- 提示条（仅错误；提交结果走 0.1.7 #16 居中确认弹窗） -->
      <el-alert
        v-if="errorMsg"
        type="error"
        :title="errorMsg"
        show-icon
        :closable="false"
        class="form-render-page__alert"
      />
      <el-alert
        v-if="postSubmitEventError"
        type="warning"
        :title="`业务数据已提交，后续处理失败：${postSubmitEventError}`"
        :closable="false"
        show-icon
        class="form-render-page__alert"
      >
        <template #default>
          <el-button
            link
            type="primary"
            :loading="postEventRetrying"
            @click="retryPostSubmitEvents"
          >
            重试后续处理
          </el-button>
        </template>
      </el-alert>

      <el-empty v-if="!schema && !errorMsg" :description="t('form.notFoundOrLoadFailed')" />

      <template v-else-if="schema">
        <!-- 0.1.7 #13：整个 top 导航栏——左上圆角返回，右上圆角保存草稿/提交；无表单名/流程名噪音 -->
        <header class="form-render-page__top">
          <div class="form-render-page__heading">
            <button
              class="form-render-page__back"
              type="button"
              data-testid="form-render-back"
              :title="t('common.backShort')"
              @click="goBack"
            >
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="form-render-page__title">{{ pageTitle }}</span>
          </div>
          <div v-if="!isViewMode" class="form-render-page__top-actions">
            <template v-if="isDraftMode">
              <el-input
                v-model="draftTitle"
                :placeholder="t('form.draftTitleOptional')"
                maxlength="100"
                class="form-render-page__draft-title"
              />
              <el-checkbox v-if="draftId" v-model="draftRefreshVersion">{{
                t('form.rebindLatest')
              }}</el-checkbox>
              <el-button round :loading="draftSaving" @click="handleSaveDraft">{{
                t('common.saveDraft')
              }}</el-button>
              <el-button
                v-if="draftId"
                round
                type="primary"
                :loading="draftSaving"
                @click="handleSubmitDraft"
              >
                {{ t('form.submitDraft') }}
              </el-button>
              <el-button link @click="backToDrafts">{{ t('form.backToMyDrafts') }}</el-button>
            </template>
            <template v-else>
              <el-button
                round
                :loading="draftSaving"
                data-testid="form-render-save-draft"
                @click="handleSaveDraft"
              >
                {{ t('common.saveDraft') }}
              </el-button>
              <el-button
                round
                type="primary"
                :loading="submitting"
                data-testid="form-render-submit"
                @click="handleSubmit"
              >
                <!-- 0.1.7 #19：提交，不再暗示必有流程 -->
                {{ t('common.submit') }}
              </el-button>
            </template>
          </div>
        </header>

        <!-- 0.1.7 #13/#18：画布——设计器里有什么就展示什么（24 栅格直出），无其它信息 -->
        <div class="form-render-page__canvas">
          <div class="form-render-page__main">
            <h4 class="form-render-page__section">
              {{ t('workflow.formDataReadonlySnapshot') }}
            </h4>
            <div class="form-render-page__sheet">
              <div class="form-render-page__group">
                <div
                  v-for="field in renderFields"
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
                    :readonly="fieldReadonly(field)"
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

            <!-- 0.1.7 #30：有流程时，流程信息作为表单的外挂组件紧贴画布渲染（与任务详情同一控制面） -->
            <template v-if="hasProcessInfo">
              <h4 class="form-render-page__section">{{ t('workflow.approvalProgress') }}</h4>
              <div class="form-render-page__flowpanel">
                <InstanceFlowPanel
                  :approval-history="approvalHistory"
                  :process-definition-key="relation?.instance?.processDefKey ?? null"
                  :current-node-key="currentNodeKey"
                />
              </div>
            </template>

            <!-- 0.1.7 #30：审批人内联审批动作（意见默认备注 + 通过/驳回） -->
            <template v-if="isApprover">
              <h4 class="form-render-page__section">{{ t('workflow.approvalSection') }}</h4>
              <div class="form-render-page__actioncard">
                <el-input
                  v-model="actionComment"
                  type="textarea"
                  :rows="2"
                  maxlength="500"
                  :placeholder="t('common.remark')"
                />
                <div class="form-render-page__actioncard-actions">
                  <el-button
                    :loading="actionSubmitting === 'reject'"
                    @click="submitRelationAction('REJECT')"
                  >
                    {{ t('common.reject') }}
                  </el-button>
                  <el-button
                    type="primary"
                    :loading="actionSubmitting === 'approve'"
                    @click="submitRelationAction('APPROVE')"
                  >
                    {{ t('common.approve') }}
                  </el-button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </template>

    <!-- 0.1.7 #16：提交成功居中确认弹窗（需用户点击确认） -->
    <el-dialog
      v-model="submitDialogVisible"
      width="360px"
      align-center
      :close-on-click-modal="false"
      class="form-render-page__submit-dialog"
    >
      <el-result icon="success" title="提交成功" />
      <template #footer>
        <el-button
          round
          type="primary"
          data-testid="submit-dialog-confirm"
          @click="confirmSubmitDialog"
        >
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ── 0.1.7 #13/#15/#18：统一数据表单画布 ──
   全屏覆盖层：无通用侧边栏/页顶栏；顶部导航栏只留左上圆角返回与右上圆角动作；
   画布主体为设计器同款白色画布 + 24 栅格，设计器里有什么就展示什么。 */
.form-render-page {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  box-sizing: border-box;
  max-width: none !important;
  width: 100%;
  padding: 0;
  background: var(--sw-surface-page, #f5f7fa);
}

.form-render-page__top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
  box-sizing: border-box;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid var(--sw-border-light, #ebeef5);
}

.form-render-page__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.form-render-page__title {
  overflow: hidden;
  color: var(--sw-text-primary, #1f2a44);
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.form-render-page__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: 50%;
  background: #fff;
  color: var(--sw-text-regular, #606266);
  font-size: 16px;
  cursor: pointer;
}
.form-render-page__back:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.form-render-page__top-actions {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  flex-wrap: wrap;
}

.form-render-page__draft-title {
  width: 220px;
}

/* 画布：白色画布 + 外挂流程卡片，纵向紧凑排列 */
.form-render-page__canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 24px 24px;
}

/* 与详情弹窗（BusinessDetailDialog）同一版式：分区标题 + 白色卡片 */
.form-render-page__main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  /* 0.1.7 #29：画布宽度与表单设计器画布对齐（设计器画布=视口-658px 侧板，1280 下 622px），
     随视口同等比例放大，两边留白居中；窄屏回落铺满。
     0.1.7 #30：画布范围截止到最后一个组件（内容高度），不撑满剩余视口。 */
  max-width: min(100%, max(622px, calc(100vw - 658px)));
  margin: 0 auto;
}

.form-render-page__section {
  margin: 8px 0 0;
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.form-render-page__section:first-child {
  margin-top: 0;
}

.form-render-page__sheet {
  box-sizing: border-box;
  width: 100%;
  padding: 24px;
  background: #fff;
  border: 1px solid var(--sw-border-light, #ebeef5);
  border-radius: var(--sw-radius-card, 8px);
}

.form-render-page__alert {
  margin: 12px 24px 0;
}

/* 0.1.7 #30：外挂流程信息面板 / 审批动作卡——与画布同宽居中、紧贴表单 */
.form-render-page__flowpanel,
.form-render-page__actioncard {
  box-sizing: border-box;
  width: 100%;
}
.form-render-page__actioncard {
  padding: 16px;
  background: #fff;
  border: 1px solid var(--sw-border-light, #ebeef5);
  border-radius: var(--sw-radius-card, 8px);
}
.form-render-page__actioncard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.form-render-page__group {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-flow: row;
  column-gap: 16px;
  row-gap: 12px;
}

.form-render-page__field {
  min-width: 0;
  box-sizing: border-box;
}

.form-render-page__field-error {
  margin: var(--sw-space-4) 0 0;
  color: var(--sw-danger);
  font-size: var(--sw-font-caption);
  line-height: 1.5;
}

/* 窄屏：画布与顶栏收紧 */
@media (max-width: 767px) {
  .form-render-page__canvas {
    padding: 12px;
  }
  .form-render-page__sheet {
    padding: 16px 12px;
  }
}

.form-render-page :deep(input[readonly]),
.form-render-page :deep(textarea[readonly]),
.form-render-page :deep(.el-input.is-disabled .el-input__inner),
.form-render-page :deep(.el-textarea.is-disabled .el-textarea__inner),
.form-render-page :deep(.el-select.is-disabled .el-input__inner) {
  background: #f3f4f8;
  color: #909399;
  cursor: not-allowed;
}
</style>
