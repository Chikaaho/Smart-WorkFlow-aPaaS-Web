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
import { ElMessage, ElMessageBox } from 'element-plus'
import type {
  FormSchema,
  FormSchemaField,
  FormEvents,
  TableSubField,
  VisibilityRule,
} from '@/contracts/form-schema'
import FieldPalette from '../designer/FieldPalette.vue'
import DesignerCanvas from '../designer/DesignerCanvas.vue'
import FieldConfigPanel from '../designer/FieldConfigPanel.vue'
import FieldListPanel from '../designer/FieldListPanel.vue'
import SubFieldDesigner from '../designer/SubFieldDesigner.vue'
import PreviewModal from '../designer/PreviewModal.vue'
import HistoryVersionsDialog from '../designer/HistoryVersionsDialog.vue'
import RelatedProcessesPanel from '../designer/RelatedProcessesPanel.vue'
import FormAccessPanel from '../designer/FormAccessPanel.vue'
import FormEventsPanel from '../designer/FormEventsPanel.vue'
import { saveDraftDefinition, publishDefinition as publishDef } from '../designer/draft-actions'
import { publishNewFormVersion } from '../api/form-def'
import { findCategoryNameByFormKey } from '@/adapters/oa-catalog'
import { pageProcessDefs } from '@/adapters/process-catalog'
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
import { ApiError } from '@/foundation/request'
import { itemsToDefinition, definitionToItems } from '../designer/definition-convert'
import { validateFormEvents } from '../utils/form-events'
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
const fieldPermissions = ref<FormSchema['fieldPermissions']>({})
const actionPermissions = ref<FormSchema['actionPermissions']>({})
const allowedIntegrations = ref<string[]>([])
const formEvents = ref<FormEvents>({})
const previewVisible = ref(false)
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

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/* ── 工作区（表单设计 / 关联流程），路由 query 可恢复 ── */
const activeTab = ref<WorkbenchTab>(parseWorkbenchTab(route.query.tab))

/* 0.1.7 #25 回归：关联流程面板的「流程编号设置」入口上收本页工具条右上角
   （内容区不再有标题/描述/汇总噪音）；数量由面板上报以联动禁用态。 */
const processPanelRef = ref<{ openNumberSettings: () => void } | null>(null)
const relatedProcessCount = ref(0)

function openProcessNumberSettings() {
  processPanelRef.value?.openNumberSettings()
}

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

/** 控件库点击添加与拖入使用同一 DesignerItem 形态，点击后立即选中新字段。 */
function addPaletteItem(item: DesignerItem) {
  items.value.push(item)
  selectedId.value = item.id
  scrollSelectedShellIntoView()
}

/**
 * BF20261013-006：点击/拖入成功后滚动到新字段。
 * 字段多于一屏时新项落在视口外，没有任何视觉反馈，会被当成「点击没效果」；
 * 渲染完成后按选中壳（field-shell--active）滚到可见位置。
 */
function scrollSelectedShellIntoView() {
  void nextTick(() => {
    globalThis.document
      ?.querySelector('.field-shell--active')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

/** 组件库拖拽中的待插入字段：画布据此在有落点的位置渲染真实预览。 */
const draggingItem = ref<DesignerItem | null>(null)

function startPaletteDrag(item: DesignerItem) {
  draggingItem.value = item
}

/** 放置落点确认：把候选字段插到画布算出的下标（24 栅格流式顺序，不做自由定位）。 */
function addDroppedItem(item: DesignerItem, index: number) {
  draggingItem.value = null
  const at = Math.min(Math.max(index, 0), items.value.length)
  items.value.splice(at, 0, item)
  selectedId.value = item.id
  scrollSelectedShellIntoView()
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
  return itemsToDefinition(
    items.value,
    title.value,
    visibilityRules.value,
    description.value,
    {
      fieldPermissions: fieldPermissions.value,
      actionPermissions: actionPermissions.value,
      allowedIntegrations: allowedIntegrations.value,
    },
    formEvents.value,
  )
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
    fieldPermissions.value = schema.fieldPermissions ? clonePlain(schema.fieldPermissions) : {}
    actionPermissions.value = schema.actionPermissions ? clonePlain(schema.actionPermissions) : {}
    allowedIntegrations.value = schema.allowedIntegrations ? [...schema.allowedIntegrations] : []
    formEvents.value = schema.events ? clonePlain(schema.events) : {}
    rejected.value = false
    void loadBreadcrumbCategory()
    await nextTick()
    baselineJson.value = JSON.stringify(buildDefinition())
    savedAtText.value = ''
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
  fieldPermissions.value = {}
  actionPermissions.value = {}
  allowedIntegrations.value = []
  formEvents.value = {}
  selectedId.value = null
  editingTableId.value = null
  baselineJson.value = JSON.stringify(buildDefinition())
  savePhase.value = 'idle'
}

/** 新建态：首次保存创建草稿时携带的归属（应用内新建，回归01b 未保存不建记录）。 */
const createExtras = ref<{ appId: string | null; dirId: string | null }>({
  appId: null,
  dirId: null,
})

function applyCreateContext() {
  const q = route.query
  if (q.from !== 'app-form') {
    createExtras.value = { appId: null, dirId: null }
    return
  }
  createExtras.value = {
    appId: typeof q.appId === 'string' && q.appId ? q.appId : null,
    dirId: typeof q.dirId === 'string' && q.dirId ? q.dirId : null,
  }
  const pendingName = typeof q.pendingName === 'string' ? q.pendingName.trim() : ''
  if (pendingName) {
    title.value = pendingName
  }
}

onMounted(() => {
  globalThis.addEventListener('beforeunload', handleBeforeUnload)
  const idParam = route.params.id as string | undefined
  if (idParam) {
    formId.value = idParam
    loadForm(idParam)
  } else {
    // 新建态：空白画布，基线为空设计；应用内新建携带归属与预填名称
    applyCreateContext()
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
      applyCreateContext()
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
  // 0.1.7 #14：已发布表单同样可保存工作定义，离开保护与草稿同一套「保存/丢弃/取消」
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
    fieldPermissions.value = baseline.fieldPermissions ? clonePlain(baseline.fieldPermissions) : {}
    actionPermissions.value = baseline.actionPermissions
      ? clonePlain(baseline.actionPermissions)
      : {}
    formEvents.value = baseline.events ? clonePlain(baseline.events) : {}
    if (baseline.title) title.value = baseline.title
    baselineJson.value = currentJson.value
    return 'proceed'
  }
  // 保存并继续：保存失败不得继续
  const saved = await doSave()
  return saved ? 'proceed' : 'abort'
}

/** 单流程表单：切到流程设计页签时直接进入画布，不再停留只有一行的列表。 */
async function enterProcessCanvasIfSingle(): Promise<boolean> {
  if (!formKey.value) return false
  try {
    const result = await pageProcessDefs({ pageNum: 1, pageSize: 10 }, formKey.value)
    const process = result.list[0]
    if (Number(result.total) !== 1 || !process) return false
    await router.push(
      `/workflow/defs/${process.id}/design?from=form-workbench&formId=${formId.value ?? ''}&formKey=${formKey.value}`,
    )
    return true
  } catch {
    // 查询失败回退关联流程列表，由列表自身提示错误
    return false
  }
}

/** 切工作区：脏状态先过保护，取消则回弹原工作区。 */
async function onTabChange(tab: WorkbenchTab) {
  if (tab === activeTab.value) return
  // 先守卫后提交：abort 时不动 activeTab 也不写 URL，避免 query watcher
  // 在回弹后按旧 URL 又把工作区翻回去（取消分支竞态）
  const verdict = await guardUnsavedChanges()
  if (verdict === 'abort') return
  if (tab === 'processes' && (await enterProcessCanvasIfSingle())) return
  activeTab.value = tab
  if (parseWorkbenchTab(route.query.tab) !== tab) {
    router.replace({ query: { ...route.query, tab: tab === 'design' ? undefined : tab } })
  }
}

function onConfigurationCommand(command: unknown) {
  if (command === 'permissions' || command === 'events') {
    void onTabChange(command)
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
  // 0.1.7 #14：已发布表单同样可保存工作定义（运行时填写走已发布快照，
  // 保存只更新草稿定义，经「发布新版本」才生效到线上版本与列结构）
  if (savePhase.value === 'saving') return false // 保存中防重复提交

  const eventErrors = validateFormEvents(formEvents.value)
  if (eventErrors.length) {
    ElMessage.warning(eventErrors[0])
    return false
  }

  const definition = buildDefinition()
  const key = formKey.value || generateFormKey(title.value)
  const seq = loadSeq

  savePhase.value = 'saving'
  try {
    const result = await saveDraftDefinition(definition, formId.value, key, createExtras.value)
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
  const eventErrors = validateFormEvents(formEvents.value)
  if (eventErrors.length) {
    ElMessage.warning(eventErrors[0])
    return
  }
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

  const eventErrors = validateFormEvents(formEvents.value)
  if (eventErrors.length) {
    ElMessage.warning(eventErrors[0])
    return
  }

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

/* ── 字段清单（0.1.7 #39：成为工作区页签，内容由 FieldListPanel 承载；此处只保留导出） ── */

/** 字段清单补丁回写（字段名 / 长度 / 描述）：直接改画布持有的字段对象，单一数据源。 */
function patchListedField(payload: { field: FormSchemaField | TableSubField; patch: FieldPatch }) {
  applyFieldPatch(payload.field as FormSchemaField, payload.patch)
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

/** 是否从应用详情进入（0.1.7 回归01b：返回应用详情 + 新建归属携带）。 */
const fromAppContext = computed(() => route.query.from === 'app-form')

function backToList() {
  // 从应用详情进入时，保存/返回都回到应用详情（回归01b：不再落到表单上下文中转页）
  const appId = route.query.appId
  if (fromAppContext.value && typeof appId === 'string' && appId) {
    router.push({ name: 'form-app-manage-workspace', params: { appId } })
    return
  }
  router.push({ name: 'form-def-list' })
}

/** 工作台顶部返回：字段清单/表单设计/流程设计统一返回上一页。 */
function goBack() {
  router.back()
}

/* ── V011-BUG-011：面包屑分类（可发起事项目录反查 formKey 所属分类） ── */
const categoryName = ref<string | null>(null)
const breadcrumbLoadedFor = ref('')

async function loadBreadcrumbCategory() {
  if (!formKey.value || breadcrumbLoadedFor.value === formKey.value) return
  breadcrumbLoadedFor.value = formKey.value
  categoryName.value = await findCategoryNameByFormKey(formKey.value)
}
</script>

<template>
  <div class="designer">
    <!-- ═══ 顶部工作台（拒绝态下整体不渲染，操作区零暴露） ═══
         0.1.7 #39：左「返回 + 保存状态 + 面包屑」/ 中工作区页签（整组居中）
         / 右保存状态与操作组；「设置」下拉已去除（其唯一入口「字段清单」上收为页签） -->
    <header v-if="!rejected" class="designer__workbench">
      <div class="designer__crumb">
        <!-- V011-BUG-017：返回上一页 -->
        <el-button class="designer__back" @click="goBack">
          <span>{{ t('common.back') }}</span>
        </el-button>
        <span class="designer__crumb-path" :title="breadcrumbText">{{ breadcrumbText }}</span>
        <span class="designer__save-state" :class="'designer__save-state--' + saveState">
          {{
            saveState === 'unchanged'
              ? savedAtText
                ? t('form.draftSavedAt', { time: savedAtText })
                : t('form.draftSaved')
              : t(saveStateKey(saveState))
          }}
        </span>
      </div>

      <nav class="designer__tabs" aria-label="工作区切换">
        <button
          type="button"
          class="designer__tab"
          :class="{ 'is-active': activeTab === 'fields' }"
          @click="onTabChange('fields' as WorkbenchTab)"
        >
          {{ t('fieldList.button') }}
        </button>
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
        <el-dropdown trigger="click" @command="onConfigurationCommand">
          <el-button
            class="designer__settings"
            :class="{ 'is-active': activeTab === 'permissions' || activeTab === 'events' }"
            :aria-current="
              activeTab === 'permissions' || activeTab === 'events' ? 'page' : undefined
            "
            :aria-label="t('form.workbenchSettings')"
            :disabled="loading"
          >
            {{
              activeTab === 'permissions'
                ? t('form.tabPermissions')
                : activeTab === 'events'
                  ? t('form.tabEvents')
                  : t('form.workbenchSettings')
            }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="permissions">{{
                t('form.tabPermissions')
              }}</el-dropdown-item>
              <el-dropdown-item command="events">{{ t('form.tabEvents') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- 0.1.7 #25 回归：关联流程工作区的「流程编号设置」置于工具条右上角（仅流程设计页签可见） -->
        <el-button
          v-if="activeTab === 'processes'"
          class="designer__number-setting"
          :disabled="relatedProcessCount === 0"
          @click="openProcessNumberSettings"
        >
          {{ t('form.relatedProcessNumberSetting') }}
        </el-button>
        <el-button
          :aria-label="t('form.draftHistoryEntry')"
          :disabled="!formId"
          @click="historyVisible = true"
          >{{ t('form.versionEntry') }}</el-button
        >
        <!-- BF20261013-015：预览自画布头部行上收至工具条动作组 -->
        <el-button @click="previewVisible = true">{{ t('common.preview') }}</el-button>
        <!-- 0.1.7 #14：已发布表单解锁画布编辑——「保存」持久化工作定义（运行时仍走已发布快照），
             「发布新版本」原子落库（增量 DDL + 版本递增）后生效 -->
        <el-button :disabled="saveState === 'saving'" @click="saveDraft">{{
          t('common.save')
        }}</el-button>
        <el-button
          v-if="isPublished"
          type="primary"
          :disabled="saveState === 'saving'"
          @click="publishNewVersion"
          >{{ t('form.publishNewVersion') }}</el-button
        >
        <el-button v-else type="primary" :disabled="saveState === 'saving'" @click="publish">{{
          t('common.publish')
        }}</el-button>
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

      <!-- ═══ 工作区：字段清单（0.1.7 #38/#39：主表 + 各子表字段的表清单，页签直达） ═══ -->
      <FieldListPanel
        v-else-if="activeTab === 'fields'"
        :items="items"
        :form-key="formKey"
        @patch="patchListedField"
        @export="exportFields"
      />

      <!-- ═══ 工作区：表单设计（节点 07 三栏几何：252 组件库 / 弹性画布 / 336 属性面板） ═══
           V011-BUG-015：已发布表单解锁编辑（编辑 → 「发布新版本」原子落库，
           服务端 publish-version 增量 DDL + 版本递增），不再整体灰置 -->
      <div v-else-if="activeTab === 'design'" class="designer__body">
        <div class="designer__palettecol">
          <FieldPalette
            class="designer-main-palette"
            :existing-names="existingNames"
            @add="addPaletteItem"
            @drag-start="startPaletteDrag"
            @drag-end="draggingItem = null"
          />
        </div>

        <div class="designer__canvascol">
          <!-- BF20261013-015：去掉「桌面端」头部行（预览已上收工具条）；
               字段清单入口 0.1.7 #39 上收为工具条居中页签，画布白板直接占满中栏 -->
          <!-- V011-BUG-006：画布内不再渲染「未命名表单」标题块与 12 栏标尺（Owner 2026-09-22）；
               表单名称在新建时输入（V011-BUG-014），设计态名称见面包屑 -->
          <div class="designer__sheet">
            <DesignerCanvas
              v-model:items="items"
              v-model:selected-id="selectedId"
              class="designer-main-canvas"
              :pending-item="draggingItem"
              :description="description"
              @add="addDroppedItem"
              @edit-table="openTableEditor"
            />
          </div>
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

      <FormAccessPanel
        v-else-if="activeTab === 'permissions'"
        :form-id="formId"
        :fields="items.map((item) => item.field)"
        :field-permissions="fieldPermissions ?? {}"
        :action-permissions="actionPermissions ?? {}"
        :allowed-integrations="allowedIntegrations"
        @update:field-permissions="fieldPermissions = $event"
        @update:action-permissions="actionPermissions = $event"
        @update:allowed-integrations="allowedIntegrations = $event"
      />

      <FormEventsPanel v-else-if="activeTab === 'events'" v-model="formEvents" />

      <!-- ═══ 工作区：关联流程 ═══ -->
      <RelatedProcessesPanel
        v-else-if="activeTab === 'processes'"
        ref="processPanelRef"
        :form-id="formId ?? ''"
        :form-key="formKey"
        @enter-process="enterProcess"
        @update:process-count="relatedProcessCount = $event"
      />
    </template>

    <!-- 子表字段弹窗：独立工作副本，确认后写回该子表字段 -->
    <SubFieldDesigner
      v-if="editingTableField && activeTab === 'design'"
      :table-label="editingTableField.label || editingTableField.name"
      :sub-fields="editingTableField.subFields"
      @close="closeTableEditor"
    />

    <PreviewModal v-model:visible="previewVisible" :schema="previewSchema" />

    <HistoryVersionsDialog
      v-if="formId"
      v-model:visible="historyVisible"
      :form-id="formId"
      :form-key="formKey"
      :form-version="formVersion"
      :form-version-label="formVersionLabel"
      :form-status="status"
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

/* ═══ 顶部工具条（节点 07：48px 白底；V011-BUG-010/012 重排：左信息簇 / 中居中 tab / 右动作组） ═══ */
.designer__workbench {
  box-sizing: border-box;
  height: 48px;
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  padding: 0 var(--sw-space-16);
  border-bottom: 0;
  background: #fff;
  position: relative;
}

/* 左侧：返回 + 设置 + 保存状态 + 面包屑（V011-BUG-010 信息簇） */
.designer__crumb {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  max-width: calc(50% - 328px);
  min-width: 0;
}

/* V011-BUG-017：返回表单列表为显式入口 */
.designer__back {
  width: 56px;
  height: 32px;
  flex: 0 0 56px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  font-size: 14px;
  line-height: 22px;
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-color-primary);
}

.designer__crumb-path {
  font-size: 12px;
  color: var(--sw-text-primary);
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 表单设计 / 流程设计 tab：V011-BUG-012 在工具条内水平居中 */
.designer__tabs {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  height: 48px;
  gap: 0;
}

.designer__tab {
  position: relative;
  width: 120px;
  height: 48px;
  flex: 0 0 120px;
  padding: 0 0 2px;
  border: 0;
  background: transparent;
  font-size: 14px;
  line-height: 22px;
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-secondary);
  cursor: pointer;
}

.designer__tab:hover {
  color: var(--sw-color-primary);
}

.designer__tab.is-active {
  color: var(--sw-color-primary);
  font-weight: var(--sw-font-weight-emphasis);
}

.designer__tab.is-active::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 0;
  height: 2px;
  background: var(--sw-color-primary);
}

.designer__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  flex-shrink: 0;
}

.designer__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* 设计07：常规动作最小64×32，14px文本/22px行盒 */
.designer__actions :deep(.el-button) {
  min-width: 64px;
  width: auto;
  height: 32px;
  padding: 0 14px;
  font-size: 14px;
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 22px;
  border-radius: 6px;
}
.designer__actions :deep(.el-button:not(.el-button--primary)) {
  color: var(--sw-text-regular);
}
.designer__actions :deep(.designer__settings.is-active) {
  color: var(--sw-color-primary);
  border-color: var(--sw-color-primary);
}

/* 窄桌面按实际内容分配工具条，关联流程的编号入口也保留操作空间。 */
@media (max-width: 1440px) {
  .designer__crumb {
    max-width: 240px;
  }
  .designer__tabs {
    position: static;
    flex: 1 1 auto;
    min-width: 0;
    transform: none;
    justify-content: center;
  }
  .designer__tab {
    width: auto;
    flex: 1 1 0;
    min-width: 0;
    max-width: 120px;
    padding-right: 8px;
    padding-left: 8px;
    white-space: nowrap;
  }
}

/* 草稿状态：设计稿为纯文字态（含已保存时钟） */
.designer__save-state {
  font-size: 12px;
  line-height: 18px;
  flex-shrink: 0;
  color: var(--sw-text-secondary);
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
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  background: var(--sw-bg-white, #fff);
}

.designer__palette-note {
  flex: 0 0 auto;
  margin: 14px 0 0;
  font-size: 11px;
  color: #9aa6bd;
}

/* ── 中栏：画布（BF20261013-015 白板占满中栏，四周留 12px 细边；无头部/底部条） ── */
.designer__canvascol {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f4f6fc;
}

/* V011-BUG-009 / BF20261013-015：白板随中栏满幅（去外边距与卡片边框，边缘与两栏分隔线齐平） */
.designer__sheet {
  flex: 1 1 auto;
  min-height: 520px;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 21px 23px 20px;
  background: #fff;
}

/* 画布内嵌：去掉独立底色/内边距，滚动交给白底表单卡 */
.designer__canvascol .designer-main-canvas {
  flex: 0 1 auto;
  /* 画布铺满白板：整块白板（含末尾空白）都是组件放置区 */
  min-height: 100%;
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
  /* BF20261013-011：最外圈默认不显示边框（透明占位保持盒尺寸），选中态由 --active 主色环承担 */
  border-color: transparent;
  border-radius: 8px;
  box-shadow: none;
}

.designer-main-canvas :deep(.field-shell--active) {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 2px var(--sw-color-primary-soft);
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

/* BF20261013-007：徽标无底色不换行（原紫底+水平 18px 内边距把固定宽度挤到折行，随面板规则一并去除） */
.designer-main-config :deep(.config__type) {
  height: 24px;
  line-height: 24px;
  font-size: 12px;
  color: var(--sw-color-primary);
}

.designer__published-bar {
  padding: var(--sw-space-8) var(--sw-space-24);
  background: var(--sw-color-warning-bg, #fdf6ec);
  color: var(--sw-color-warning, #e6a23c);
  font-size: 13px;
  text-align: center;
  border-top: 1px solid var(--sw-border-light);
}
</style>

<style>
/* ═══ P53 弹窗几何（节点 14 草稿历史版本） ═══
   el-dialog 内部节点（header/body/footer/表格）不带本组件 scoped 属性，
   且历史弹窗 append-to-body，故该段使用全局作用域；类名为本页专用。
   0.1.7 #39：字段清单由弹窗上收为工作区页签，其弹窗几何样式随之移除。 */
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
  min-width: 104px;
  height: 36px;
  padding: 0 22px;
  line-height: 36px;
  text-indent: 0;
}
.el-dialog.history-dialog .history-dialog__restore {
  min-width: 112px;
  height: 36px;
  padding: 0 22px;
  line-height: 36px;
  text-indent: 0;
}
.el-dialog.history-dialog .history-dialog__footer > .el-button > span {
  position: static;
  top: auto;
  left: auto;
}
</style>
