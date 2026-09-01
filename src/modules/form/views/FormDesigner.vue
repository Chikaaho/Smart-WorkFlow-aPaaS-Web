<script setup lang="ts">
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
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormSchema, TableSubField } from '@/contracts/form-schema'
import FieldPalette from '../designer/FieldPalette.vue'
import DesignerCanvas from '../designer/DesignerCanvas.vue'
import FieldConfigPanel from '../designer/FieldConfigPanel.vue'
import SubFieldDesigner from '../designer/SubFieldDesigner.vue'
import PreviewModal from '../designer/PreviewModal.vue'
import HistoryVersionsDialog from '../designer/HistoryVersionsDialog.vue'
import RelatedProcessesPanel from '../designer/RelatedProcessesPanel.vue'
import { saveDraftDefinition, publishDefinition as publishDef } from '../designer/draft-actions'
import {
  resolveSaveState,
  isDefinitionDirty,
  parseWorkbenchTab,
  LEAVE_GUARD_MESSAGE,
  type WorkbenchSavePhase,
  type WorkbenchTab,
} from '../designer/workbench'
import { applyFieldPatch, type FieldPatch } from '../designer/field-config'
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
/** 身份加载失败（不存在/已删除/无权）：明确拒绝态，不回退其他表单。 */
const rejected = ref(false)
const rejectReason = ref('')

/* ── 设计态 ── */
const title = ref('未命名表单')
const items = ref<DesignerItem[]>([])
const selectedId = ref<string | null>(null)
const previewVisible = ref(false)
const loading = ref(false)

/* ── 保存状态与脏标记 ── */
const baselineJson = ref<string>('')
const savePhase = ref<WorkbenchSavePhase>('idle')
/** 加载/保存请求序号：迟到响应不得覆盖当前表单状态。 */
let loadSeq = 0

const currentJson = computed(() => JSON.stringify(buildDefinition()))
const isDirty = computed(() => isDefinitionDirty(baselineJson.value, currentJson.value))
const saveState = computed(() => resolveSaveState(isDirty.value, savePhase.value))

const SAVE_STATE_TYPE: Record<string, 'info' | 'warning' | 'primary' | 'success' | 'danger'> = {
  未修改: 'info',
  未保存: 'warning',
  保存中: 'primary',
  保存成功: 'success',
  保存失败: 'danger',
}

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

/** 配置面板回写：就地把补丁合并进选中字段。 */
function patchSelectedField(patch: FieldPatch) {
  const item = items.value.find((it) => it.id === selectedId.value)
  if (item) applyFieldPatch(item.field, patch)
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
  return itemsToDefinition(items.value, title.value)
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
    if (defDto.name) title.value = defDto.name
    title.value = schema.title || title.value
    items.value = definitionToItems(schema)
    rejected.value = false
    await nextTick()
    baselineJson.value = JSON.stringify(buildDefinition())
    savePhase.value = 'idle'
  } catch (err) {
    if (seq !== loadSeq) return
    rejected.value = true
    // 优先用 ApiError 携带的后端中文 message（如"表单不存在"），
    // 避免"业务错误(1300)"这类不可读兜底
    rejectReason.value = err instanceof ApiError && err.msg ? err.msg : '表单不存在或无权访问'
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
  rejected.value = false
  rejectReason.value = ''
  title.value = '未命名表单'
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
  let action: 'save' | 'discard' | 'cancel'
  try {
    await ElMessageBox.confirm(LEAVE_GUARD_MESSAGE, '未保存的修改', {
      distinguishCancelAndClose: true,
      confirmButtonText: '保存并继续',
      cancelButtonText: '放弃修改并继续',
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

/* ── 发布（只针对最近一次成功保存的当前草稿） ── */

async function publish() {
  if (rejected.value) return
  if (isPublished.value) return
  if (!formId.value) {
    ElMessage.warning('请先保存草稿再发布')
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
    await ElMessageBox.confirm('发布后表名/字段名冻结，不可修改。确认发布？', '发布确认', {
      confirmButtonText: '确认发布',
      cancelButtonText: '取消',
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

/* ── 历史版本（只读） ── */
const historyVisible = ref(false)

/* ── 关联流程 ── */

function enterProcess(def: ProcessDef) {
  // 进入现有流程管理/编辑入口（workflow 流程定义列表），带回跳上下文
  router.push({
    path: '/workflow/defs',
    query: { from: 'form-workbench', formId: formId.value ?? '', formKey: formKey.value },
  })
  void def
}

/* ── 辅助函数 ── */

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
      return `字段名 "${field.name}" 不合法（仅允许字母/数字/下划线，且不能以数字开头）`
    }
    if (field.type === 'DICT' && !field.dictType) {
      return `字典字段 "${field.name}" 未绑定字典类型`
    }
    if (field.type === 'REFERENCE' && !field.targetFormId) {
      return `引用字段 "${field.name}" 未指定目标表单`
    }
    if (field.type === 'TABLE' && field.subFields.length === 0) {
      return `子表格字段 "${field.name}" 未定义子列`
    }
  }
  return null
}

function backToList() {
  router.push({ name: 'form-def-list' })
}
</script>

<template>
  <div class="designer">
    <!-- ═══ 顶部工作台 ═══ -->
    <header class="designer__workbench">
      <div class="designer__identity">
        <el-input
          v-model="title"
          class="designer__title"
          placeholder="表单名称"
          :disabled="isPublished"
        />
        <el-tag v-if="formKey" size="small" type="info" class="designer__formkey">
          {{ formKey }}
        </el-tag>
        <el-tag size="small" :type="isPublished ? 'success' : 'info'">
          {{ isPublished ? '已发布' : '草稿' }}
        </el-tag>
        <el-tag v-if="isPublished && formVersion" size="small" type="success">
          V{{ formVersion }}
        </el-tag>
      </div>

      <el-radio-group
        class="designer__tabs"
        :model-value="activeTab"
        @update:model-value="onTabChange($event as WorkbenchTab)"
      >
        <el-radio-button value="design">表单设计</el-radio-button>
        <el-radio-button value="processes">关联流程</el-radio-button>
      </el-radio-group>

      <div class="designer__actions">
        <el-tag :type="SAVE_STATE_TYPE[saveState]" size="small" class="designer__save-state">
          {{ saveState }}
        </el-tag>
        <el-button @click="previewVisible = true">预览</el-button>
        <el-button :disabled="isPublished || saveState === '保存中'" @click="saveDraft">
          保存
        </el-button>
        <el-button
          type="primary"
          :disabled="isPublished || saveState === '保存中'"
          :title="isPublished ? '表单已发布，不可重复发布' : undefined"
          @click="publish"
        >
          发布
        </el-button>
        <el-button :disabled="!formId" @click="historyVisible = true">历史版本</el-button>
      </div>
    </header>

    <!-- 拒绝态：表单不存在/已删除/无权，不回退到其他表单 -->
    <div v-if="rejected" class="designer__rejected">
      <p class="designer__rejected-title">无法打开该表单</p>
      <p class="designer__rejected-reason">{{ rejectReason }}</p>
      <el-button type="primary" @click="backToList">返回表单列表</el-button>
    </div>

    <template v-else>
      <div v-if="loading" class="designer__loading">
        <span>加载中...</span>
      </div>

      <!-- ═══ 工作区：表单设计 ═══ -->
      <div v-else-if="activeTab === 'design'" class="designer__body">
        <FieldPalette :existing-names="existingNames" :disabled="isPublished" />
        <DesignerCanvas
          v-model:items="items"
          v-model:selected-id="selectedId"
          :readonly="isPublished"
          @edit-table="openTableEditor"
        />
        <FieldConfigPanel
          :field="selectedItem"
          :other-names="otherNames"
          :readonly="isPublished"
          @update="patchSelectedField"
        />
      </div>

      <!-- ═══ 工作区：关联流程 ═══ -->
      <RelatedProcessesPanel
        v-else
        :form-id="formId ?? ''"
        :form-key="formKey"
        @enter-process="enterProcess"
      />

      <!-- 已发布状态提示条 -->
      <div v-if="isPublished && activeTab === 'design'" class="designer__published-bar">
        此表单已发布，表名和字段已冻结，不可编辑。
      </div>
    </template>

    <!-- 子表盖层子画布：盖在主画布之上，独立状态编辑该子表的内部字段 -->
    <SubFieldDesigner
      v-if="editingTableField && activeTab === 'design'"
      :table-label="editingTableField.label || editingTableField.name"
      :sub-fields="editingTableField.subFields"
      :readonly="isPublished"
      @close="closeTableEditor"
    />

    <PreviewModal v-model:visible="previewVisible" :schema="previewSchema" />

    <HistoryVersionsDialog
      v-if="formId"
      v-model:visible="historyVisible"
      :form-id="formId"
      :form-key="formKey"
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

.designer__workbench {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
  padding: var(--sw-space-12) var(--sw-space-24);
  border-bottom: 1px solid var(--sw-border-light);
}

.designer__identity {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  min-width: 0;
}

.designer__title {
  max-width: 260px;
}

.designer__formkey {
  font-family: monospace;
}

.designer__actions {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}

.designer__save-state {
  margin-right: var(--sw-space-4);
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

.designer__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
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
