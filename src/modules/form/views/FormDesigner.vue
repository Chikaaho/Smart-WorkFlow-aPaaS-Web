<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 表单设计器工作台（P52）。
 *
 * 顶部工作台：表单身份（formKey/状态/版本）+ 保存状态五态 + 「表单设计 / 关联流程」
 * 工作区切换 + 保存 / 发布 / 历史版本。下方按工作区切换三栏设计器或关联流程面板。
 *
 * 关键契约（方向 §3）：
 *   - 表单身份由路由 :id（稳定业务标识）确定，F5 / 深链 / 重进可恢复，含工作区
 *     （query.tab）；表单不存在/已删除/无权 → 明确拒绝态，不回退其他表单。
 *   - 保存状态：未修改/未保存/保存中/保存成功/保存失败；失败不清除未保存标记。
 *   - 发布只针对最近一次成功保存的草稿：存在未保存修改时先走保存/放弃/取消保护，
 *     保存失败不得继续发布。
 *   - 切工作区、路由离开、关闭页签共用同一套脏状态保护。
 *   - 历史版本只读预览；历史内容零回写路径。
 *
 * P53：设计还原由生产组件树直接呈现（07 画布 / 11 字段清单弹窗 / 14 草稿历史弹窗），
 * 三栏与弹窗几何按设计稿移植到 FieldPalette / DesignerCanvas / FieldConfigPanel 与真实
 * 弹窗上；条目内容永远来自真实数据（注册表 / schema / 快照），不设静态设计副本。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { Back, Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type {
  FormSchema,
  FormSchemaField,
  TableSubField,
  VisibilityRule,
} from '@/contracts/form-schema'
import FieldPalette from '../designer/FieldPalette.vue'
import DesignerCanvas from '../designer/DesignerCanvas.vue'
import FieldConfigPanel from '../designer/FieldConfigPanel.vue'
import SubFieldDesigner from '../designer/SubFieldDesigner.vue'
import PreviewModal from '../designer/PreviewModal.vue'
import HistoryVersionsDialog from '../designer/HistoryVersionsDialog.vue'
import RelatedProcessesPanel from '../designer/RelatedProcessesPanel.vue'
import { saveDraftDefinition, publishDefinition as publishDef } from '../designer/draft-actions'
import { publishNewFormVersion } from '../api/form-def'
import { listCategories, queryCatalogItems } from '@/modules/workflow/api/oa'
import {
  resolveSaveState,
  saveStateKey,
  isDefinitionDirty,
  parseWorkbenchTab,
  LEAVE_GUARD_MESSAGE_KEY,
  type WorkbenchSavePhase,
  type WorkbenchTab,
} from '../designer/workbench'
import { applyFieldPatch, type FieldPatch } from '../designer/field-config'
import { getFieldTypeDescriptor, getFieldTypeStorage } from '../designer/field-types'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import { ApiError } from '@/foundation/request'
import { itemsToDefinition, definitionToItems } from '../designer/definition-convert'
import { getFormDefinitionById, getFormDefById, type FormDefStatus } from '../api/form-def'
import type { ProcessDef } from '@/contracts/bpm'
import type { DesignerItem } from '../designer/types'

const route = useRoute()
const router = useRouter()

/* ── 表单身份（稳定标识） ── */
const formId = ref<string | null>(null)
const formKey = ref<string>('')
const status = ref<FormDefStatus>('DRAFT')
const formVersion = ref<number | null>(null)
const formVersionLabel = ref<string | null>(null)
/** 身份加载失败（不存在/已删除/无权）：明确拒绝态，不回退其他表单。 */
const rejected = ref(false)
const rejectReason = ref('')
const rejectTitle = ref(t('form.cannotOpenTitle'))

/* ── 设计态 ── */
const title = ref(t('common.untitledForm'))
/** 表单描述（P53）：画布副标题；保存时随 definition 原样回传。 */
const description = ref<string | undefined>(undefined)
const items = ref<DesignerItem[]>([])
const selectedId = ref<string | null>(null)
/** 显隐联动规则（v0.0.2 P2）：按 target 存储每字段至多一条。 */
const visibilityRules = ref<VisibilityRule[]>([])
const previewVisible = ref(false)
// P53 节点 11：字段属性清单（受限只读，数据来自真实 schema computed）
const fieldsDialogVisible = ref(false)
const loading = ref(false)
/** 草稿已保存时间（P53 工作台文案：草稿已保存 HH:mm）。 */
const savedAtText = ref('')

/* ── 保存状态与脏标记 ── */
const baselineJson = ref<string>('')
const savePhase = ref<WorkbenchSavePhase>('idle')
/** 加载/保存请求序号：迟到响应不得覆盖当前表单状态。 */
let loadSeq = 0

const currentJson = computed(() => JSON.stringify(buildDefinition()))
const isDirty = computed(() => isDefinitionDirty(baselineJson.value, currentJson.value))
const saveState = computed(() => resolveSaveState(isDirty.value, savePhase.value))

/* ── 已发布标记（驱动灰化） ── */
const isPublished = computed(() => status.value === 'PUBLISHED')

/* ── 工作区（表单设计 / 关联流程），路由 query 可恢复 ── */
const activeTab = ref<WorkbenchTab>(parseWorkbenchTab(route.query.tab))

watch(activeTab, (tab) => {
  const current = parseWorkbenchTab(route.query.tab)
  if (current !== tab) {
    router.replace({ query: { ...route.query, tab: tab === 'design' ? undefined : tab } })
  }
})

// 外部导航（浏览器前进/后退）同步工作区
watch(
  () => route.query.tab,
  (raw) => {
    const tab = parseWorkbenchTab(raw)
    if (tab !== activeTab.value) activeTab.value = tab
  },
)

const existingNames = computed(() => items.value.map((it) => it.field.name))
const selectedItem = computed(() => items.value.find((it) => it.id === selectedId.value) ?? null)
const otherNames = computed(() =>
  items.value.filter((it) => it.id !== selectedId.value).map((it) => it.field.name),
)

/** 画布底部状态行（节点 07）：当前选中字段的真实 label / 类型名 / 24 栅格跨度。 */
const selectedFoot = computed(() => {
  const item = selectedItem.value
  if (!item) return null
  return {
    label: item.field.label || item.field.name,
    type: getFieldTypeDescriptor(item.field.type)?.label ?? item.field.type,
    span: getFormFieldColSpan(item.field),
  }
})

/** 控件库点击添加与拖入使用同一 DesignerItem 形态，点击后立即选中新字段。 */
function addPaletteItem(item: DesignerItem) {
  if (isPublished.value) return
  items.value.push(item)
  selectedId.value = item.id
}

/** 配置面板回写：就地把补丁合并进选中字段；字段标识改名时显隐规则同步跟随。 */
function patchSelectedField(patch: FieldPatch) {
  const item = items.value.find((it) => it.id === selectedId.value)
  if (!item) return
  const oldName = item.field.name
  applyFieldPatch(item.field, patch)
  if (patch.name && patch.name !== oldName) {
    // V011-BUG-016：改名后规则 target 与条件字段引用同步更新，避免规则悬空
    visibilityRules.value = visibilityRules.value.map((rule) =>
      renameInRule(rule, oldName, patch.name!),
    )
  }
}

/** 显隐规则内的字段名替换（target + 全部条件字段）。 */
function renameInRule(rule: VisibilityRule, from: string, to: string): VisibilityRule {
  return {
    ...rule,
    target: rule.target === from ? to : rule.target,
    conditions: rule.conditions.map((c) => (c.field === from ? { ...c, field: to } : c)),
  }
}

/** 面包屑文本（V011-BUG-011）：所属分类 → 表单名；未分类/未绑定目录项时仅表单名。 */
const breadcrumbText = computed(() => {
  const name = title.value || t('common.untitledForm')
  return categoryName.value ? `${categoryName.value} / ${name}` : name
})

/** 选中字段显隐规则（null=未配置），供配置面板回显。 */
const selectedRule = computed<VisibilityRule | null>(() => {
  const name = selectedItem.value?.field.name
  if (!name) return null
  return visibilityRules.value.find((r) => r.target === name) ?? null
})

/** 规则条件候选字段名：除选中字段外的全部字段。 */
const ruleFieldNames = computed<string[]>(() => {
  const selected = selectedItem.value?.field.name
  return items.value.map((it) => it.field.name).filter((n) => n !== selected)
})

function updateSelectedRule(rule: VisibilityRule | null) {
  const name = selectedItem.value?.field.name
  if (!name) return
  const others = visibilityRules.value.filter((r) => r.target !== name && r.target !== rule?.target)
  visibilityRules.value = rule ? [...others, rule] : others
}

/* ── 子表盖层编辑（独立状态，与主画布隔离） ── */
const editingTableId = ref<string | null>(null)
const editingTableField = computed(() => {
  const item = items.value.find((it) => it.id === editingTableId.value)
  return item && item.field.type === 'TABLE' ? item.field : null
})

function openTableEditor(id: string) {
  if (isPublished.value) return
  editingTableId.value = id
}

function closeTableEditor(subFields: TableSubField[]) {
  const item = items.value.find((it) => it.id === editingTableId.value)
  if (item && item.field.type === 'TABLE') {
    item.field.subFields = subFields
  }
  editingTableId.value = null
}

function buildDefinition(): FormSchema {
  return itemsToDefinition(items.value, title.value, visibilityRules.value, description.value)
}

const previewSchema = computed<FormSchema>(() => buildDefinition())

/* ── 回显已存设计（身份 + 定义，带迟到响应防护） ── */

async function loadForm(id: string) {
  const seq = ++loadSeq
  loading.value = true
  try {
    // 身份与定义并行取；任一失败即进入拒绝态
    const [defDto, schema] = await Promise.all([getFormDefById(id), getFormDefinitionById(id)])
    if (seq !== loadSeq) return // 迟到响应：已有更新的加载接管
    formKey.value = defDto.formKey
    status.value = defDto.status
    formVersion.value = defDto.formVersion ?? null
    formVersionLabel.value = defDto.versionLabel ?? null
    if (defDto.name) title.value = defDto.name
    title.value = schema.title || title.value
    description.value = schema.description
    items.value = definitionToItems(schema)
    visibilityRules.value = schema.rules?.visibility ? [...schema.rules.visibility] : []
    rejected.value = false
    void loadBreadcrumbCategory()
    await nextTick()
    baselineJson.value = JSON.stringify(buildDefinition())
    savedAtText.value = formatClock(new Date())
    savePhase.value = 'idle'
  } catch (err) {
    if (seq !== loadSeq) return
    rejected.value = true
    // 优先用 ApiError 携带的后端中文 message（如"表单不存在"），
    // 避免"业务错误(1300)"这类不可读兜底；403 明确为无权限拒绝态
    if (err instanceof ApiError && err.code === 403) {
      rejectTitle.value = t('form.noAccessTitle')
      rejectReason.value = err.msg || t('form.noViewPermission')
    } else {
      rejectReason.value =
        err instanceof ApiError && err.msg ? err.msg : t('form.notFoundOrNoAccess')
    }
    ;(globalThis as unknown as { __loadErr?: unknown }).__loadErr = {
      name: (err as { name?: string }).name,
      code: (err as { code?: unknown }).code,
      msg: (err as { msg?: string }).msg,
      message: (err as Error).message,
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function resetWorkbench() {
  formId.value = null
  formKey.value = ''
  status.value = 'DRAFT'
  formVersion.value = null
  formVersionLabel.value = null
  rejected.value = false
  rejectReason.value = ''
  rejectTitle.value = t('form.cannotOpenTitle')
  title.value = t('common.untitledForm')
  items.value = []
  selectedId.value = null
  editingTableId.value = null
  baselineJson.value = JSON.stringify(buildDefinition())
  savePhase.value = 'idle'
}

onMounted(() => {
  globalThis.addEventListener('beforeunload', handleBeforeUnload)
  const idParam = route.params.id as string | undefined
  if (idParam) {
    formId.value = idParam
    loadForm(idParam)
  } else {
    // 新建态：空白画布，基线为空设计
    baselineJson.value = JSON.stringify(buildDefinition())
  }
})

// 同组件路由参数变化（如拒绝态/表单A → 表单B）时组件被复用、onMounted 不再触发，
// 必须显式响应 :id 变更并重新加载，否则页面停留在上一个表单/拒绝态
watch(
  () => route.params.id,
  (next) => {
    const idParam = typeof next === 'string' ? next : undefined
    const current = formId.value ?? undefined
    if ((idParam ?? null) === (current ?? null)) return
    if (!idParam) {
      resetWorkbench()
      return
    }
    formId.value = idParam
    loadForm(idParam)
  },
)

onBeforeUnmount(() => {
  globalThis.removeEventListener('beforeunload', handleBeforeUnload)
})

/* ── 脏状态离开保护（保存 / 放弃 / 取消，统一语义） ── */

/**
 * @returns 'proceed' 可继续；'abort' 用户取消或保存失败（不得继续后续动作）。
 */
async function guardUnsavedChanges(): Promise<'proceed' | 'abort'> {
  if (!isDirty.value) return 'proceed'
  // V011-BUG-015：已发布表单无草稿可存——离开只问「丢弃/留下」
  if (isPublished.value) {
    try {
      await ElMessageBox.confirm(
        t('form.unsavedPublishedLeaveWarning'),
        t('form.unsavedChangesTitle'),
        {
          type: 'warning',
          confirmButtonText: t('form.discardAndContinue'),
          cancelButtonText: t('common.cancel'),
        },
      )
      // 放弃修改：以基线还原，再放行导航
      const baseline = JSON.parse(baselineJson.value) as FormSchema
      items.value = definitionToItems(baseline)
      if (baseline.title) title.value = baseline.title
      baselineJson.value = currentJson.value
      return 'proceed'
    } catch {
      return 'abort'
    }
  }
  let action: 'save' | 'discard' | 'cancel'
  try {
    await ElMessageBox.confirm(t(LEAVE_GUARD_MESSAGE_KEY), t('form.unsavedChangesTitle'), {
      distinguishCancelAndClose: true,
      get confirmButtonText() {
        return t('form.saveAndContinue')
      },
      get cancelButtonText() {
        return t('form.discardAndContinue')
      },
      type: 'warning',
    })
    action = 'save'
  } catch (reason) {
    action = reason === 'cancel' ? 'discard' : 'cancel'
  }

  if (action === 'cancel') return 'abort'
  if (action === 'discard') {
    // 放弃修改：以当前基线为准，丢弃未保存内容（含表单标题——title 不在 items 内，需一并还原）
    const baseline = JSON.parse(baselineJson.value) as FormSchema
    items.value = definitionToItems(baseline)
    if (baseline.title) title.value = baseline.title
    baselineJson.value = currentJson.value
    return 'proceed'
  }
  // 保存并继续：保存失败不得继续
  const saved = await doSave()
  return saved ? 'proceed' : 'abort'
}

/** 切工作区：脏状态先过保护，取消则回弹原工作区。 */
async function onTabChange(tab: WorkbenchTab) {
  if (tab === activeTab.value) return
  // 先守卫后提交：abort 时不动 activeTab 也不写 URL，避免 query watcher
  // 在回弹后按旧 URL 又把工作区翻回去（取消分支竞态）
  const verdict = await guardUnsavedChanges()
  if (verdict === 'abort') return
  activeTab.value = tab
  if (parseWorkbenchTab(route.query.tab) !== tab) {
    router.replace({ query: { ...route.query, tab: tab === 'design' ? undefined : tab } })
  }
}

function handleBeforeUnload(e: { preventDefault: () => void; returnValue: string }) {
  if (isDirty.value) {
    e.preventDefault()
    // beforeunload 需设置 returnValue 才会触发浏览器离开确认
    e.returnValue = ''
  }
}

// 路由脏状态保护：工作台内参数跳转（/form/designer/A → B）与跳离工作台
// 分别触发 beforeRouteUpdate / beforeRouteLeave（同一次导航可能先后触发两个钩子），
// 以「to|from」为键去重，保证一次导航至多弹一次守卫。
const lastRouteGuard: { key: string; promise: Promise<boolean> | null } = { key: '', promise: null }
async function routeDirtyGuard(to: { fullPath: string }, from: { fullPath: string }) {
  const key = `${to.fullPath}|${from.fullPath}`
  // 同一次导航的 leave/update 钩子共享同一次询问
  if (lastRouteGuard.key === key && lastRouteGuard.promise) return lastRouteGuard.promise
  lastRouteGuard.key = key
  const promise = (async () => (await guardUnsavedChanges()) === 'proceed')()
  lastRouteGuard.promise = promise
  // 导航结束后清除缓存：后续同类导航需重新询问
  void promise.finally(() => {
    globalThis.setTimeout(() => {
      if (lastRouteGuard.key === key) {
        lastRouteGuard.key = ''
        lastRouteGuard.promise = null
      }
    }, 0)
  })
  return promise
}
onBeforeRouteLeave(routeDirtyGuard)
onBeforeRouteUpdate(routeDirtyGuard)

/* ── 保存草稿 ── */

/** @returns 保存是否成功。 */
async function doSave(): Promise<boolean> {
  if (rejected.value) return false
  if (isPublished.value) return false
  if (savePhase.value === 'saving') return false // 保存中防重复提交

  const definition = buildDefinition()
  const key = formKey.value || generateFormKey(title.value)
  const seq = loadSeq

  savePhase.value = 'saving'
  try {
    const result = await saveDraftDefinition(definition, formId.value, key)
    if (seq !== loadSeq) return true
    if (!formId.value && result.id) {
      formId.value = result.id
      formKey.value = key
      status.value = result.status
      router.replace({ path: `/form/designer/${result.id}`, query: route.query })
    }
    formVersion.value = formVersion.value ?? 1
    baselineJson.value = JSON.stringify(definition)
    savedAtText.value = formatClock(new Date())
    savePhase.value = 'saved'
    globalThis.setTimeout(() => {
      if (savePhase.value === 'saved') savePhase.value = 'idle'
    }, 2000)
    return true
  } catch {
    // 失败：保留未保存标记与内容，不得显示成功
    savePhase.value = 'error'
    return false
  }
}

async function saveDraft() {
  await doSave()
}

/* ── V011-BUG-015：已发布表单发布新版本（原子落库，不经草稿） ── */

async function publishNewVersion() {
  if (rejected.value || !formId.value) return
  if (savePhase.value === 'saving') return
  const preCheckError = preValidateBeforePublish(items.value)
  if (preCheckError) {
    ElMessage.warning(preCheckError)
    return
  }
  try {
    await ElMessageBox.confirm(
      t('form.publishNewVersionConfirm'),
      t('common.publishConfirmTitle'),
      {
        confirmButtonText: t('form.publishNewVersion'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )
  } catch {
    return
  }
  savePhase.value = 'saving'
  try {
    await publishNewFormVersion(formId.value, JSON.stringify(buildDefinition()))
    savePhase.value = 'idle'
    ElMessage.success(t('form.publishNewVersionSuccess'))
    loadForm(formId.value)
  } catch {
    savePhase.value = 'error'
  }
}

/* ── 发布（只针对最近一次成功保存的当前草稿） ── */

async function publish() {
  if (rejected.value) return
  if (isPublished.value) return
  if (!formId.value) {
    ElMessage.warning(t('form.saveBeforePublish'))
    return
  }
  // 有未保存修改：先走统一保护；保存失败/用户取消不得继续发布
  const verdict = await guardUnsavedChanges()
  if (verdict === 'abort') return

  // 客户端预校验（减往返 UX）
  const preCheckError = preValidateBeforePublish(items.value)
  if (preCheckError) {
    ElMessage.warning(preCheckError)
    return
  }

  try {
    await ElMessageBox.confirm(t('form.publishConfirm'), t('common.publishConfirmTitle'), {
      get confirmButtonText() {
        return t('form.publishConfirmTitle')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }

  const definition = buildDefinition()
  try {
    await publishDef(definition, formId.value)
    status.value = 'PUBLISHED'
    formVersion.value = (formVersion.value ?? 1) + 1
    // 以服务端权威身份回读（版本/状态在刷新后仍一致）
    loadForm(formId.value)
  } catch {
    // 错误已在 draft-actions 中处理
  }
}

/* ── 历史版本（只读对比 + 恢复为新草稿） ── */
const historyVisible = ref(false)

/** 恢复草稿成功后重载工作台（迟到响应防护由 loadForm 自带）。 */
function reloadAfterRestore() {
  if (formId.value) loadForm(formId.value)
}

/* ── 字段属性清单（节点 11）：搜索 / 导出 / 存储类型族展示，数据全部来自真实 schema ── */
const fieldSearch = ref('')
const filteredFields = computed(() => {
  const kw = fieldSearch.value.trim().toLowerCase()
  if (!kw) return previewSchema.value.fields
  return previewSchema.value.fields.filter(
    (f) => (f.label ?? '').toLowerCase().includes(kw) || f.name.toLowerCase().includes(kw),
  )
})

/** 字段类型 → 存储列类型族（展示语义，映射见 field-types 共享表）。 */
function storageTypeOf(type: string): string {
  return getFieldTypeStorage(type)
}

/** 约束 / 状态：按字段真实契约属性派生的只读标注。 */
function constraintOf(field: FormSchemaField): string {
  if (field.type === 'DICT') return t('fieldList.constraintDict')
  if (field.type === 'DATE' || field.type === 'TIME') return t('fieldList.constraintDate')
  if (field.type === 'DEPT') return t('fieldList.constraintDept')
  if (field.type === 'ATTACHMENT' || field.type === 'IMAGE')
    return t('fieldList.constraintAttachment')
  if (field.type === 'REFERENCE') return t('fieldList.constraintReference')
  if (field.type === 'FORMULA') return t('fieldList.constraintFormula')
  if (field.required) return t('fieldList.constraintRequired')
  return field.length ? t('fieldList.constraintLength') : t('fieldList.constraintPublished')
}

/** 导出字段清单 JSON（真实下载，内容 = 当前 schema fields）。 */
function exportFields() {
  const blob = new globalThis.Blob([JSON.stringify(previewSchema.value.fields, null, 2)], {
    type: 'application/json',
  })
  const url = globalThis.URL.createObjectURL(blob)
  const a = globalThis.document.createElement('a')
  a.href = url
  a.download = `${formKey.value || 'form'}-fields.json`
  a.click()
  globalThis.URL.revokeObjectURL(url)
  ElMessage.success(t('fieldList.exported'))
}

/* ── 关联流程 ── */

function enterProcess(def: ProcessDef) {
  // V011-BUG-019：编辑=当前页直接进入该流程的网格设计器（不再跳流程总列表页）
  router.push(
    `/workflow/defs/${def.id}/design?from=form-workbench&formId=${formId.value ?? ''}&formKey=${formKey.value}`,
  )
}

/* ── 辅助函数 ── */

/** HH:mm 时钟文案（草稿已保存时间）。 */
function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function generateFormKey(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'form_' + Date.now()
  const slug = trimmed
    .replace(/[^a-zA-Z0-9_一-龥]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .slice(0, 30)
  return slug || 'form_' + Date.now()
}

function preValidateBeforePublish(list: DesignerItem[]): string | null {
  for (const item of list) {
    const field = item.field
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
      return t('form.invalidColumnName', { name: field.name })
    }
    if (field.type === 'DICT' && !field.dictType) {
      return t('form.dictFieldNoType', { name: field.name })
    }
    if (field.type === 'REFERENCE' && !field.targetFormId) {
      return t('form.referenceFieldNoTarget', { name: field.name })
    }
    if (field.type === 'TABLE' && field.subFields.length === 0) {
      return t('form.subTableNoColumns', { name: field.name })
    }
  }
  return null
}

function backToList() {
  router.push({ name: 'form-def-list' })
}

function onSettingsCommand(command: string) {
  if (command === 'field-list') {
    fieldsDialogVisible.value = true
  }
}

/* ── V011-BUG-011：面包屑分类（可发起事项目录反查 formKey 所属分类） ── */
const categoryName = ref<string | null>(null)
const breadcrumbLoadedFor = ref('')

async function loadBreadcrumbCategory() {
  if (!formKey.value || breadcrumbLoadedFor.value === formKey.value) return
  breadcrumbLoadedFor.value = formKey.value
  try {
    const [categories, itemsPage] = await Promise.all([
      listCategories(),
      queryCatalogItems({ pageNum: 1, pageSize: 200 }),
    ])
    const item = itemsPage.list.find((it) => it.formKey === formKey.value)
    categoryName.value = item?.categoryId
      ? (categories.find((c) => c.id === item.categoryId)?.name ?? null)
      : null
  } catch {
    categoryName.value = null
  }
}
</script>

<template>
  <div class="designer">
    <!-- ═══ 顶部工作台（拒绝态下整体不渲染，操作区零暴露） ═══
         P53 节点07：左「设置 + 面包屑」/ 中工作区页签 / 右保存状态与操作组 -->
    <header v-if="!rejected" class="designer__workbench">
      <div class="designer__crumb">
        <!-- V011-BUG-017：返回表单列表放为显式入口，不再藏在设置下拉里 -->
        <el-button class="designer__back" @click="backToList">
          <el-icon><Back /></el-icon>
          <span>{{ t('form.backToList') }}</span>
        </el-button>
        <el-dropdown class="designer__settings-menu" trigger="click" @command="onSettingsCommand">
          <el-button class="designer__settings">
            <el-icon><Setting /></el-icon>
            <span>{{ t('form.workbenchSettings') }}</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="field-list">{{ t('fieldList.button') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- V011-BUG-010：保存状态从动作组移到左侧信息簇，动作组只留可点按钮 -->
        <span class="designer__save-state" :class="'designer__save-state--' + saveState">
          {{
            saveState === 'unchanged'
              ? t('form.draftSavedAt', { time: savedAtText })
              : t(saveStateKey(saveState))
          }}
        </span>
        <!-- V011-BUG-011：面包屑=所属分类（可发起事项目录反查）→ 表单名 -->
        <span class="designer__crumb-path">/ {{ breadcrumbText }}</span>
      </div>

      <nav class="designer__tabs" aria-label="工作区切换">
        <button
          type="button"
          class="designer__tab"
          :class="{ 'is-active': activeTab === 'design' }"
          @click="onTabChange('design' as WorkbenchTab)"
        >
          {{ t('form.tabDesign') }}
        </button>
        <button
          type="button"
          class="designer__tab"
          :class="{ 'is-active': activeTab === 'processes' }"
          @click="onTabChange('processes' as WorkbenchTab)"
        >
          {{ t('form.tabProcesses') }}
        </button>
      </nav>

      <div class="designer__actions">
        <el-button :disabled="!formId" @click="historyVisible = true">{{
          t('form.draftHistoryEntry')
        }}</el-button>
        <!-- V011-BUG-015：已发布表单以「发布新版本」替代 保存/发布（原子落库，不经草稿） -->
        <el-button
          v-if="isPublished"
          type="primary"
          :disabled="saveState === 'saving'"
          @click="publishNewVersion"
          >{{ t('form.publishNewVersion') }}</el-button
        >
        <template v-else>
          <el-button :disabled="saveState === 'saving'" @click="saveDraft">{{
            t('common.save')
          }}</el-button>
          <el-button type="primary" :disabled="saveState === 'saving'" @click="publish">{{
            t('common.publish')
          }}</el-button>
        </template>
      </div>
    </header>

    <!-- 拒绝态：表单不存在/已删除/无权，不回退到其他表单 -->
    <div v-if="rejected" class="designer__rejected">
      <p class="designer__rejected-title">{{ rejectTitle }}</p>
      <p class="designer__rejected-reason">{{ rejectReason }}</p>
      <el-button type="primary" @click="backToList">{{ t('form.backToList') }}</el-button>
    </div>

    <template v-else>
      <div v-if="loading" class="designer__loading">
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- ═══ 工作区：表单设计（节点 07 三栏几何：252 组件库 / 弹性画布 / 336 属性面板） ═══
           V011-BUG-015：已发布表单解锁编辑（编辑 → 「发布新版本」原子落库，
           服务端 publish-version 增量 DDL + 版本递增），不再整体灰置 -->
      <div v-else-if="activeTab === 'design'" class="designer__body">
        <div class="designer__palettecol">
          <FieldPalette
            class="designer-main-palette"
            :existing-names="existingNames"
            @add="addPaletteItem"
          />
          <p class="designer__palette-note">{{ t('form.paletteDragHint') }}</p>
        </div>

        <div class="designer__canvascol">
          <div class="designer__canvas-meta">
            <b class="designer__canvas-device">{{ t('form.canvasDeviceLabel') }}</b>
            <el-button
              link
              type="primary"
              class="designer__canvas-fields"
              @click="fieldsDialogVisible = true"
              >{{ t('fieldList.button') }}</el-button
            >
            <el-button class="designer__canvas-preview" @click="previewVisible = true">{{
              t('common.preview')
            }}</el-button>
          </div>
          <!-- V011-BUG-006：画布内不再渲染「未命名表单」标题块与 12 栏标尺（Owner 2026-09-22）；
               表单名称在新建时输入（V011-BUG-014），设计态名称见面包屑 -->
          <div class="designer__sheet">
            <DesignerCanvas
              class="designer-main-canvas"
              v-model:items="items"
              v-model:selected-id="selectedId"
              @edit-table="openTableEditor"
            />
          </div>
          <p class="designer__canvas-foot">
            {{
              selectedFoot ? t('form.canvasFootSelected', selectedFoot) : t('form.canvasFootEmpty')
            }}
          </p>
        </div>

        <FieldConfigPanel
          class="designer-main-config"
          :field="selectedItem"
          :other-names="otherNames"
          :key-locked="isPublished"
          :rule="selectedRule"
          :rule-field-names="ruleFieldNames"
          @update="patchSelectedField"
          @update-rule="updateSelectedRule"
        />
      </div>

      <!-- ═══ 工作区：关联流程 ═══ -->
      <RelatedProcessesPanel
        v-else
        :form-id="formId ?? ''"
        :form-key="formKey"
        @enter-process="enterProcess"
      />
    </template>

    <!-- 子表盖层子画布：盖在主画布之上，独立状态编辑该子表的内部字段 -->
    <SubFieldDesigner
      v-if="editingTableField && activeTab === 'design'"
      :table-label="editingTableField.label || editingTableField.name"
      :sub-fields="editingTableField.subFields"
      @close="closeTableEditor"
    />

    <!-- 字段属性清单（节点 11 只读组件）：搜索/导出为真实能力；
         列集与约束标注全部来自真实 schema 属性派生 -->
    <el-dialog
      v-model="fieldsDialogVisible"
      :title="t('fieldList.title')"
      width="1040px"
      class="fields-dialog"
    >
      <p class="fields-dialog__sub">{{ t('fieldList.subtitle') }}</p>
      <div class="fields-dialog__toolbar">
        <el-input
          v-model="fieldSearch"
          class="fields-dialog__search"
          :placeholder="t('fieldList.searchPlaceholder')"
          clearable
        />
        <el-button class="fields-dialog__export" @click="exportFields">{{
          t('fieldList.exportFields')
        }}</el-button>
      </div>
      <el-table :data="filteredFields" size="small" max-height="448">
        <el-table-column :label="t('fieldList.colName')" width="172">
          <template #default="{ row }">{{ row.label || row.name }}</template>
        </el-table-column>
        <el-table-column :label="t('fieldList.colKey')" width="221">
          <template #default="{ row }"
            ><code class="fields-dialog__key">{{ row.name }}</code></template
          >
        </el-table-column>
        <el-table-column :label="t('fieldList.colType')" width="140">
          <template #default="{ row }">{{ storageTypeOf(row.type) }}</template>
        </el-table-column>
        <el-table-column :label="t('fieldList.colLength')" width="90">
          <template #default="{ row }">{{ row.length ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('fieldList.colSpan')" width="103">
          <template #default="{ row }">{{
            t('fieldList.spanCell', { n: (row.colSpan ?? 12) / 2 })
          }}</template>
        </el-table-column>
        <el-table-column :label="t('fieldList.colRequired')" width="57">
          <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column :label="t('fieldList.colConstraint')" min-width="200">
          <template #default="{ row }">{{ constraintOf(row as FormSchemaField) }}</template>
        </el-table-column>
      </el-table>
      <p class="fields-dialog__note">{{ t('fieldList.note') }}</p>
      <template #footer>
        <el-button type="primary" class="fields-dialog__close" @click="fieldsDialogVisible = false"
          >&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{
            t('fieldList.backToDesigner')
          }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</el-button
        >
      </template>
    </el-dialog>

    <PreviewModal v-model:visible="previewVisible" :schema="previewSchema" />

    <HistoryVersionsDialog
      v-if="formId"
      v-model:visible="historyVisible"
      :form-id="formId"
      :form-key="formKey"
      :form-version="formVersion"
      :form-version-label="formVersionLabel"
      @restored="reloadAfterRestore"
    />
  </div>
</template>

<style scoped>
.designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

/* ═══ 顶部工具条（节点 07：56px 白底；V011-BUG-010/012 重排：左信息簇 / 中居中 tab / 右动作组） ═══ */
.designer__workbench {
  box-sizing: border-box;
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  border-bottom: 1px solid #dde3ef;
  background: #fff;
  position: relative;
}

/* 左侧：返回 + 设置 + 保存状态 + 面包屑（V011-BUG-010 信息簇） */
.designer__crumb {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

/* V011-BUG-017：返回表单列表为显式入口 */
.designer__back {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #303a55;
}
.designer__back :deep(.el-icon) {
  margin-right: 4px;
}

.designer__settings {
  width: 110px;
  height: 36px;
  padding: 0 22px 0 26px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 19px;
  color: #303a55;
}

.designer__settings-menu {
  display: inline-flex;
}

.designer__settings :deep(.el-icon) {
  margin-right: 8px;
}

.designer__crumb-path {
  font-size: 12px;
  color: #7e89a1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 表单设计 / 流程设计 tab：V011-BUG-012 在工具条内水平居中 */
.designer__tabs {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  height: 48px;
  gap: 24px;
}

.designer__tab {
  height: 48px;
  padding: 0 44px;
  border: 0;
  background: transparent;
  font-size: 14px;
  line-height: 20px;
  color: #8a96ad;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.designer__tab:hover {
  color: var(--sw-color-primary);
}

.designer__tab.is-active {
  color: var(--sw-color-primary);
  font-weight: 600;
  border-bottom-color: var(--sw-color-primary);
}

.designer__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.designer__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* 设计07/08：草稿历史 88 / 保存 64 / 发布 64，12px 文本 16px 行盒 */
.designer__actions :deep(.el-button) {
  width: 64px;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 16px;
  border-radius: 6px;
}
.designer__actions :deep(.el-button:not(.el-button--primary)) {
  color: #19233b;
}

.designer__actions :deep(button.el-button:first-of-type) {
  width: 88px;
}

/* 草稿状态：设计稿为纯文字态（含已保存时钟） */
.designer__save-state {
  font-size: 12px;
  line-height: 16px;
  color: #8a96ad;
  white-space: nowrap;
}

.designer__rejected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sw-space-12);
}

.designer__rejected-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-text-primary, #303133);
}

.designer__rejected-reason {
  margin: 0;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}

.designer__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--sw-text-secondary);
  font-size: 14px;
}

/* ═══ 三栏主体（节点 07：252 / 弹性 / 336） ═══ */
.designer__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--sw-surface-page, #f4f6fb);
}

/* ── 左栏：组件库（白底，分组条目 2 列栅格 + 底部提示） ── */
.designer__palettecol {
  box-sizing: border-box;
  width: 252px;
  flex: 0 0 252px;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 19px 20px 46px;
  background: #fff;
  border-right: 1px solid #d7deed;
}

.designer__palettecol :deep(.palette) {
  width: auto;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  border-right: 0;
  overflow-y: auto;
}

.designer__palettecol :deep(.palette__title) {
  margin: 0 0 14px;
  font-size: 18px;
}

.designer__palettecol :deep(.palette__search) {
  margin-bottom: 34px;
}

.designer__palettecol :deep(.palette-group:first-of-type) {
  margin-top: 0;
}

.designer__palettecol :deep(.palette-group__title) {
  margin: 0 0 3px;
}

.designer__palettecol :deep(.palette__list) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 9px;
  transform: translateY(1px);
}

.designer__palettecol :deep(.palette__item) {
  height: 38px;
  gap: 6px;
  padding: 0 8px;
  font-size: 12px;
  color: #71809e;
  background: #fff;
  border: 1px solid #cbd5e7;
  border-radius: 6px;
}
.designer__palettecol :deep(.palette__icon) {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  font-size: 18px;
}

.designer__palettecol :deep(.palette__item:hover) {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}

.designer__palettecol :deep(.palette--disabled .palette__item:hover) {
  border-color: #cbd5e7;
  color: #71809e;
}

.designer__palette-note {
  flex: 0 0 auto;
  margin: 14px 0 0;
  font-size: 11px;
  color: #9aa6bd;
}

/* ── 中栏：画布（meta 条 + 白底表单卡 + 字段栅格 + 底部状态行）；V011-BUG-009 画布随中栏填满 ── */
.designer__canvascol {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 24px 12px 24px;
  background: #f4f6fc;
}

.designer__canvas-meta {
  height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  gap: 40px;
  color: #8794ae;
  font-size: 12px;
}

.designer__canvas-device {
  font-size: 14px;
  font-weight: 600;
  line-height: 17px;
  margin-top: -6px;
  color: var(--sw-text-regular, #303a55);
}

.designer__canvas-preview {
  margin-left: auto;
  width: 88px;
  height: 36px;
  padding: 0 12px;
  border-radius: 6px;
  justify-content: flex-start;
  text-align: left;
  transform: translate(-2px, -6px);
}

.designer__canvas-fields {
  display: none;
  height: 22px;
  padding: 0 4px;
  font-size: 12px;
  color: #5f6f92;
}

.designer__canvas-fields + .designer__canvas-preview {
  margin-left: auto;
  width: 88px;
}

/* V011-BUG-009：画布白卡随中栏剩余高度填满（不再固定 740px） */
.designer__sheet {
  flex: 1 1 auto;
  min-height: 520px;
  overflow-y: auto;
  box-sizing: border-box;
  margin-top: 12px;
  padding: 21px 23px 20px;
  background: #fff;
  border: 1px solid #dde3ef;
  border-radius: 12px;
  box-shadow: 0 2px 9px rgba(58, 75, 110, 0.08);
}

/* 画布内嵌：去掉独立底色/内边距，滚动交给白底表单卡 */
.designer__canvascol .designer-main-canvas {
  flex: 0 1 auto;
  padding: 0;
  background: transparent;
  overflow: visible;
}

.designer-main-canvas :deep(.canvas__list) {
  max-width: none;
  padding-top: 22px;
  row-gap: 21px;
  column-gap: 12px;
}

.designer-main-canvas :deep(.field-shell) {
  border-color: #e3e9f4;
  border-radius: 8px;
  box-shadow: none;
}

.designer-main-canvas :deep(.field-shell--active) {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 2px var(--sw-color-primary-soft, #ece9ff);
}

/* 节点07 画布行距：设计 label→label 节距 ≈97px */
.designer-main-canvas {
  --el-input-height: 36px;
}

.designer-main-canvas :deep(.el-form-item) {
  margin-bottom: 0;
}

.designer-main-canvas :deep(.el-form-item__label) {
  height: auto;
  line-height: 20px;
  margin-bottom: 7px;
  padding-bottom: 0;
  font-size: 13px;
  color: #303a55;
}
.designer-main-canvas :deep(.el-input__wrapper),
.designer-main-canvas :deep(.el-select__wrapper),
.designer-main-canvas :deep(.el-textarea__inner) {
  min-height: 34px;
  height: 34px;
  box-sizing: border-box;
}

.designer-main-canvas :deep(.canvas__list) {
  row-gap: 21px;
  column-gap: 12px;
}

.designer__canvas-foot {
  flex: 0 0 auto;
  margin: 12px 0 0;
  font-size: 12px;
  color: #8a96ae;
}

/* ── 右栏：组件属性（336 白底，标题 + 类型徽标） ── */
.designer__body > .designer-main-config {
  box-sizing: border-box;
  width: 336px;
  flex: 0 0 336px;
  padding: 20px 24px 16px 23px;
  background: #fff;
  border-left: 1px solid #d7deed;
}

.designer-main-config :deep(.config__title) {
  margin: 0 0 10px;
  font-size: 18px;
}

.designer-main-config :deep(.config__section:first-of-type) {
  margin-top: 20px;
}

.designer-main-config :deep(.config__extension) {
  box-sizing: border-box;
  width: 288px;
  height: 72px;
  padding: 16px 29px 15px 17px;
  transform: translateY(3px);
}

.designer-main-config :deep(.rules-editor) {
  margin-top: 64px;
}

.designer-main-config :deep(.config__meta) {
  justify-content: space-between;
}

.designer-main-config :deep(.config__type) {
  height: 24px;
  line-height: 24px;
  padding: 0 18px;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft, #ece9ff);
  border-radius: 6px;
}

.designer__published-bar {
  padding: var(--sw-space-8) var(--sw-space-24);
  background: var(--sw-color-warning-bg, #fdf6ec);
  color: var(--sw-color-warning, #e6a23c);
  font-size: 13px;
  text-align: center;
  border-top: 1px solid var(--sw-border-light);
}

/* ── 字段清单弹窗（节点 11）：工具行 + 槽位内容文本 ── */
.fields-dialog__sub {
  /* 设计（节点11）：副标题紧随标题（-15 拉回 header 底距），工具行距其下 29px */
  margin: -15px 0 32px;
  font-size: 12px;
  color: #8c9ab1;
}
.fields-dialog__toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 20px;
}
.fields-dialog__search {
  width: 420px;
}
.fields-dialog__search :deep(.el-input__wrapper) {
  height: 36px;
  min-height: 36px;
  border-radius: 8px;
}
.fields-dialog__search :deep(.el-input__inner) {
  position: relative;
  left: -9px;
  width: calc(100% + 9px);
  padding-left: 12px !important;
}
.fields-dialog__export {
  margin-left: auto;
  width: 132px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
}
.fields-dialog__key {
  font-size: 12px;
  color: var(--sw-color-primary);
}
.fields-dialog__note {
  margin: 18px 0 0;
  font-size: 12px;
  color: #8c99b0;
}
.fields-dialog__close {
  width: 142px;
  height: 36px;
  border-radius: 6px;
}
.fields-dialog__close :deep(span) {
  display: block;
  width: 118px;
  text-align: center;
}
</style>

<style>
/* ═══ P53 弹窗几何（节点 11 字段属性列表 / 节点 14 草稿历史版本） ═══
   el-dialog 内部节点（header/body/footer/表格）不带本组件 scoped 属性，
   且历史弹窗 append-to-body，故该段使用全局作用域；两个类名均为本页专用。 */
.el-dialog.fields-dialog {
  --el-dialog-padding-primary: 0px;
  --el-dialog-border-radius: 14px;
}
.el-dialog.fields-dialog .el-dialog__header {
  padding: 24px 76px 16px 28px;
  border-bottom: 1px solid #d8e0ee;
}
.el-dialog.fields-dialog .el-dialog__title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2a44;
}
.el-dialog.fields-dialog .el-dialog__body {
  padding: 18px 28px 8px;
}
.el-dialog.fields-dialog .el-dialog__footer {
  padding: 33px 28px 12px;
}
.el-dialog.fields-dialog .el-table {
  height: 425px !important;
  max-height: none !important;
}
.el-dialog.fields-dialog .el-table .el-table__header th.el-table__cell {
  background: #f5f7fc;
  color: #8a98b0;
  font-size: 12px;
  font-weight: 400;
  padding: 12px 8px;
}
.el-dialog.fields-dialog .el-table td.el-table__cell {
  border-color: #edf0f6;
  padding: 9px 8px;
}
.el-dialog.fields-dialog .el-table .cell {
  padding: 0 6px;
  transform: translateX(0);
}
.el-dialog.fields-dialog .el-table .el-table__header-wrapper th:nth-child(4) .cell,
.el-dialog.fields-dialog .el-table .el-table__header-wrapper th:nth-child(6) .cell {
  text-indent: -1px;
}
.el-dialog.fields-dialog .el-table .el-table__body-wrapper td:nth-child(4) .cell,
.el-dialog.fields-dialog .el-table .el-table__body-wrapper td:nth-child(6) .cell {
  text-indent: -1px;
}
.el-dialog.fields-dialog .el-table th:nth-child(5) .cell,
.el-dialog.fields-dialog .el-table td:nth-child(5) .cell {
  transform: translateX(3px);
}
.el-dialog.fields-dialog .fields-dialog__search .el-input__inner {
  position: relative;
  left: -9px;
  width: calc(100% + 9px);
  padding-left: 12px !important;
}
.el-dialog.fields-dialog .fields-dialog__close > span {
  display: block;
  width: 118px;
  text-align: center;
}
.el-dialog.fields-dialog .fields-dialog__close {
  padding-left: 11px;
  padding-right: 11px;
}

.el-dialog.history-dialog {
  /* 覆盖组件内 width prop（内联 CSS 变量），需 !important；
     节点 14：538 宽、右上泊位（0.0381 最优态）。 */
  width: 538px !important;
  max-width: calc(100vw - 48px);
  margin: 96px 32px 50px auto;
  --el-dialog-padding-primary: 0px;
  --el-dialog-border-radius: 14px;
}
.el-dialog.history-dialog .el-dialog__header {
  padding: 21px 76px 12px 28px;
  border-bottom: 1px solid #d8e0ee;
}
.el-dialog.history-dialog .el-dialog__title {
  display: inline-block;
  transform: translateY(2px);
  font-size: 20px;
  font-weight: 600;
  color: #1f2a44;
}
.el-dialog.history-dialog .el-dialog__body {
  padding: 20px 28px 24px;
}
.el-dialog.history-dialog .el-dialog__headerbtn {
  top: 27px;
  right: 28px;
  width: 20px;
  height: 20px;
  border: 1px solid #8a98b0;
  box-sizing: border-box;
}
.el-dialog.history-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #8a98b0;
  font-size: 14px;
}
.el-dialog.history-dialog .el-table .el-table__header th.el-table__cell {
  background: #f5f7fc;
  color: #8a98b0;
  font-size: 12px;
  font-weight: 400;
  padding: 12px 8px;
}
.el-dialog.history-dialog .el-table td.el-table__cell {
  border-color: #edf0f6;
  padding: 12px 8px;
}
.el-dialog.history-dialog .el-dialog__footer {
  /* 设计（节点14）：弹窗底 936（footer 底距补足内容高度差） */
  padding: 21px 28px 13px;
}
.el-dialog.history-dialog .history-dialog__footer > .el-button:first-child {
  width: 104px;
  height: 36px;
  line-height: 17px;
  text-indent: 17px;
}
.el-dialog.history-dialog .history-dialog__restore {
  width: 112px;
  min-width: 112px;
  height: 36px;
  line-height: 17px;
  text-indent: -9px;
}
.el-dialog.history-dialog .history-dialog__footer > .el-button > span {
  position: relative;
  top: 2px;
}
.el-dialog.history-dialog .history-dialog__restore > span {
  left: 4.5px;
}
</style>
