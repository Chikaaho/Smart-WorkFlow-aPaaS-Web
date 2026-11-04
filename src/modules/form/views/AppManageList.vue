<script setup lang="ts">
/* global File, Event, HTMLInputElement, URL, document, Blob */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { LoadErrorState } from '@/components/page-layout'
import AppScopePicker, { type AppScopeValue } from '@/components/AppScopePicker.vue'
import AppGrid from '@/modules/form/components/AppGrid.vue'
import AppGridToolbar from '@/modules/form/components/AppGridToolbar.vue'
import AppPerRowSetting from '@/modules/form/components/AppPerRowSetting.vue'
import { useAppPerRow } from '@/modules/form/components/useAppPerRow'
import AppAppearancePicker from '@/modules/form/components/AppAppearancePicker.vue'
import DetailDialog from '@/components/DetailDialog.vue'
import {
  createFormApp,
  deleteFormApp,
  listFormApps,
  listTenantOptions,
  updateFormApp,
  type TenantOption,
} from '@/modules/form/api/app-center'
import {
  confirmBundleImport,
  downloadBundleImportReport,
  exportAppBundle,
  listBundleImportRecords,
  previewBundleImport,
} from '@/modules/form/api/app-bundle'
import type {
  BundleOpinionKeyDecision,
  FormAppImportRecord,
  FormBundleImportReport,
  FormBundlePreviewResult,
} from '@/contracts/app-bundle'
import type { FormApp, FormAppSaveReq } from '@/contracts/app-center'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'
import { ApiError } from '@/foundation/request'

/**
 * 应用管理：共享网格卡片，筛选栏提供新建入口，卡片右上角菜单提供编辑/删除。
 */
const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()

const apps = ref<FormApp[]>([])
const keyword = ref('')
/** B021-009：无数据/无匹配时给出空态文案（此前筛选条以下整片空白） */
const emptyText = computed(() =>
  keyword.value.trim() ? t('form.appCenter.searchAppEmpty') : t('form.appCenter.emptyApps'),
)
const loading = ref(false)
const errorMsg = ref('')
const loadError = ref<ApiError | null>(null)
const { perRow, options: perRowOptions } = useAppPerRow()

// ─── Q40（459:15041）：超管租户筛选 ───
// 后端 /form/app/manage/list 支持（同轮新增）tenantId 可选查询参数与 tenantId/tenantName 下发；
// 候选沿既有 /form/app/manage/tenants。普通租户不渲染筛选、请求不带 tenantId、视图不变。
const isSuperAdmin = computed(() => userStore.superAdmin)
const tenantFilter = ref<number | string | ''>('')
const tenantOptions = ref<TenantOption[]>([])

async function loadTenantOptions() {
  try {
    tenantOptions.value = await listTenantOptions()
  } catch {
    tenantOptions.value = [] // 候选失败由调用方兜底为空（既有约定）
  }
}

function handleTenantFilterChange() {
  void loadList()
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  loadError.value = null
  try {
    apps.value = await listFormApps(
      keyword.value.trim() || undefined,
      isSuperAdmin.value && tenantFilter.value !== '' ? tenantFilter.value : undefined,
    )
  } catch (err: unknown) {
    loadError.value = err instanceof ApiError ? err : null
    errorMsg.value = loadError.value ? '' : t('form.appCenter.loadFailed', { msg: String(err) })
    apps.value = []
  } finally {
    loading.value = false
  }
}

// ==================== 新建 / 修改对话框 ====================

const dialogVisible = ref(false)
const appearancePickerActive = ref(false)
const scopeExpanded = ref(false)
/** null=新建 */
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = reactive<FormAppSaveReq>({
  name: '',
  icon: null,
  color: null,
  sortNo: 0,
  visibleScopeType: 'SPECIFIED',
  userIds: [],
  deptIds: [],
  roleCodes: [],
  postIds: [],
  tenantIds: [],
})

const dialogTitle = computed(() =>
  editingId.value ? t('form.appCenter.appSetting') : t('form.appCenter.newApp'),
)

function openCreate() {
  editingId.value = null
  appearancePickerActive.value = false
  scopeExpanded.value = false
  Object.assign(form, {
    name: '',
    icon: 'Grid',
    color: '#6f2dff',
    sortNo: 0,
    // 新建默认「指定范围」并预选创建者（保存时明确展示，不把空值误作全员）
    visibleScopeType: 'SPECIFIED',
    userIds: userStore.user?.id ? [userStore.user.id] : [],
    deptIds: [],
    roleCodes: [],
    postIds: [],
    tenantIds: [],
  })
  dialogVisible.value = true
}

function openEdit(app: FormApp) {
  editingId.value = app.id
  appearancePickerActive.value = false
  scopeExpanded.value = false
  Object.assign(form, {
    name: app.name,
    icon: app.icon ?? 'Folder',
    color: app.color ?? '#6f2dff',
    sortNo: app.sortNo ?? 0,
    visibleScopeType: app.visibleScopeType,
    userIds: app.visibleUserIds ? [...app.visibleUserIds] : [],
    deptIds: app.visibleDeptIds ? [...app.visibleDeptIds] : [],
    roleCodes: app.visibleRoleCodes ? [...app.visibleRoleCodes] : [],
    postIds: app.visiblePostIds ? [...app.visiblePostIds] : [],
    tenantIds: app.visibleTenantIds ? [...app.visibleTenantIds] : [],
  })
  dialogVisible.value = true
}

/** 多维度可见范围选择器双向绑定（0.1.7 #1）。 */
const scopeValue = computed<AppScopeValue>(() => ({
  userIds: form.userIds ?? [],
  deptIds: form.deptIds ?? [],
  roleCodes: form.roleCodes ?? [],
  postIds: form.postIds ?? [],
  tenantIds: form.tenantIds ?? [],
}))

function applyScope(value: AppScopeValue) {
  form.userIds = [...value.userIds]
  form.deptIds = [...value.deptIds]
  form.roleCodes = [...value.roleCodes]
  form.postIds = [...value.postIds]
  form.tenantIds = [...value.tenantIds]
}

async function handleSave() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  const specified = form.visibleScopeType === 'SPECIFIED'
  const payload: FormAppSaveReq = {
    name,
    icon: form.icon,
    color: form.color,
    sortNo: form.sortNo ?? 0,
    visibleScopeType: form.visibleScopeType,
    userIds: specified ? (form.userIds ?? []) : [],
    deptIds: specified ? (form.deptIds ?? []) : [],
    roleCodes: specified ? (form.roleCodes ?? []) : [],
    postIds: specified ? (form.postIds ?? []) : [],
    tenantIds: specified ? (form.tenantIds ?? []) : [],
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateFormApp(editingId.value, payload)
    } else {
      await createFormApp(payload)
    }
    ElMessage.success(t('common.saveSuccess'))
    dialogVisible.value = false
    await loadList()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    saving.value = false
  }
}

// ==================== 卡片动作 ====================

function enterWorkspace(app: FormApp) {
  void router.push({ name: 'form-app-manage-workspace', params: { appId: app.id } })
}

function onCardCommand(command: string, app: FormApp) {
  if (command === 'edit') {
    openEdit(app)
    return
  }
  if (command === 'export') {
    void handleExport(app)
    return
  }
  if (command === 'delete') {
    handleDelete(app)
  }
}

// ==================== F2 导出（D022-10） ====================

const exportingId = ref<string | null>(null)

/** Blob 落盘（导出包与导入报告共用）。 */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function handleExport(app: FormApp) {
  exportingId.value = app.id
  try {
    const blob = await exportAppBundle(app.id)
    downloadBlob(blob, `${app.name}_bundle.json`)
    ElMessage.success(t('form.appCenter.exportSuccess'))
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    exportingId.value = null
  }
}

// ==================== F2 导入（D022-12～15，两步走） ====================

const importDialogVisible = ref(false)
/** upload 选文件 → preview 预检确认 → report 导入报告；records 历史导入记录 */
const importStep = ref<'upload' | 'preview' | 'report' | 'records'>('upload')
const importFileInput = ref<HTMLInputElement | null>(null)
const importFile = ref<File | null>(null)
const previewing = ref(false)
const confirming = ref(false)
const previewResult = ref<FormBundlePreviewResult | null>(null)
/** 意见表单冲突的新 key 输入（formKey → newKey，默认采用服务端建议值） */
const opinionKeyInputs = reactive<Record<string, string>>({})
const importReport = ref<FormBundleImportReport | null>(null)
const importRecords = ref<FormAppImportRecord[]>([])
const recordsLoading = ref(false)

function openImport() {
  importStep.value = 'upload'
  importFile.value = null
  previewResult.value = null
  importReport.value = null
  Object.keys(opinionKeyInputs).forEach((key) => delete opinionKeyInputs[key])
  importDialogVisible.value = true
}

function chooseImportFile() {
  importFileInput.value?.click()
}

function onImportFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  input.value = ''
}

async function startPreview() {
  if (!importFile.value || previewing.value) return
  previewing.value = true
  try {
    previewResult.value = await previewBundleImport(importFile.value)
    Object.keys(opinionKeyInputs).forEach((key) => delete opinionKeyInputs[key])
    for (const opinion of previewResult.value.opinionForms ?? []) {
      if (opinion.conflict) {
        opinionKeyInputs[opinion.formKey] = opinion.suggestedKey ?? ''
      }
    }
    importStep.value = 'preview'
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    previewing.value = false
  }
}

/** 冲突意见表单（仅冲突项需要用户确认新 key） */
const opinionConflicts = computed(
  () => previewResult.value?.opinionForms?.filter((o) => o.conflict) ?? [],
)

/** 新 key 全部非空且互不相同才能确认（服务端仍权威校验重名拒绝） */
const opinionKeysValid = computed(() => {
  if (opinionConflicts.value.length === 0) return true
  const keys = opinionConflicts.value.map((o) => (opinionKeyInputs[o.formKey] ?? '').trim())
  return keys.every((key) => key.length > 0) && new Set(keys).size === keys.length
})

function dictActionLabel(action: string) {
  if (action === 'REUSE') return t('form.appCenter.importDictReuse')
  if (action === 'CREATE') return t('form.appCenter.importDictCreate')
  return t('form.appCenter.importDictOccupied')
}

async function confirmImport() {
  if (!importFile.value || !previewResult.value || confirming.value || !opinionKeysValid.value)
    return
  confirming.value = true
  try {
    const decisions: BundleOpinionKeyDecision[] = opinionConflicts.value.map((o) => ({
      formKey: o.formKey,
      newKey: (opinionKeyInputs[o.formKey] ?? '').trim(),
    }))
    importReport.value = await confirmBundleImport(importFile.value, decisions)
    importStep.value = 'report'
    ElMessage.success(t('form.appCenter.importSuccess'))
    await loadList()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    confirming.value = false
  }
}

function downloadCurrentReport() {
  if (!importReport.value) return
  const blob = new Blob([JSON.stringify(importReport.value, null, 2)], {
    type: 'application/json',
  })
  const name = `${importReport.value.finalAppName || importReport.value.packageName}_import_report.json`
  downloadBlob(blob, name)
}

async function openImportRecords() {
  importStep.value = 'records'
  recordsLoading.value = true
  try {
    importRecords.value = await listBundleImportRecords()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
    importRecords.value = []
  } finally {
    recordsLoading.value = false
  }
}

async function downloadRecordReport(record: FormAppImportRecord) {
  try {
    const blob = await downloadBundleImportReport(record.id)
    downloadBlob(blob, `${record.appName || record.packageName}_import_report.json`)
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

/* Q39（471:17256）：删除应用改为 440 宽自定义确认弹窗（圆角 12、取消/删除 80×32、删除危险色 #C2303A）；
   只打开弹窗，确认回调沿用既有删除 handler，删除/拒绝语义不变。 */
const deleteDialogVisible = ref(false)
const deleteTarget = ref<FormApp | null>(null)

function handleDelete(app: FormApp) {
  deleteTarget.value = app
  deleteDialogVisible.value = true
}

async function handleDeleteConfirm() {
  const app = deleteTarget.value
  if (!app) return
  deleteDialogVisible.value = false
  try {
    await deleteFormApp(app.id)
    ElMessage.success(t('common.deleteSuccess'))
    await loadList()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

onMounted(() => {
  void loadList()
  if (isSuperAdmin.value) void loadTenantOptions()
})
</script>

<template>
  <div class="app-manage">
    <AppGridToolbar
      v-model="keyword"
      :label="t('appearance.appName')"
      :placeholder="t('common.pleaseInput')"
      test-id="app-manage-search"
      @search="loadList"
    >
      <template #actions>
        <!-- Q40：超管租户筛选（候选沿既有 /form/app/manage/tenants）；普通租户不渲染 -->
        <span v-if="isSuperAdmin" class="app-manage__tenant-label">{{
          t('system.tenantShort')
        }}</span>
        <el-select
          v-if="isSuperAdmin"
          v-model="tenantFilter"
          class="app-manage__tenant-filter"
          :placeholder="t('tenantContext.all')"
          clearable
          data-testid="app-manage-tenant-filter"
          @change="handleTenantFilterChange"
        >
          <el-option
            v-for="tenant in tenantOptions"
            :key="tenant.id"
            :label="tenant.name"
            :value="tenant.id"
          />
        </el-select>
        <AppPerRowSetting v-model="perRow" :options="perRowOptions" />
        <!-- F2（D022-12～15）：应用整包导入入口；独立按钮权限 form:app:import -->
        <el-button
          v-perm="'form:app:import'"
          data-testid="app-import"
          style="width: 92px; padding: 0"
          @click="openImport"
          >{{ t('form.appCenter.importApp') }}</el-button
        >
        <el-button
          v-perm="'form:app:manage'"
          type="primary"
          data-testid="app-create"
          style="width: 80px; padding: 0"
          @click="openCreate"
          >{{ t('form.appCenter.newApp') }}</el-button
        >
      </template>
    </AppGridToolbar>

    <LoadErrorState v-if="loadError" :error="loadError" @retry="loadList" />
    <div v-else-if="errorMsg" class="app-manage__error">{{ errorMsg }}</div>

    <AppGrid
      v-else
      :apps="apps"
      :loading="loading"
      :per-row="perRow"
      show-actions
      show-form-count
      :show-tenant="userStore.superAdmin"
      @select="enterWorkspace"
      @command="onCardCommand"
      @create="openCreate"
    >
      <template #empty>
        <div data-testid="app-manage-empty">
          <p class="app-manage__empty-text">{{ emptyText }}</p>
        </div>
      </template>
    </AppGrid>

    <DetailDialog
      :model-value="dialogVisible"
      :title="dialogTitle"
      width="600px"
      appearance="design"
      class="app-manage-dialog"
      :class="{ 'app-manage-dialog--covered': appearancePickerActive }"
      :destroy-on-close="false"
      @update:model-value="dialogVisible = $event"
    >
      <el-form label-position="top">
        <el-form-item :label="t('appearance.appName')" required>
          <el-input
            v-model="form.name"
            data-testid="app-name-input"
            maxlength="100"
            :placeholder="t('common.pleaseInput')"
          />
        </el-form-item>
        <AppAppearancePicker
          v-model:icon="form.icon"
          v-model:color="form.color"
          @active="appearancePickerActive = $event"
        />
        <el-form-item v-if="scopeExpanded" :label="t('form.appCenter.fieldScope')">
          <el-radio-group v-model="form.visibleScopeType" data-testid="app-scope">
            <el-radio value="SPECIFIED">{{ t('form.appCenter.scopeSpecified') }}</el-radio>
            <el-radio value="ALL">{{ t('form.appCenter.scopeAllOption') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- 0.1.7 #1：可见范围按用户/部门/角色/岗位/租户多维度指定，任一维度命中即可见 -->
        <el-form-item
          v-if="scopeExpanded && form.visibleScopeType === 'SPECIFIED'"
          :label="t('form.appCenter.fieldScope')"
        >
          <AppScopePicker :model-value="scopeValue" @update:model-value="applyScope" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button
          link
          type="primary"
          class="app-manage-dialog__scope"
          :aria-expanded="scopeExpanded"
          @click="scopeExpanded = !scopeExpanded"
          >{{ t('form.appCenter.fieldScope') }}</el-button
        >
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </DetailDialog>

    <!-- Q39（471:17256）：删除应用确认——440 宽/圆角 12、文案带真实应用名与非空保护说明 -->
    <el-dialog
      v-model="deleteDialogVisible"
      :title="t('form.appCenter.deleteApp')"
      width="440px"
      class="app-delete-dialog"
      append-to-body
    >
      <p class="app-delete-dialog__text">
        {{ deleteTarget ? t('form.appCenter.deleteConfirm', { name: deleteTarget.name }) : '' }}
      </p>
      <template #footer>
        <el-button @click="deleteDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button class="app-delete-dialog__confirm" @click="handleDeleteConfirm">
          {{ t('common.delete') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- F2（D022-12～15）：导入两步走——上传选文件 → 预检（对象计数/意见表单冲突确认/
         字典处置/外部引用匹配）→ 确认导入 → 报告（新建/复用/置空清单）；另附历史导入记录。 -->
    <el-dialog
      v-model="importDialogVisible"
      :title="
        importStep === 'records'
          ? t('form.appCenter.importRecordsTitle')
          : t('form.appCenter.importTitle')
      "
      width="680px"
      class="bundle-import-dialog"
      append-to-body
    >
      <!-- 步骤一：选择导出包 -->
      <div v-if="importStep === 'upload'" class="bundle-import__upload">
        <input
          ref="importFileInput"
          type="file"
          accept=".json,application/json"
          class="bundle-import__input"
          data-testid="bundle-import-file"
          @change="onImportFileSelected"
        />
        <p class="bundle-import__hint">{{ t('form.appCenter.importUploadHint') }}</p>
        <div class="bundle-import__row">
          <el-button data-testid="bundle-choose-file" @click="chooseImportFile">
            {{ t('form.appCenter.importChooseFile') }}
          </el-button>
          <span v-if="importFile" class="bundle-import__filename" data-testid="bundle-import-name">
            {{ importFile.name }}
          </span>
        </div>
        <div class="bundle-import__row bundle-import__row--end">
          <el-button link type="primary" @click="openImportRecords">
            {{ t('form.appCenter.importRecordsView') }}
          </el-button>
          <el-button
            type="primary"
            data-testid="bundle-start-preview"
            :disabled="!importFile"
            :loading="previewing"
            @click="startPreview"
          >
            {{ t('form.appCenter.importStartPreview') }}
          </el-button>
        </div>
      </div>

      <!-- 步骤二：预检结果与冲突处理 -->
      <div v-else-if="importStep === 'preview' && previewResult" class="bundle-import__preview">
        <p class="bundle-import__meta">
          {{ previewResult.packageName }}
          <template v-if="previewResult.systemVersion">
            · {{ t('form.appCenter.importSystemVersion') }} {{ previewResult.systemVersion }}
          </template>
        </p>
        <p class="bundle-import__meta">
          {{
            t('form.appCenter.importCountLine', {
              dirs: previewResult.counts.dirs,
              forms: previewResult.counts.forms,
              processes: previewResult.counts.processes,
              opinions: previewResult.counts.opinionForms,
              dicts: previewResult.counts.dictTypes,
              actions: previewResult.counts.txnActions,
              queries: previewResult.counts.extQueries,
            })
          }}
        </p>
        <p class="bundle-import__meta">
          {{ t('form.appCenter.importAppLine', { name: previewResult.app.name }) }}
          <el-tag v-if="previewResult.app.nameConflict" size="small" type="warning">
            {{ t('form.appCenter.importNameConflict') }}
          </el-tag>
        </p>

        <template v-if="opinionConflicts.length > 0">
          <h4 class="bundle-import__section">
            {{ t('form.appCenter.importOpinionConflicts') }}
          </h4>
          <div
            v-for="opinion in opinionConflicts"
            :key="opinion.formKey"
            class="bundle-import__conflict"
          >
            <span class="bundle-import__conflict-name">{{ opinion.name || opinion.formKey }}</span>
            <el-input
              v-model="opinionKeyInputs[opinion.formKey]"
              :placeholder="t('form.appCenter.importNewKeyPlaceholder')"
              size="small"
              data-testid="bundle-opinion-key"
            />
          </div>
        </template>

        <template v-if="previewResult.dictTypes?.length">
          <h4 class="bundle-import__section">{{ t('form.appCenter.importDictActions') }}</h4>
          <div class="bundle-import__chips">
            <span
              v-for="dict in previewResult.dictTypes"
              :key="dict.code"
              class="bundle-import__chip"
            >
              {{ dict.code }}
              <el-tag
                size="small"
                :type="
                  dict.action === 'OCCUPIED'
                    ? 'warning'
                    : dict.action === 'REUSE'
                      ? 'info'
                      : 'success'
                "
              >
                {{ dictActionLabel(dict.action) }}
              </el-tag>
            </span>
          </div>
        </template>

        <template v-if="previewResult.externalRefs?.length">
          <h4 class="bundle-import__section">{{ t('form.appCenter.importExternalRefs') }}</h4>
          <div class="bundle-import__refs">
            <div
              v-for="(refItem, index) in previewResult.externalRefs"
              :key="`${refItem.kind}-${refItem.value}-${index}`"
              class="bundle-import__ref"
            >
              <el-tag size="small" :type="refItem.matched ? 'success' : 'danger'">
                {{
                  refItem.matched
                    ? t('form.appCenter.importMatchedYes')
                    : t('form.appCenter.importMatchedNo')
                }}
              </el-tag>
              <span class="bundle-import__ref-kind">{{ refItem.kind }}</span>
              <span class="bundle-import__ref-value">{{ refItem.value }}</span>
              <span v-if="refItem.matchedTo" class="bundle-import__ref-target">{{
                refItem.matchedTo
              }}</span>
              <span class="bundle-import__ref-location">{{ refItem.location }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 步骤三：导入报告 -->
      <div v-else-if="importStep === 'report' && importReport" class="bundle-import__report">
        <p class="bundle-import__meta">
          {{
            t('form.appCenter.importFinalApp', {
              name: importReport.finalAppName || importReport.packageName,
            })
          }}
        </p>
        <p class="bundle-import__meta">
          {{
            t('form.appCenter.importCreated', {
              forms: importReport.createdForms?.length ?? 0,
              processes: importReport.createdProcesses?.length ?? 0,
              opinions: importReport.createdOpinionForms?.length ?? 0,
              dicts: importReport.reusedDictTypes?.length ?? 0,
              actions: importReport.createdTxnActions?.length ?? 0,
              queries: importReport.createdExtQueries?.length ?? 0,
            })
          }}
        </p>
        <h4 class="bundle-import__section">{{ t('form.appCenter.importClearedTitle') }}</h4>
        <div v-if="importReport.clearedRefs?.length" class="bundle-import__refs">
          <div
            v-for="(refItem, index) in importReport.clearedRefs"
            :key="`${refItem.kind}-${refItem.originalValue}-${index}`"
            class="bundle-import__ref"
          >
            <el-tag size="small" type="warning">{{ refItem.kind }}</el-tag>
            <span class="bundle-import__ref-value">{{ refItem.originalValue }}</span>
            <span class="bundle-import__ref-location">{{ refItem.location }}</span>
          </div>
        </div>
        <p v-else class="bundle-import__hint">{{ t('form.appCenter.importClearedEmpty') }}</p>
      </div>

      <!-- 步骤四：历史导入记录 -->
      <div
        v-else-if="importStep === 'records'"
        v-loading="recordsLoading"
        class="bundle-import__records"
      >
        <p v-if="importRecords.length === 0" class="bundle-import__hint">
          {{ t('form.appCenter.importNoRecords') }}
        </p>
        <div v-else class="bundle-import__refs">
          <div v-for="record in importRecords" :key="record.id" class="bundle-import__ref">
            <span class="bundle-import__ref-kind">{{ record.createTime }}</span>
            <span class="bundle-import__ref-value">{{ record.packageName }}</span>
            <el-tag size="small" :type="record.result === 'SUCCESS' ? 'success' : 'danger'">
              {{ record.appName || record.result }}
            </el-tag>
            <el-button link type="primary" @click="downloadRecordReport(record)">
              {{ t('form.appCenter.importRecordDownload') }}
            </el-button>
          </div>
        </div>
      </div>

      <template #footer>
        <template v-if="importStep === 'upload'">
          <el-button @click="importDialogVisible = false">{{ t('common.cancel') }}</el-button>
        </template>
        <template v-else-if="importStep === 'preview'">
          <el-button data-testid="bundle-prev-step" @click="importStep = 'upload'">
            {{ t('form.appCenter.importPrev') }}
          </el-button>
          <el-button
            type="primary"
            data-testid="bundle-confirm"
            :disabled="!opinionKeysValid"
            :loading="confirming"
            @click="confirmImport"
          >
            {{ t('form.appCenter.importConfirm') }}
          </el-button>
        </template>
        <template v-else-if="importStep === 'report'">
          <el-button link type="primary" @click="openImportRecords">
            {{ t('form.appCenter.importRecordsView') }}
          </el-button>
          <el-button data-testid="bundle-download-report" @click="downloadCurrentReport">
            {{ t('form.appCenter.importDownloadReport') }}
          </el-button>
          <el-button type="primary" @click="importDialogVisible = false">
            {{ t('common.confirm') }}
          </el-button>
        </template>
        <template v-else>
          <el-button @click="importStep = 'upload'">
            {{ t('form.appCenter.importBackToUpload') }}
          </el-button>
          <el-button type="primary" @click="importDialogVisible = false">
            {{ t('common.confirm') }}
          </el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-manage {
  box-sizing: border-box;
  min-height: 100%;
  padding: var(--sw-space-20);
}
.app-manage__error {
  color: #f56c6c;
}
/* Q40：超管租户筛选（工具条 actions 槽内，宽度对齐筛选控件惯例） */
.app-manage__tenant-label {
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
  white-space: nowrap;
}
.app-manage__tenant-filter {
  width: 200px;
}
/* F2 导入对话框：上传/预检/报告/记录四步共用排版 */
.bundle-import__input {
  display: none;
}
.bundle-import__hint {
  margin: 0 0 12px;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
  line-height: 20px;
}
.bundle-import__meta {
  margin: 0 0 8px;
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
  line-height: 22px;
}
.bundle-import__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.bundle-import__row--end {
  justify-content: flex-end;
  margin-top: 16px;
}
.bundle-import__filename {
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
}
.bundle-import__section {
  margin: 16px 0 8px;
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
  font-weight: 600;
}
.bundle-import__conflict {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.bundle-import__conflict-name {
  flex: 0 0 auto;
  min-width: 160px;
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
}
.bundle-import__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bundle-import__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-regular);
  font-size: var(--sw-font-caption);
}
.bundle-import__refs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bundle-import__ref {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: var(--sw-font-caption);
  line-height: 20px;
}
.bundle-import__ref-kind {
  flex: 0 0 auto;
  color: var(--sw-text-secondary);
}
.bundle-import__ref-value {
  flex: 0 1 auto;
  overflow: hidden;
  color: var(--sw-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bundle-import__ref-target {
  flex: 0 0 auto;
  color: var(--sw-color-primary);
}
.bundle-import__ref-location {
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--sw-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
</style>

<style>
.el-overlay:has(.app-manage-dialog--covered) {
  visibility: hidden;
}
.app-manage-dialog.el-dialog {
  border-radius: 12px;
}
.app-manage-dialog .el-form-item {
  margin-bottom: 12px;
}
.app-manage-dialog .el-form-item__label {
  height: 22px;
  line-height: 22px;
  margin-bottom: 6px;
  padding: 0;
}
.app-manage-dialog .el-dialog__footer .app-manage-dialog__scope {
  margin-right: auto;
}
/* Q39（471:17256）：删除确认弹窗——440 宽、圆角 12，底栏取消/删除 80×32，删除 #C2303A。
   teleport 弹层样式落真实弹窗根（append-to-body → 全局块）。 */
.app-delete-dialog.el-dialog {
  border-radius: 12px;
  /* Q39（471:17256）原目标高 172（±1），内容自然高度不足时锁定外壳高度 */
  height: 172px;
  display: flex;
  flex-direction: column;
}
.app-delete-dialog .el-dialog__body {
  flex: 1;
  overflow: auto;
}
.app-delete-dialog .el-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.app-delete-dialog .el-dialog__footer .el-button {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
}
.app-delete-dialog .app-delete-dialog__confirm {
  background-color: #c2303a;
  border-color: #c2303a;
  color: #fff;
}
.app-delete-dialog .app-delete-dialog__confirm:not(:hover):not(:focus) {
  background-color: #c2303a;
  border-color: #c2303a;
  color: #fff;
}
</style>
